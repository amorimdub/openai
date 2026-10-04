#!/usr/bin/env python3
"""Preserve original public HTTP response bytes. No normalization or database import.
Run: python3 scripts/collect-raw-utilities-housing.py [--date YYYY-MM-DD] [source-slug ...]
Standard library only; overwrites selected snapshot files on an explicit rerun.
JSON inspection is limited to API errors, IDs, counts, and paging completeness.
"""
import concurrent.futures as cf
import argparse, hashlib, json, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1] / 'data/raw'
SNAPSHOT = datetime.now(timezone.utc).date().isoformat()
CCBY = 'https://creativecommons.org/licenses/by/4.0/'
CCBYSA = 'https://creativecommons.org/licenses/by-sa/4.0/'
SOURCES = []
def add(slug, publisher, licence, evidence, period, gaps, files=None, layers=None, metadata=None, expected=None, gated=None):
    SOURCES.append(dict(slug=slug,publisher=publisher,licence=licence,licence_evidence_url=evidence,original_period=period,gaps=gaps,files=files or [],layers=layers or [],metadata=metadata or [],prior_research_count=expected,gated=gated))
base='https://services-eu1.arcgis.com/pvZmdFc5up2jdiPm/arcgis/rest/services/Ireland_Gigabit_Statistics_Public_View/FeatureServer'
add('comreg-broadband','ComReg',CCBY,'https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson','Q2 2026 per 3 September release; API has no verified quarter field. Technical edits September 2026.',['Aggregate coverage does not establish individual premises availability or speed. Planned NBI metric differs from actual coverage.','Only counties and small areas selected; NUTS2/LEA/electoral divisions omitted as redundant geographical variants.','Northern Ireland not covered.'],layers=[('counties',base+'/1'),('small-areas',base+'/4')],metadata=[('item.json','https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson'),('service.json',base+'?f=pjson')])
add('uisce-water-zones','Uisce Eireann',CCBY,'https://www.water.ie/open-data','Q1 2026; population 27 March 2026; publisher updated 30 March 2026.',['No geometry, household service boundaries or connection information. Republic only.'],files=[('Q1-2026-Public-Water-Supply-Zone-Information.xlsx','https://water.widen.net/content/use17tawmb/original/Q1-2026-Public-Water-Supply-Zone-Information.xlsx?u=oephrt&download=true')],metadata=[('open-data.html','https://www.water.ie/open-data')],expected=692)
wfs='https://gis.epa.ie/geoserver/EPA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=EPA:DW_RAL'
add('epa-remedial-action-list','Environmental Protection Agency',CCBY,'https://data.gov.ie/dataset/environmental-protection-agency-remedial-action-list','Source reporting quarter unverified; catalogue harvest 3 October 2026 is not a reference date.',['Supply remediation points are not supply service areas or live notices. Native EPSG29902 retained.'],files=[('DW_RAL.geojson',wfs+'&maxFeatures=100000&outputFormat=application%2Fjson')],metadata=[('count.xml',wfs+'&resultType=hits'),('catalogue.json','https://data.gov.ie/api/3/action/package_show?id=environmental-protection-agency-remedial-action-list')],expected=35)
gsi='https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM/MapServer'
add('gsi-water-source-protection','Geological Survey Ireland',CCBY,'https://data.gov.ie/dataset/group-scheme-preliminary-source-protection-areas-ireland-roi-itm','Mixed individual report/study years (sample group scheme 2013); catalogue harvest September 2026 does not date studies.',['Hydrological source catchments are not household supply/membership polygons. Coverage is not every group scheme or source. Republic only. Native EPSG2157 retained.'],layers=[('public-source-protection',gsi+'/0'),('group-scheme-contribution',gsi+'/1')],metadata=[('service.json',gsi+'?f=pjson'),('group-catalogue.json','https://data.gov.ie/api/3/action/package_show?id=group-scheme-preliminary-source-protection-areas-ireland-roi-itm'),('public-catalogue.json','https://data.gov.ie/api/3/action/package_show?id=public-supply-source-protection-areas-ireland-roi-itm')])
add('housing-construction-q1-2026','Department of Housing, Local Government and Heritage',CCBYSA,'https://opendata.housing.gov.ie/dataset/social-housing-construction-status-report-q1-2026','Q1 2026; published 28 July 2026.',['CSV original bytes/encoding retained (prior research Windows1252). Summary lines/blank footer retained.','No geometry; no location inference. Scheme pipeline/delivery information, not homes available or eligibility. Republic 31 local authorities only.'],files=[('csr-q1-2026.csv','https://opendata.housing.gov.ie/dataset/b7fc5af6-71b4-4afb-b840-d71a248967b2/resource/e5f89137-be61-4038-a2d4-9e657b543f1f/download/csr-q1-2026.csv')],metadata=[('catalogue.json','https://opendata.housing.gov.ie/api/3/action/package_show?id=social-housing-construction-status-report-q1-2026')],expected=3208)
# One original GeoJSON variant per council dataset; no conversion or duplicate format.
def council_file(slug,publisher,name,url,period,gap,count):
    add(slug,publisher,CCBY,'https://data.smartdublin.ie/dataset/'+slug,period,[gap,'Local council coverage only; missing elsewhere means unknown, not absent.'],files=[(name,url)],metadata=[('catalogue.json','https://data.smartdublin.ie/api/3/action/package_show?id='+slug)],expected=count)
