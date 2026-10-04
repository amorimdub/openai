from pathlib import Path
import urllib.request, urllib.parse, hashlib, json, datetime, concurrent.futures, time, zipfile, argparse
ROOT=Path(__file__).resolve().parents[3]/'data'/'raw'
parser=argparse.ArgumentParser(description='Preserve public raw Ireland market, transport and recreation snapshots')
parser.add_argument('--date', default=datetime.datetime.now(datetime.timezone.utc).date().isoformat(), help='Snapshot directory date YYYY-MM-DD (default current UTC)')
DAY=parser.parse_args().date
datetime.date.fromisoformat(DAY)
def utc(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def fetch(source, filename, url, period=None, license=None):
    directory=ROOT/source/DAY; directory.mkdir(parents=True,exist_ok=True)
    dest=directory/filename
    rec={'file':filename,'url':url,'fetch_started_utc':utc(),'period':period,'license_reuse':license,'status':'pending'}
    print('FETCH',source,filename,flush=True)
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'IrelandHackathonRawDataResearch/1.0'})
        with urllib.request.urlopen(request,timeout=120) as r:
            rec.update(http_status=r.status, final_url=r.url, response_headers={k:v for k,v in r.headers.items() if k.lower() in ['content-type','content-length','last-modified','etag','date','cache-control','content-encoding','content-disposition']})
            sha=hashlib.sha256();size=0
            with dest.with_suffix(dest.suffix+'.part').open('wb') as f:
                while True:
                    b=r.read(1024*1024)
                    if not b:break
                    f.write(b);sha.update(b);size+=len(b)
        temp=dest.with_suffix(dest.suffix+'.part');temp.replace(dest)
        rec.update(status='downloaded',fetch_finished_utc=utc(),bytes=size,sha256=sha.hexdigest())
        declared=rec['response_headers'].get('Content-Length',rec['response_headers'].get('content-length'))
        if declared:rec['content_length_matches']=int(declared)==size
        print('DONE',source,filename,size,flush=True)
    except Exception as e:
        rec.update(status='failed',fetch_finished_utc=utc(),error=str(e));print('FAILED',source,filename,str(e),flush=True)
    (directory/(filename+'.fetch.json')).write_text(json.dumps(rec,indent=2)+'\n')
    return rec
sources={
 'ppr':{'period':'2010-present; catalogue observed 2026-09-30; raw sale end previously checked 2026-09-25','license':'PSRA publisher reuse policy, attribution and conditions; not verified CC BY','license_url':'https://www.psr.ie/re-use-of-public-sector-information/'},
 'cso-sales':{'period':'monthly API tables; previous verified latest month 2026-07','license':'CC BY 4.0, CSO statistical information','license_url':'https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/'},
 'rtb-cso':{'period':'RIQ02 previously verified through 2025Q4, updated 2026-05-14','license':'CC BY 4.0 specific data.gov.ie resource; copyright RTB','license_url':'https://data.gov.ie/api/3/action/package_show?id=riq02-rtb-average-monthly-rent-report'},
 'nta':{'period':'GTFS schedule windows inside original ZIP; NaPTAN source date inside payload','license':'CC BY 4.0, National Transport Authority, fair-usage policy applies','license_url':'https://www.transportforireland.ie/transitData/PT_Data.html'},
 'sport-ireland-clubs':{'period':'current API view; catalogue initially December 2023, service previously last edited 2026-09-03','license':'CC BY 4.0, Get Ireland Active/Sport Ireland','license_url':'https://data.gov.ie/dataset/7d00a4bd-74e1-406c-8901-aa2969f6b481/resource/4c31ba9e-b55a-44f0-8c70-65b9edfa1f3d'},
 'sport-ireland-activities':{'period':'current API view; catalogue initially December 2023, service previously last edited 2026-09-03','license':'CC BY 4.0, Get Ireland Active/Sport Ireland','license_url':'https://data.gov.ie/dataset/getirelandactive_activitylocations'},
 'osm-geofabrik':{'period':'catalogue previously checked snapshot through 2026-10-03T20:20:50Z; confirm with saved catalogue','license':'OpenStreetMap ODbL; attribution and derived database terms','license_url':'https://www.openstreetmap.org/copyright'}}
jobs=[('ppr','PPR-ALL.zip','https://www.propertypriceregister.ie/website/npsra/ppr/npsra-ppr.nsf/Downloads/PPR-ALL.zip/$FILE/PPR-ALL.zip'),('nta','GTFS_All.zip','https://www.transportforireland.ie/transitData/Data/GTFS_All.zip'),('nta','NaPTAN.json','https://www.transportforireland.ie/transitData/Data/NaPTAN.json'),('osm-geofabrik','ireland-and-northern-ireland-latest.osm.pbf','https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf'),('osm-geofabrik','extract-catalogue.html','https://download.geofabrik.de/europe/ireland-and-northern-ireland.html'),('osm-geofabrik','ireland-and-northern-ireland-latest.osm.pbf.md5','https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf.md5')]
for code in ['HPM05','HPM07','HPM08','HPM02']:jobs.append(('cso-sales',code+'.json','https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/'+code+'/JSON-stat/2.0/en'))
jobs.append(('rtb-cso','RIQ02.json','https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en'))
for source,config in sources.items():jobs.append((source,'license-evidence.json' if source=='rtb-cso' else 'license-evidence.html',config['license_url']))
results={s:[] for s in sources}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
    pending={ex.submit(fetch,s,f,u,sources[s]['period'],sources[s]['license']):s for s,f,u in jobs}
    for future in concurrent.futures.as_completed(pending):results[pending[future]].append(future.result())
