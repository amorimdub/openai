import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { Store, sha256 } from '../src/store';
import { createApp } from '../src/app';
import { exportSource } from '../src/exporter';
import type { DataRecord } from '../src/schema';
const stores:Store[]=[], paths:string[]=[];
afterEach(()=>{ for(const store of stores.splice(0)) store.close(); for(const path of paths.splice(0)) rmSync(path,{recursive:true,force:true}); });
function store() {const s=new Store(); stores.push(s);return s;}
function service(externalId='1',sourceId='fixture'):DataRecord {return {version:1,id:`${sourceId}:${externalId}`,externalId,sourceId,scope:'national',name:'Recorded childcare',kind:'service',category:'childcare',locationStatus:'located',geometry:{type:'Point',coordinates:[-6.26,53.35]},attributes:{access:'unknown'}};}
function snapshot(records:DataRecord[],sourceId='fixture',scope='national') {
  const text=records.map(r=>JSON.stringify(r)).join('\n')+(records.length?'\n':'');
  return {text,manifest:{version:1,snapshotId:'fixture-snapshot',sourceId,scope,publisher:'Test publisher',sourceUrl:'https://example.org/data',license:'CC-BY-4.0',licenseEvidenceUrl:'https://example.org/license',attribution:'Test publisher',fetchedAt:'2026-10-04T12:00:00.000Z',sourceModifiedAt:null,observedPeriod:null,geography:'Republic of Ireland',coverage:'partial',limitations:['Test records only'],recordCount:records.length,sha256:sha256(text),format:'ndjson'}};
}
const preferences=(ids=['education.childcare'])=>({version:1,location:{longitude:-6.26,latitude:53.35},criteria:ids.map(id=>({id,importance:'preferred',parameters:{}}))});
async function request(s:Store,path:string,input:unknown) {return createApp(s).request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});}
function load(s:Store,records:DataRecord[],sourceId='fixture',scope='national') {const v=snapshot(records,sourceId,scope);return s.import(v.text,v.manifest);}