council_file('community-centres-dcc','Dublin City Council','030124-dataset-community-centres-halls.geojson','https://data.smartdublin.ie/dataset/b4b53dc7-4b1e-4918-81fb-7e8f2899c3db/resource/583fcdc1-4029-427d-8902-1ddc56c4a51f/download/030124-dataset-community-centres-halls.geojson','January 2024 file; temporal coverage 2019-2023; metadata June 2025.','Historic community/hall inventory, not availability/capacity.',99)
council_file('parks-gardens-and-public-spaces-dcc','Dublin City Council','030124-dataset-parks-gardens-and-public-spaces.geojson','https://data.smartdublin.ie/dataset/e18455ed-4ce8-43c1-a777-c6b0f560ec63/resource/4ccab0e7-122d-4406-9bf6-8745914f9590/download/030124-dataset-parks-gardens-and-public-spaces.geojson','January 2024 file; metadata June 2025.','Selected cultural park/garden/public-space points; not all park entrances/boundaries.',90)
council_file('parks-and-open-spaces-dcc','Dublin City Council','dcc_parks_strategy2016_park_classification.geojson','https://data.smartdublin.ie/dataset/6fde9a72-2f29-4e5a-b2aa-d02b2a2cdc2d/resource/42fec1fb-5d7e-4946-b996-982037782b3d/download/dcc_parks_strategy2016_park_classification.geojson','2016 park strategy survey; uploaded 2021, duplicate upload 2025 is not refreshed observation.','Old boundaries retained as dated context.',566)
council_file('community-facilities-dlr','Dun Laoghaire Rathdown County Council','community-features-dlr.geojson','https://data.smartdublin.ie/dataset/c0cfad09-e686-4934-af52-fdcfe41798f2/resource/01356d4a-57a0-4d65-83dd-9840db55e226/download/community-features-dlr.geojson','Resource 18 March 2025; metadata June 2025.','Mixed community/cultural/library categories, not a homogeneous community-centre inventory.',53)
council_file('main-parks-dlr','Dun Laoghaire Rathdown County Council','dlrmainparks.geojson','https://data.smartdublin.ie/dataset/a9de4c9e-06c8-4675-892f-e53add378685/resource/6c01b4c0-48e3-4150-99e9-a320b18b45a9/download/dlrmainparks.geojson','5 April 2022.','Only main parks; native third coordinate ordinate retained.',15)
council_file('street-lighting-dublin-city','Dublin City Council','dcc-public-lighting.geojson','https://data.smartdublin.ie/dataset/064a3764-84aa-48d0-ac43-f5b45f229584/resource/feef6a85-4895-4b86-b423-e2e68d92305c/download/dcc-public-lighting.geojson','2021 inventory; resource 7 December 2021.','Historic assets, not current functioning, measured illumination or safety.',45017)
council_file('dlr-public-lighting','Dun Laoghaire Rathdown County Council','public_lighting_2021_dlr.geojson','https://data.smartdublin.ie/dataset/d3b33221-e593-480c-9f2e-d38d98268683/resource/16402fae-b078-4451-91ed-baf2659df3cf/download/public_lighting_2021_dlr.geojson','19 April 2021 snapshot; GeoJSON upload 13 September 2022.','Council-maintained assets only. Historic location inventory, not illumination/status.',23530)
def council_layer(slug,publisher,url,period,gap,licence=CCBY,portal='https://data.smartdublin.ie'):
    add(slug,publisher,licence,portal+'/dataset/'+slug,period,[gap,'Local coverage, not nationally complete. Native service geometry retained.'],layers=[('assets',url)],metadata=[('catalogue.json',portal+'/api/3/action/package_show?id='+slug)])
