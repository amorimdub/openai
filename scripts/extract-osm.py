#!/usr/bin/env python3
"""Stream a bounded, public-tag OSM view; never write to the frozen input.

Requires osmium==4.3.1. Geometry assembly uses libosmium node references and
multipolygon members. --ids independently emits primitive ID/version locators.
"""
import argparse
import collections
import json
import os
import tempfile
import osmium

ROAD_TYPES = {'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link'}
def classify(tags):
    if tags.get('shop') and tags.get('shop') not in {'no','vacant'}: return 'shops'
    if tags.get('amenity') == 'community_centre': return 'community_centres'
    if tags.get('leisure') == 'park': return 'parks'
    if tags.get('leisure') in {'garden','nature_reserve'} or tags.get('landuse') in {'forest','recreation_ground','village_green'}: return 'green_areas'
    if tags.get('highway') == 'cycleway' or (tags.get('highway') in {'path','track'} and tags.get('bicycle') == 'designated'): return 'cycle_network'
    if tags.get('highway') in ROAD_TYPES: return 'road_network'
    return None

def extract(path, ids_only=False):
    factory=osmium.geom.GeoJSONFactory()
    counts=collections.Counter()
    pending={}
    emitted=set()
    with tempfile.TemporaryDirectory(prefix='ireland-osm-locations-') as cache:
        processor=osmium.FileProcessor(path)
        if not ids_only:
            processor.with_locations('sparse_file_array,'+os.path.join(cache,'nodes.idx')).with_areas(osmium.filter.KeyFilter('shop','leisure','amenity','landuse'))
        processor.with_filter(osmium.filter.KeyFilter('shop','leisure','amenity','landuse','highway','bicycle'))
        for obj in processor:
            tags={t.k:t.v for t in obj.tags}
            category=classify(tags)
            if not category: continue
            if obj.is_area():
                primitive='way' if obj.from_way() else 'relation'
                original_id=obj.orig_id()
            else:
                primitive=obj.type_str()
                primitive={'n':'node','w':'way','r':'relation'}.get(primitive,primitive)
                original_id=obj.id
            key=f'{primitive}/{original_id}'
            locator=f'osm/{key}@{obj.version}'
            # Raw ID verification is a separate read, no derived cache is trusted.
            if ids_only:
                if not obj.is_area() and key not in emitted:
                    emitted.add(key)
                    yield {'locator':locator}
                continue
            metadata={'primitive':primitive,'id':str(original_id),'version':obj.version,'timestamp':obj.timestamp.isoformat(),'category':category,'locator':locator}
            public={k:v for k,v in tags.items() if k in {'name','shop','amenity','leisure','landuse','highway','bicycle','cycleway','access','addr:street','addr:housenumber','addr:city','addr:postcode','operator'}}
            metadata['tags']=public
            infrastructure=category in {'road_network','cycle_network'}
            if not infrastructure and (obj.is_relation() or (obj.is_way() and obj.is_closed())):
                pending[key]=metadata
                continue
            if obj.is_relation(): continue  # Route/member relations need a separate graph model.
            if obj.is_area() and infrastructure: continue
            if key in emitted: continue
            emitted.add(key)
            pending.pop(key,None)
            try:
                if obj.is_node(): geometry=json.loads(factory.create_point(obj))
                elif obj.is_way(): geometry=json.loads(factory.create_linestring(obj))
                else: geometry=json.loads(factory.create_multipolygon(obj))
                metadata['geometry']=geometry
            except Exception as error:
                metadata['error']='OSM geometry assembly failed: '+str(error)
            counts[category]+=1
            yield metadata
        for key,metadata in sorted(pending.items()):
            if key in emitted: continue
            metadata['error']='OSM selected area could not be assembled from complete rings and referenced members'
            counts['unassembled_area']+=1
            yield metadata
    if not ids_only:
        import sys
        print(json.dumps({'counts':dict(counts),'selected':sum(counts.values())}),file=sys.stderr)

def verify_locators(path, requested_path):
    """Re-read original primitives; require an exact type/ID/version match."""
    wanted=set()
    with open(requested_path,encoding='utf8') as records:
        for line in records:
            if not line.strip(): continue
            item=json.loads(line)
            wanted.add(item if isinstance(item,str) else item.get('raw',{}).get('locator',item.get('locator')))
    wanted.discard(None)
    expected=len(wanted)
    numeric_ids={int(locator.rsplit('/',1)[1].split('@',1)[0]) for locator in wanted}
    for obj in osmium.FileProcessor(path).with_filter(osmium.filter.IdFilter(numeric_ids)):
        primitive={'n':'node','w':'way','r':'relation'}.get(obj.type_str())
        wanted.discard(f'osm/{primitive}/{obj.id}@{obj.version}')
    result={'expected':expected,'verified':expected-len(wanted),'missing':len(wanted),'missingExamples':sorted(wanted)[:10]}
    print(json.dumps(result))
    return not wanted

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('path')
    parser.add_argument('--ids',action='store_true')
    parser.add_argument('--verify-locators',metavar='NDJSON')
    args=parser.parse_args()
    if args.verify_locators:
        raise SystemExit(0 if verify_locators(args.path,args.verify_locators) else 1)
    else:
        for item in extract(args.path,args.ids):
            print(json.dumps(item,ensure_ascii=False,separators=(',',':')))