describe('canonical import interface',()=>{
  test('reimport is idempotent; replacement removes old rows only in its source/scope',()=>{
    const s=store();load(s,[service('1'),service('2')]);load(s,[service('1'),service('2')]);expect(s.records().length).toBe(2);
    load(s,[service('1','other')],'other');load(s,[service('3')]);expect(s.records().map(r=>r.id)).toEqual(['fixture:3','other:1']);
    load(s,[]);expect(s.records().map(r=>r.id)).toEqual(['other:1']);
  });
  test('checksum, malformed records and duplicates preserve last accepted snapshot',()=>{
    const s=store();load(s,[service()]);const bad=snapshot([service('2')]);
    expect(()=>s.import(bad.text+' ',bad.manifest)).toThrow('checksum');
    const malformed=JSON.stringify({...service('2'),geometry:{type:'Point',coordinates:[53.35,-6.26]}})+'\n';
    expect(()=>s.import(malformed,{...bad.manifest,sha256:sha256(malformed)})).toThrow();
    const duplicate=snapshot([service('2'),service('2')]);expect(()=>s.import(duplicate.text,duplicate.manifest)).toThrow('Duplicate');
    expect(s.records().map(r=>r.id)).toEqual(['fixture:1']);expect(s.manifests()[0].recordCount).toBe(1);
  });
});
describe('HTTP preferences and evidence',()=>{
  test('accepts one, seven and more than seven selected criteria without a cap',async()=>{
    const s=store(),app=createApp(s), registry=await (await app.request('/criteria')).json();
    for(const n of [1,7,registry.criteria.length]) {
      const response=await request(s,'/layers',preferences(registry.criteria.slice(0,n).map((c:any)=>c.id)));
      expect(response.status).toBe(200);expect((await response.json()).layers.length).toBe(n);
    }
  });
  test('rejects duplicate, unknown, incompatible parameters and malformed JSON',async()=>{
    const s=store();expect((await request(s,'/layers',preferences(['education.childcare','education.childcare']))).status).toBe(400);
    expect((await request(s,'/layers',preferences(['unknown']))).status).toBe(400);
    const p=preferences();p.criteria[0].parameters={maximumMinutes:30};expect((await request(s,'/layers',p)).status).toBe(400);
    expect((await createApp(s).request('/layers',{method:'POST',body:'{'})).status).toBe(400);
    expect((await request(s,'/layers',preferences([]))).status).toBe(400);
  });
  test('selected criteria create matching layers and retain unknown for missing categories',async()=>{
    const s=store();load(s,[service()]);const response=await request(s,'/layers',preferences(['education.childcare','quality_of_life.parks']));const body=await response.json();
    expect(body.layers[0].data.features[0].id).toBe('fixture:1');expect(body.layers[0].sources[0].license).toBe('CC-BY-4.0');expect(body.layers[1].evidenceStatus).toBe('unknown');expect(body.layers[1].data.features).toEqual([]);
  });
  test('travel minutes stay unknown even with a hospital exactly on the origin; missing evidence cannot make a ranking',async()=>{
    const s=store();load(s,[service(),{...service('2'),category:'hospital'} as DataRecord]);const response=await request(s,'/assess',preferences(['education.childcare','health.hospital']));const body=await response.json();
    expect(body.results[0].score).toBe(100);expect(body.results[1].score).toBeNull();expect(body.aggregate.score).toBeNull();expect(body.aggregate.weightedCoverage).toBe(0.5);expect(body.aggregate.rankingReady).toBe(false);expect(body.aggregate.scoreBounds).toEqual({minimum:50,maximum:100});
    const partial=await (await request(s,'/assess',preferences())).json();expect(partial.aggregate.rankingReady).toBe(false);expect(partial.verticals[0].vertical).toBe('education');
  });
  test('child age suitability, property utility connections and bedroom market categories are not inferred',async()=>{
    const s=store();load(s,[service(),{version:1,id:'fixture:market',externalId:'market',sourceId:'fixture',scope:'national',name:'Area median',kind:'market_context',geometry:null,attributes:{placeId:'town',tenure:'rent',statistic:'median',amountEur:1200,period:'2026-Q1',propertyType:'all',bedrooms:1,sampleSize:100,definition:'Historical rents',suppressed:false}}]);
    const p:any=preferences(['education.childcare','utilities.broadband','budget.rent']);p.location.placeId='town';p.criteria[0].parameters={childAge:2};p.criteria[2].parameters={bedrooms:3};
    const body=await (await request(s,'/assess',p)).json();expect(body.results.every((r:any)=>r.score===null)).toBe(true);expect(body.results[2].context).toEqual([]);expect(body.results[2].evidenceStatus).toBe('unknown');
  });
});
describe('source export interface',()=>{
  test('pages object IDs, limits public fields and produces a hash-valid importable snapshot',async()=>{
    const dir=mkdtempSync('/private/tmp/ireland-export-test-');paths.push(dir);const file=`${dir}/pobal.ndjson`;const requested:number[]=[];
    const fetcher=(async (input:any)=>{
      const url=new URL(String(input));const ids=url.searchParams.get('objectIds');let body:any;
      if(!url.pathname.endsWith('/query')) body={objectIdField:'OBJECTID',editingInfo:{lastEditDate:1600000000000}};
      else if(url.searchParams.has('returnIdsOnly')) body={objectIds:Array.from({length:405},(_,i)=>i+1)};
      else if(url.searchParams.has('returnCountOnly')) body={count:405};
      else {const batch=ids!.split(',').map(Number);requested.push(batch.length);expect(url.searchParams.get('outFields')).not.toContain('email');body={type:'FeatureCollection',features:batch.map(id=>({type:'Feature',geometry:id===405?null:{type:'Point',coordinates:[-6.26,53.35]},properties:{OBJECTID:id,service_name:`Childcare ${id}`,service_ref:`ref${id}`,eircode:null,organisation_type:null,ecce:'Yes',ncs:'No',email:'PRIVATE'}}))};}
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    const manifest=await exportSource('pobal',file,fetcher);expect(requested).toEqual([200,200,5]);expect(manifest.recordCount).toBe(405);expect(manifest.dataQuality).toEqual({recordsWithGeometry:404,recordsWithoutGeometry:1});
    const raw=await Bun.file(`${file}.source.json`).text();expect(raw).not.toContain('PRIVATE');expect(raw).not.toContain('email');
    const s=store();s.import(await Bun.file(file).text(),await Bun.file(`${file}.manifest.json`).json());expect(s.records().length).toBe(405);expect(s.records().find(r=>r.externalId==='405')?.geometry).toBeNull();
  });
  test('refuses truncated enumeration before producing accepted data',async()=>{
    const dir=mkdtempSync('/private/tmp/ireland-export-test-');paths.push(dir);
    const fetcher=(async(input:any)=>{const url=new URL(String(input));return new Response(JSON.stringify(!url.pathname.endsWith('/query')?{objectIdField:'OBJECTID'}:url.searchParams.has('returnIdsOnly')?{objectIds:[1]}:{count:2}));}) as typeof fetch;
    expect(exportSource('pobal',`${dir}/snapshot.ndjson`,fetcher)).rejects.toThrow('differs');
  });
});