council_layer('community-centres-2025-fcc','Fingal County Council','https://services5.arcgis.com/CI1e5PKQXvJgmJK8/arcgis/rest/services/Community_Centres__FCC/FeatureServer/0','Description April 2025; data edit 3 February 2026.','QUARANTINE: prior sample geometry reversed latitude/longitude and Lat/Long attributes reversed; original defect retained, do not map without review.')
council_layer('local-national-parks-and-play-grounds-fcc-20232','Fingal County Council','https://services5.arcgis.com/CI1e5PKQXvJgmJK8/arcgis/rest/services/Play_Areas/FeatureServer/0','Metadata April 2026; asset observation period unverified.','Play areas commonly named for parks; not complete park boundaries.')
council_layer('parks-sdcc1','South Dublin County Council','https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Parks/FeatureServer/0','Service data edit 31 May 2022; metadata September 2024.','Historic park boundaries.')
council_layer('multi-use-community-centres1','South Dublin County Council','https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Community_Sports_Youth_Centres/FeatureServer/2','Service data edit 13 April 2021; metadata September 2024.','Historic multi-use community/sports/youth centres.','https://creativecommons.org/publicdomain/zero/1.0/')
council_layer('public-lighting-fcc1','Fingal County Council','https://services5.arcgis.com/CI1e5PKQXvJgmJK8/arcgis/rest/services/Fingal_Public_Lighting_March_2024/FeatureServer/0','Native dataLastEditDate 15 March 2024; later service/item edits not observation dates.','Historic lighting assets, not functioning/illumination/safety.')
council_file('public-lighting-sdcc1','South Dublin County Council','public-lighting-sdcc.geojson','https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/7d16cce95976436083f4c9c35ea0b488/geojson?layers=0','Catalogue says 4 October 2023 snapshot.','Council maintained only. Catalogue metadata previously HTTP403; resource completeness not previously verified.',None)
council_layer('galway-city-community-centre-locations2','Galway City Council','https://services-eu1.arcgis.com/Zmea819kt4Uu8kML/arcgis/rest/services/CommunityCentresOpenData/FeatureServer/0','Service data edit 5 May 2021.','Only four published points in prior count; no claim of current city completeness.',portal='https://data.gov.ie')
council_layer('community-centres6','Roscommon County Council','https://services1.arcgis.com/0g8o874l5un2eDgz/arcgis/rest/services/CommunityFacilities/FeatureServer/0','Service data edit 31 May 2021.','Native CRS EPSG2157 despite catalogue prose WebMercator.',portal='https://data.gov.ie')
add('cork-city-parks','Cork City Council',CCBY,'https://data.corkcity.ie/dataset/cork-city-parks','GeoPackage resource 15 April 2026; underlying observation date unverified.',['Original GeoPackage preserved without parsing. Local coverage only.'],files=[('parks.gpkg','https://data.corkcity.ie/dataset/1dfa2796-66e9-423d-8e45-86df3b27a7cf/resource/852ef8ff-92a8-4cab-b667-a81d94c14b39/download/parks.gpkg')],metadata=[('catalogue.json','https://data.corkcity.ie/api/3/action/package_show?id=cork-city-parks')])
add('esb-network-capacity-reuse-gate','ESB Networks',None,'https://www.esbnetworks.ie/data-legal/copyright','July 2026 publication; underlying Q4 2025/load 2024-25.',['Copyright terms reserve rights and deny open public redistribution. No workbook collected in the open raw bundle.','Capacity planning is not home connection or reliability.'],metadata=[('copyright.html','https://www.esbnetworks.ie/data-legal/copyright'),('network-capacity-heatmap.html','https://www.esbnetworks.ie/services/get-connected/renewable-connection/network-capacity-heatmap')],gated={'resource_url':'https://media.esbnetworks.ie/media/docs/default-source/publications/customer-heatmap-download-july-2026.xlsx?sfvrsn=51c3b179_19','reason':'No verified open reuse permission. Do not treat public download as redistribution licence.'})