# The API bodies remain untouched. Parsing here is limited to pagination and completeness metadata.
for source,service in [('sport-ireland-clubs','GetIrelandActiveClubs'),('sport-ireland-activities','GetIrelandActiveActivityLocations')]:
    base='https://services-eu1.arcgis.com/CltcWyRoZmdwaB7T/arcgis/rest/services/'+service+'/FeatureServer/0'
    conf=sources[source];directory=ROOT/source/DAY
    meta=fetch(source,'layer-metadata-before.json',base+'?f=pjson',conf['period'],conf['license']);results[source].append(meta)
    count=fetch(source,'count-before.json',base+'/query?where=1%3D1&returnCountOnly=true&f=json',conf['period'],conf['license']);results[source].append(count)
    expected=json.loads((directory/'count-before.json').read_text()).get('count') if count['status']=='downloaded' else None
    downloaded=0;ids=[];gaps=[]
    if expected is not None:
        for offset in range(0,expected,2000):
            url=base+'/query?'+urllib.parse.urlencode({'where':'1=1','outFields':'*','returnGeometry':'true','orderByFields':'OBJECTID ASC','resultOffset':offset,'resultRecordCount':2000,'f':'json'})
            name=f'page-{offset:06d}.json';rec=fetch(source,name,url,conf['period'],conf['license']);results[source].append(rec)
            if rec['status']=='downloaded':
                body=json.loads((directory/name).read_text());features=body.get('features',[]);rec['feature_count']=len(features);downloaded+=len(features);ids.extend(x.get('attributes',{}).get('OBJECTID') for x in features)
                if body.get('error'):gaps.append(body['error'])
            else:gaps.append(name+' download failed')
    after=fetch(source,'layer-metadata-after.json',base+'?f=pjson',conf['period'],conf['license']);results[source].append(after)
    aftercount=fetch(source,'count-after.json',base+'/query?where=1%3D1&returnCountOnly=true&f=json',conf['period'],conf['license']);results[source].append(aftercount)
    stability=None
    if meta['status']==after['status']=='downloaded':
        stability=json.loads((directory/'layer-metadata-before.json').read_text()).get('editingInfo')==json.loads((directory/'layer-metadata-after.json').read_text()).get('editingInfo')
    countafter=json.loads((directory/'count-after.json').read_text()).get('count') if aftercount['status']=='downloaded' else None
    conf.update(expected_records=expected,downloaded_records=downloaded,unique_object_ids=len(set(ids)),count_after=countafter,service_edit_metadata_unchanged=stability,complete=expected==downloaded==len(set(ids))==countafter and stability,gaps=gaps)
for source,conf in sources.items():
    directory=ROOT/source/DAY;directory.mkdir(parents=True,exist_ok=True)
    gaps=conf.get('gaps',[])+[{'file':r['file'],'error':r.get('error')} for r in results[source] if r['status']!='downloaded']
    integrity={}
    if source=='ppr' and (directory/'PPR-ALL.zip').exists():
        with zipfile.ZipFile(directory/'PPR-ALL.zip') as z:integrity={'zip_members':z.namelist(),'zip_crc_error':z.testzip()}
    if source=='nta' and (directory/'GTFS_All.zip').exists():
        with zipfile.ZipFile(directory/'GTFS_All.zip') as z:integrity={'zip_members':z.namelist(),'zip_crc_error':z.testzip()}
    if source=='osm-geofabrik' and (directory/'ireland-and-northern-ireland-latest.osm.pbf').exists() and (directory/'ireland-and-northern-ireland-latest.osm.pbf.md5').exists():
        h=hashlib.md5()
        with (directory/'ireland-and-northern-ireland-latest.osm.pbf').open('rb') as f:
            for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
        expected=(directory/'ireland-and-northern-ireland-latest.osm.pbf.md5').read_text().split()[0];integrity={'publisher_md5':expected,'actual_md5':h.hexdigest(),'publisher_md5_matches':expected==h.hexdigest()}
    for r in results[source]:
        if source in ['cso-sales','rtb-cso'] and r['file'].endswith('.json') and r['status']=='downloaded':
            try:
                body=json.loads((directory/r['file']).read_text());r['source_updated']=body.get('updated');r['raw_cube_dimensions']=body.get('size');r['time_categories']={k:v.get('category',{}).get('index') for k,v in body.get('dimension',{}).items() if k.startswith('TLIST')}
            except Exception as e:gaps.append({'metadata_read_error':str(e),'file':r['file']})
    manifest={'collection_stage':'raw acquisition only; no normalization, statistics or database import','source':source,'observation_date':DAY,'manifest_created_utc':utc(),'scope':'Republic of Ireland; OSM extract includes Northern Ireland, unfiltered raw source preserved','dataset':conf,'responses':results[source],'integrity':integrity,'gaps':gaps,'local_only':True,'http_headers_note':'Only provenance/content headers retained; cookies and credentials excluded.'}
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
from verify_market_transport_qol import verify
verify(ROOT, DAY)
print('ALL_COMPLETE',flush=True)
