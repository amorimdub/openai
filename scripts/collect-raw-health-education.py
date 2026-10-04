import concurrent.futures, datetime, hashlib, json, pathlib, re, urllib.request, urllib.parse, urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/'data'/'raw'
DATE=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
SAFE_HEADERS={'content-type','content-length','content-encoding','last-modified','etag','cache-control','date','location','content-disposition','content-range','accept-ranges'}
def utc(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save_manifest(folder,m):
    (folder/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
def fetch(folder,m,url,name,role):
    req=urllib.request.Request(url,headers={'User-Agent':'IrelandHackathonRawResearch/1.0','Accept-Encoding':'identity'})
    begin=utc()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=70) as resp:
                body=resp.read(); status=resp.status; headers=dict(resp.headers.items()); final=resp.geturl()
            break
        except urllib.error.HTTPError as e:
            body=e.read(); status=e.code; headers=dict(e.headers.items()); final=e.geturl(); break
        except Exception:
            if attempt==2: raise
    headers={k:v for k,v in headers.items() if k.lower() in SAFE_HEADERS}
    (folder/name).write_bytes(body)
    m['resources'].append({'file':name,'role':role,'requested_url':url,'resolved_url':final,'fetch_started_utc':begin,'fetch_completed_utc':utc(),'http_status':status,'response_headers':headers,'byte_size':len(body),'sha256':hashlib.sha256(body).hexdigest()})
    save_manifest(folder,m)
    if status!=200: raise RuntimeError('HTTP '+str(status)+' '+url)
    return body

def query(layer,params): return layer+'/query?'+urllib.parse.urlencode(params)
CONFIGS=[
 {'source':'doe-schools-current','item':'e71d0ca28fc54513b9a169dac2ebc28d','service':'https://services-eu1.arcgis.com/9HteQxumPOXiqlpG/arcgis/rest/services/Schools_Map_WFL1/FeatureServer','layers':[0], 'reference_period':'Year=2026 reported in research; layer edit 2026-05-08; underlying census observation date unconfirmed','reuse_status':'unverified: exact item licenseInfo empty; local-only acquisition, publishing reuse gate unresolved'},
 {'source':'schools-historical','item':'df226b216e69428d8647ff8101d627a4','service':'https://services3.arcgis.com/ArIWe98F0BECP9pn/arcgis/rest/services/Schools_DeptEducationData/FeatureServer','layers':[0,1,2], 'reference_period':'2014/15; layer data edits 2015-11-23; historical mirror provenance not independently authenticated','reuse_status':'item explicitly CC BY 4.0; credits government departments; mirror provenance gate remains'},
 {'source':'pobal-childcare','item':'4bea2229af6b456ea362b3514b38d70a','service':'https://services8.arcgis.com/AF8wcIoCeDo33LsM/arcgis/rest/services/Childcare_Facilities_NEW/FeatureServer','layers':[2], 'reference_period':'underlying observation date unknown; layer edit 2026-09-15','reuse_status':'item explicitly CC BY 4.0'},
 {'source':'tusla-early-years','item':'41a791c10413419f9fea268ea07e016a','service':'https://services-eu1.arcgis.com/FKG93wmpArM17gAf/arcgis/rest/services/EarlyYearsProviders/FeatureServer','layers':[0], 'reference_period':'registration-derived GIS; layer edit 2025-07-09; active/current population unverified','reuse_status':'unverified: exact item licenseInfo empty; local-only acquisition, publishing reuse gate unresolved'},
 {'source':'hse-hospitals-2020','item':'feb34881088341bbbf80d86af6a4f333','service':'https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/HospitalsHSEIreland/FeatureServer','layers':[0], 'reference_period':'Health Atlas supplied March 2020; layer data edit 2020-04-14','reuse_status':'item explicitly CC BY 4.0'},
 {'source':'hse-gp-2020','item':'01cb04a1fab34c72a746dc660622fe73','service':'https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/GeneralPractitionersHSEIreland/FeatureServer','layers':[0], 'reference_period':'Health Atlas supplied March 2020; data edit 2020; records include individual GPs rather than deduplicated practices','reuse_status':'item explicitly CC BY 4.0; historical; sampled lat/lon attribute labels reversed; left untouched'},
 {'source':'cso-urban-areas-2022','item':'5468708d36454d1f95a3ff23cbaeb2f5','service':'https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer','layers':[5], 'reference_period':'Census 2022 urban statistical areas, generalised 20m; geography not every rural locality','reuse_status':'publisher item explicitly CC BY 4.0; CSO/Tailte Eireann attribution'},
]
def collect(c):
    folder=BASE/c['source']/DATE; folder.mkdir(parents=True,exist_ok=True)
    m={'source':c['source'],'snapshot_date':DATE,'started_utc':utc(),'scope':'Republic of Ireland','stage':'raw untouched HTTP response bodies only; metadata/count/IDs parsed solely for acquisition completeness','source_reference_period':c['reference_period'],'reuse_status':c['reuse_status'],'local_only':True,'resources':[],'layers':[],'completeness':{'status':'in_progress'}}
    try:
        item_url='https://www.arcgis.com/sharing/rest/content/items/'+c['item']+'?f=pjson'
        fetch(folder,m,item_url,'item-metadata.json','publisher item metadata and license evidence')
        m['license_evidence']={'file':'item-metadata.json','url':item_url,'field':'licenseInfo','assessment':c['reuse_status']}
        fetch(folder,m,c['service']+'?f=pjson','service-metadata.json','original service metadata')
        for lid in c['layers']:
            layer=c['service']+'/'+str(lid); prefix='layer-'+str(lid)
            meta=json.loads(fetch(folder,m,layer+'?f=pjson',prefix+'-metadata.json','original layer metadata'))
            before=json.loads(fetch(folder,m,query(layer,{'where':'1=1','returnCountOnly':'true','f':'json'}),prefix+'-count-before.json','original pre-download count response'))
            ids_body=fetch(folder,m,query(layer,{'where':'1=1','returnIdsOnly':'true','f':'json'}),prefix+'-ids.json','original object-ID response')
            ids=json.loads(ids_body).get('objectIds')
            if ids is None: raise RuntimeError('No objectIds '+prefix)
            oid=json.loads(ids_body).get('objectIdFieldName') or meta.get('objectIdField')
            requested=set(ids); returned=[]; pages=[]
            for i in range(0,len(ids),250):
                page_name=prefix+'-records-'+str(i//250+1).zfill(4)+'.json'
                page_url=query(layer,{'objectIds':','.join(str(x) for x in ids[i:i+250]),'outFields':'*','returnGeometry':'true','f':'json'})
                page=json.loads(fetch(folder,m,page_url,page_name,'original native-CRS feature response; all original fields'))
                if 'error' in page: raise RuntimeError('ArcGIS error '+json.dumps(page['error']))
                feats=page.get('features',[])
                returned.extend(f['attributes'][oid] for f in feats)
                pages.append({'file':page_name,'requested_id_count':len(ids[i:i+250]),'returned_count':len(feats),'exceeded_transfer_limit':page.get('exceededTransferLimit',False)})
            after=json.loads(fetch(folder,m,query(layer,{'where':'1=1','returnCountOnly':'true','f':'json'}),prefix+'-count-after.json','original post-download count response'))
            count_before=before.get('count'); count_after=after.get('count')
            complete=count_before==count_after==len(ids)==len(requested)==len(returned)==len(set(returned)) and requested==set(returned) and not any(p['exceeded_transfer_limit'] for p in pages)
            m['layers'].append({'layer_id':lid,'url':layer,'object_id_field':oid,'native_spatial_reference':meta.get('extent',{}).get('spatialReference'),'source_editing_info':meta.get('editingInfo'),'expected_count':count_before,'post_download_count':count_after,'object_id_count':len(ids),'downloaded_count':len(returned),'downloaded_unique_id_count':len(set(returned)),'missing_id_count':len(requested-set(returned)),'unexpected_id_count':len(set(returned)-requested),'pages':pages,'complete_for_exposed_layer':complete,'notes':'Completeness is against exposed layer IDs at retrieval; it does not prove real-world/current-service coverage. No record normalization performed.'})
            save_manifest(folder,m)
        m['expected_count']=sum(x['expected_count'] for x in m['layers'])
        m['downloaded_count']=sum(x['downloaded_count'] for x in m['layers'])
        m['completeness']={'status':'complete' if all(x['complete_for_exposed_layer'] for x in m['layers']) else 'incomplete','basis':'pre/post counts, original ID response and unique returned IDs match; all pages checked for transfer limits; no canonical parsing'}
    except Exception as e:
        m['completeness']={'status':'failed_or_partial','error':str(e)}
    m['completed_utc']=utc(); save_manifest(folder,m)
    print(json.dumps({'source':c['source'],'expected':m.get('expected_count'),'downloaded':m.get('downloaded_count'),'completeness':m['completeness'],'folder':str(folder)}),flush=True)
    return m
if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Collect original health/education ArcGIS snapshots without normalization.')
    parser.add_argument('--snapshot-date',default=DATE,type=lambda value:datetime.date.fromisoformat(value).isoformat(),help='ISO snapshot folder date; defaults to current UTC date')
    parser.add_argument('--output-root',type=pathlib.Path,default=BASE,help='Raw source root; defaults to repository data/raw')
    args=parser.parse_args()
    DATE=args.snapshot_date
    BASE=args.output_root.resolve()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(collect,CONFIGS))