def utc(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def fetch(folder,name,url,role):
    # Successful original bodies only, written byte-for-byte; no json reserialization.
    error=None
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'IrelandDevdayRawSnapshot/1.0 (+public research)','Accept':'*/*'})
            with urllib.request.urlopen(req,timeout=100) as response:
                body=response.read(); headers={k:v for k,v in response.headers.items() if k.lower() not in ('set-cookie','cookie','authorization')}; final=response.url; status=response.status
            folder.mkdir(parents=True,exist_ok=True)
            path=folder/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(body)
            return dict(path=name,request_url=url,final_url=final,fetched_at_utc=utc(),http_status=status,response_headers=headers,bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),role=role),body
        except Exception as exc:
            error=str(exc)
            if attempt<2: time.sleep(attempt+1)
    return dict(path=None,request_url=url,fetched_at_utc=utc(),role=role,error=error),None

def arc_layer(folder,label,url):
    resources=[]; check={'layer':label,'url':url,'expected_count':None,'downloaded_count':0,'complete':False,'native_geometry':True,'all_source_fields':True}
    entry,body=fetch(folder,label+'/schema.json',url+'?f=pjson','schema'); resources.append(entry)
    if body is None: check['error']='schema download failed'; return resources,check
    schema=json.loads(body)
    if 'error' in schema: check['error']=schema['error']; return resources,check
    check['native_spatial_reference']=schema.get('extent',{}).get('spatialReference'); check['source_editing_info']=schema.get('editingInfo'); check['object_id_field']=schema.get('objectIdField') or next((v['name'] for v in schema.get('fields',[]) if v.get('type')=='esriFieldTypeOID'),None)
    entry,body=fetch(folder,label+'/count.json',url+'/query?'+urllib.parse.urlencode({'where':'1=1','returnCountOnly':'true','f':'json'}),'count'); resources.append(entry)
    if body is not None: check['expected_count']=json.loads(body).get('count')
    entry,body=fetch(folder,label+'/ids.json',url+'/query?'+urllib.parse.urlencode({'where':'1=1','returnIdsOnly':'true','f':'json'}),'ids'); resources.append(entry)
    if body is None: check['error']='ID enumeration failed'; return resources,check
    data=json.loads(body); ids=data.get('objectIds')
    if ids is None: check['error']=data.get('error','no objectIds response'); return resources,check
    ids=sorted(ids); check['enumerated_ids_count']=len(ids); check['object_id_field']=data.get('objectIdFieldName',check['object_id_field']); seen=[]; errors=[]
    # Chunk sorted ID ranges under common limits; short URLs avoid reverse-proxy URL-length failures. No outSR/field filtering.
    size=min(400,schema.get('maxRecordCount',400) or 400)
    jobs=[]
    for start in range(0,len(ids),size):
        chunk=ids[start:start+size]
        query=urllib.parse.urlencode({'where':f"{check['object_id_field']} >= {chunk[0]} AND {check['object_id_field']} <= {chunk[-1]}",'outFields':'*','returnGeometry':'true','f':'json'})
        jobs.append((f'{label}/page-{start//size+1:04}.json',url+'/query?'+query,len(chunk)))
    def page(job):
        name,q,expected=job; e,b=fetch(folder,name,q,'data-page'); outcome={'page':name,'expected_count':expected,'downloaded_count':0}
        values=[]
        if b is not None:
            parsed=json.loads(b); features=parsed.get('features',[]); outcome['downloaded_count']=len(features); outcome['exceeded_transfer_limit']=bool(parsed.get('exceededTransferLimit',False)); values=[x.get('attributes',{}).get(check['object_id_field']) for x in features]
            if parsed.get('error'): outcome['error']=parsed['error']
        else: outcome['error']=e.get('error')
        return e,outcome,values
    pagechecks=[]
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for e,outcome,values in pool.map(page,jobs): resources.append(e); pagechecks.append(outcome); seen.extend(values)
    check['pages']=pagechecks; check['downloaded_count']=len(seen); check['unique_downloaded_ids_count']=len(set(seen)); check['missing_ids_count']=len(set(ids)-set(seen)); check['complete']=check['expected_count']==len(ids)==len(seen)==len(set(seen)) and set(ids)==set(seen) and all(not x.get('error') and not x.get('exceeded_transfer_limit') and x['downloaded_count']==x['expected_count'] for x in pagechecks)
    return resources,check

def collect(source):
    s=dict(source); folder=ROOT/s['slug']/SNAPSHOT; folder.mkdir(parents=True,exist_ok=True)
    manifest={k:v for k,v in s.items() if k not in ('files','layers','metadata','gated')}
    manifest.update(source_urls=[url for name,url in s['files']+s['layers']],snapshot_directory_date=SNAPSHOT,collection_started_at_utc=utc(),resources=[],count_checks=[],transformations='None. Original HTTP body bytes preserved; API JSON inspection limited to errors, paging and IDs/counts.',reuse_status='open licence evidenced in prior research; source metadata saved when public GET succeeds' if s['licence'] else 'unresolved reuse gate; excluded from open bundle')
    for name,url in s['metadata']:
        entry,body=fetch(folder,name,url,'metadata-or-licence-evidence'); manifest['resources'].append(entry)
    if s['gated']:
        manifest.update(status='gated-not-downloaded',restricted_resource=s['gated'],complete=False)
    else:
        for name,url in s['files']:
            entry,body=fetch(folder,name,url,'original-data-file'); manifest['resources'].append(entry)
            if body is not None:
                check={'file':name,'expected_count_from_prior_research':s['prior_research_count'],'downloaded_count':None,'complete':None}
                if name.endswith('.geojson'):
                    try:
                        parsed=json.loads(body); check['downloaded_count']=len(parsed['features']); check['response_reported_total']=parsed.get('totalFeatures',parsed.get('numberMatched')); check['complete']=check['downloaded_count']==check['response_reported_total'] if isinstance(check['response_reported_total'],int) else (check['downloaded_count']==s['prior_research_count'] if s['prior_research_count'] is not None else None)
                    except Exception as exc: check['error']=str(exc)
                else: check['verification']='Original file downloaded whole; internal row counting deferred. Prior research count is separate evidence.'
                manifest['count_checks'].append(check)
        for label,url in s['layers']:
            entries,check=arc_layer(folder,label,url); manifest['resources'].extend(entries); manifest['count_checks'].append(check)
        data_resources=[r for r in manifest['resources'] if r['role'] in ('original-data-file','data-page')]
        failed=[r for r in manifest['resources'] if r.get('error') and r['role'] not in ('metadata-or-licence-evidence',)]
        checks=manifest['count_checks']; incomplete=any(c.get('complete') is False or c.get('error') for c in checks)
        manifest['complete']=bool(data_resources) and not failed and not incomplete
        manifest['record_completeness_verified']=bool(checks) and all(c.get('complete') is True for c in checks)
        manifest['status']='collected' if manifest['complete'] else 'incomplete'
        manifest['completeness_definition']='API feature counts/IDs checked. Whole downloaded XLSX/CSV/GPKG files preserved; internal record parsing deferred. Some stand-alone GeoJSON completeness uses prior-research counts or provider-reported totals.'
    manifest['collection_finished_at_utc']=utc(); manifest['total_saved_bytes']=sum(r.get('bytes',0) for r in manifest['resources']); manifest['saved_response_count']=sum(bool(r.get('path')) for r in manifest['resources']); (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'source':s['slug'],'status':manifest['status'],'bytes':manifest['total_saved_bytes'],'responses':manifest['saved_response_count'],'counts':[{k:c.get(k) for k in ('layer','file','expected_count','downloaded_count','complete','error') if k in c} for c in manifest['count_checks']]}),flush=True)
    return manifest

def main():
    global SNAPSHOT
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--date',default=SNAPSHOT,help='UTC snapshot directory date, default current UTC date'); parser.add_argument('sources',nargs='*'); args=parser.parse_args(); datetime.strptime(args.date,'%Y-%m-%d'); SNAPSHOT=args.date
    selected=set(args.sources); sources=[s for s in SOURCES if not selected or s['slug'] in selected]
    if selected-set(s['slug'] for s in sources): raise SystemExit('Unknown source selection')
    with cf.ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(collect,sources))
if __name__=='__main__': main()
