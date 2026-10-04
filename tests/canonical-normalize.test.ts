import { describe,test,expect } from 'bun:test';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { groupArcGisRings,arcGisGeometry,projectPosition } from '../src/common/geometry';
import { normalizeFeature,normalizePurchase,rawEntries,verifyRawAsset } from '../src/common/normalize';
import { matchingGeometryQuarantine, geometryHash, ruleHash, type GeometryQuarantineRule } from '../src/common/normalize-quarantine';
import { mergeNormalizationIndex, type NormalizationSummary } from '../src/common/normalize-index';
const context={snapshotId:'a'.repeat(64),path:'example/2026-10-04/page.json',index:0};
const ring=(x:number,y:number,size:number):[number,number][]=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];

describe('canonical geometry and privacy',()=>{
  test('ring containment preserves holes, nested islands and disconnected exterior without winding assumptions',()=>{
    const outer=ring(0,0,10),hole=ring(2,2,6),island=ring(3,3,1),apart=ring(20,0,5);
    const result=groupArcGisRings([hole,island,apart.reverse(),outer.reverse()]);
    expect(result.length).toBe(3);
    expect(result.map(p=>p.length).sort()).toEqual([1,1,2]);
    expect(result.find(p=>p.length===2)![1]).toEqual(hole);
  });
  test('unclosed, degenerate and malformed rings fail rather than being silently repaired',()=>{
    expect(()=>groupArcGisRings([[[0,0],[1,0],[1,1],[0,1]]])).toThrow('not closed');
    expect(()=>groupArcGisRings([[[0,0],[1,1],[2,2],[0,0]]])).toThrow('zero area');
    expect(()=>arcGisGeometry({x:NaN,y:53},4326)).toThrow('Non-finite');
    expect(()=>arcGisGeometry({x:-6,y:53},999999)).toThrow('Unsupported source CRS');
  });
  test('native ITM and Web Mercator project to geographic longitude latitude',()=>{
    const xy=projectPosition([600000,750000],2157);
    expect(xy[0]).toBeCloseTo(-8,7);expect(xy[1]).toBeCloseTo(53.5,7);
    const mercator=projectPosition([-667916.9447596414,6982997.920389787],3857);
    expect(mercator[0]).toBeCloseTo(-6,6);expect(mercator[1]).toBeCloseTo(53,6);
  });
  test('null childcare locations retained and contact fields never copied',()=>{
    const r=normalizeFeature('childcare',{attributes:{service_ref:'xx',service_name:'Example',email:'private',phone:'private',ecce:'TRUE',ccsp:'FALSE',ncs:true},geometry:null},2157,context);
    expect(r.locationStatus).toBe('unlocated');expect(r.geometry).toBeNull();expect(r.observedPeriod).toBeNull();
    expect(r.kind).toBe('service');if(r.kind==='service')expect(r.attributes.programmes).toEqual(['ecce','ncs']);
    expect(JSON.stringify(r)).not.toContain('private');
  });
  test('malformed childcare geometry fails without replacing it with attribute coordinates',()=>{
    expect(()=>normalizeFeature('childcare',{attributes:{service_ref:'x',service_name:'X',longitude:-6,latitude:53},geometry:{x:'bad',y:750000}},2157,context)).toThrow();
  });
  test('broadband suppressed numeric premises and planned-NBI metric remain distinct',()=>{
    const r=normalizeFeature('broadband-small-areas',{attributes:{SA_GUID_2022:'guid',SA_PUB2022:'097',Premise_Count_Public_View:'<200',Gigabit_Passed_PCT_Public_View:99,Gigabit_NBI_Passed_PCT_Public_View:100},geometry:{rings:[ring(-6,53,0.1)]}},4326,context);
    expect(r.kind).toBe('utility_area');if(r.kind==='utility_area'){
      expect(r.attributes.metrics[0].value).toBeNull();expect(r.attributes.metrics[0].sourceValue).toBe('<200');
      expect(r.attributes.metrics[1].status).toBe('reported');expect(r.attributes.metrics[2].status).toBe('planned');
      expect(r.attributes.geography.code).toBe('097');expect(r.observedPeriod).toBeNull();
    }
  });
});
function cubeFixture(){
  const id=['STATISTIC','TLIST(M1)','C03347V04034','C03346V04033','C03341V04028','C03348V04035'];
  const allCodes=[['HPM05C01','HPM05C02','HPM05C03','HPM05C04'],['202601','202602'],['-','01','02'],['-','01','02'],['01','02'],['-','40']];
  const dimension=Object.fromEntries(id.map((k,i)=>[k,{category:{index:allCodes[i],label:Object.fromEntries(allCodes[i].map(c=>[c,c])),...(i===0?{unit:{HPM05C03:{label:'Euro'},HPM05C04:{label:'Euro'}}}:{})}}]));
  return {id,size:allCodes.map(c=>c.length),dimension,value:Array(288).fill(125000)};
}
describe('market dimensions and complete exclusion accounting',()=>{
  test('HPM05 keeps all selected months/types/regions with source dimension codes, correct units and matching sample size',()=>{
    const cube=cubeFixture();cube.value.fill(18,0,72); // volume statistic block
    const cells=Array.from(normalizePurchase(cube,context)),records=cells.flatMap(c=>c.record?[c.record]:[]);
    expect(cells.length).toBe(288);expect(records.length).toBe(24);
    expect(cells.filter(c=>c.excludedReason).length).toBe(264);
    const r=records.find(r=>r.kind==='market_context' && r.attributes.dimensions.STATISTIC==='HPM05C03' && r.attributes.dimensions['TLIST(M1)']==='202602' && r.attributes.propertyType==='apartment' && r.attributes.geography.code==='40')!;
    expect(r.kind).toBe('market_context');if(r.kind==='market_context'){
      expect(r.attributes.sampleSize).toBe(18);expect(r.attributes.amountEur).toBe(125000);expect(r.attributes.unit).toBe('EUR');
      expect(r.observedPeriod).toBe('2026-02');expect(r.attributes.dimensions.C03346V04033).toBe('-');expect(r.attributes.dimensions.C03341V04028).toBe('02');
      expect(r.attributes.geography.codeSystem).toBe('CSO_HPM05_C03348V04035');
    }
    expect(new Set(records.map(r=>r.id)).size).toBe(24);
    expect(cells.some(c=>c.excludedReason==='volume_used_as_sample_size_only')).toBe(true);
  });
  test('missing observations and source zeros remain distinct from prices and every raw locator references its cell',()=>{
    const cube=cubeFixture(),initial=Array.from(normalizePurchase(cube,context)).filter(c=>c.record);
    (cube.value as any[])[initial[0].index]=null;cube.value[initial[1].index]=0;
    const selected=Array.from(normalizePurchase(cube,context)).flatMap(c=>c.record?[c.record]:[]);
    if(selected[0].kind==='market_context' && selected[1].kind==='market_context'){
      expect(selected[0].attributes.observationStatus).toBe('missing');expect(selected[0].attributes.amountEur).toBeNull();
      expect(selected[1].attributes.observationStatus).toBe('source_zero_unverified');expect(selected[1].attributes.amountEur).toBeNull();expect(selected[1].attributes.sourceValue).toBe(0);
    }
    expect(selected[0].raw.locator).toBe(`value/${initial[0].index}`);
  });
  test('unexpected cube order, cardinality and unit abort normalization',()=>{
    const wrong=cubeFixture();wrong.id.reverse();expect(()=>Array.from(normalizePurchase(wrong,context))).toThrow('dimension order');
    const short=cubeFixture();short.value.pop();expect(()=>Array.from(normalizePurchase(short,context))).toThrow('cardinality');
    const unit=cubeFixture();(unit.dimension.STATISTIC.category as any).unit.HPM05C03.label='Euro Million';expect(()=>Array.from(normalizePurchase(unit,context))).toThrow('unit');
  });
});
describe('untouched raw integrity',()=>{
  test('normalizes the three recorded raw manifest formats',()=>{
    for(const entry of [{file:'a',byte_size:1,requested_url:'https://example.com',fetch_completed_utc:'x'},{file:'a',bytes:1,url:'https://example.com',fetch_finished_utc:'x'},{path:'a',bytes:1,request_url:'https://example.com',fetched_at_utc:'x'}]) {
      const records=rawEntries({resources:[{...entry,sha256:'f'.repeat(64),http_status:200}]});expect(records[0].path).toBe('a');expect(records[0].bytes).toBe(1);expect(records[0].url).toBe('https://example.com');
    }
  });
  test('same-size tampering and size mismatch both block parsing; paths cannot escape the source directory',async()=>{
    const root=await mkdtemp(join(tmpdir(),'canonical-raw-'));
    try{
      await writeFile(join(root,'sample.json'),'one');const asset={path:'sample.json',bytes:3,sha256:createHash('sha256').update('one').digest('hex')};
      await verifyRawAsset(root,asset);await writeFile(join(root,'sample.json'),'two');
      await expect(verifyRawAsset(root,asset)).rejects.toThrow('hash mismatch');
      await writeFile(join(root,'sample.json'),'long');await expect(verifyRawAsset(root,asset)).rejects.toThrow('size mismatch');
      await expect(verifyRawAsset(root,{...asset,path:'../sample.json'})).rejects.toThrow('Unsafe');
    }finally{await rm(root,{recursive:true,force:true});}
  });
});


describe('frozen topology quarantine rules',()=>{
  test('a rule matches only its frozen asset, scope, identity, locator and canonical geometry; future corrected captures are retained',()=>{
    const record=normalizeFeature('childcare',{attributes:{service_ref:'xx',service_name:'Example'},geometry:{x:-6,y:53}},4326,context);
    if(record.kind!=='service')throw new Error('Expected service fixture');
    const rawSha='a'.repeat(64);
    const rule:GeometryQuarantineRule={id:'example-invalid-geometry',reason:'Ring Self-intersection[example]',match:{sourceId:record.sourceId,scope:record.scope,rawPath:record.raw.path,rawSha256:rawSha,externalId:record.externalId,rawLocator:record.raw.locator,canonicalGeometrySha256:geometryHash(record.geometry)},validator:{engine:'PostGIS',query:'ST_IsValidReason',evidence:'independent-test'}};
    expect(matchingGeometryQuarantine(record,rawSha,[rule])?.id).toBe(rule.id);
    expect(matchingGeometryQuarantine(record,'b'.repeat(64),[rule])).toBeUndefined();
    expect(matchingGeometryQuarantine({...record,scope:'other'},rawSha,[rule])).toBeUndefined();
    expect(matchingGeometryQuarantine({...record,externalId:'other'},rawSha,[rule])).toBeUndefined();
    expect(matchingGeometryQuarantine({...record,raw:{...record.raw,locator:'features/1'}},rawSha,[rule])).toBeUndefined();
    expect(matchingGeometryQuarantine({...record,geometry:{type:'Point',coordinates:[-6.1,53]}},rawSha,[rule])).toBeUndefined();
    expect(ruleHash(rule)).not.toBe(ruleHash({...rule,reason:'changed reason'}));
  });
});


describe('normalization index publication',()=>{
  const result=(source:string,scope:string,snapshotId:string):NormalizationSummary=>({source,sourceId:'comreg-broadband',scope,snapshotId,quality:{inputRecords:1,acceptedRecords:1,quarantinedRecords:0,unlocatedRecords:0,excludedRecords:0,exclusions:{}},files:{records:source+'/records.ndjson',manifest:source+'/records.ndjson.manifest.json',quarantine:source+'/quarantine.ndjson'},seconds:0});
  test('county-only updates preserve other scopes of the same source and unrelated adapter entries',()=>{
    const oldCounty=result('broadband-counties','counties','old'),small=result('broadband-small-areas','small-areas','small');
    const updated=result('broadband-counties','counties','new');
    const next=mergeNormalizationIndex({version:2,results:[oldCounty,small]},[updated],'2026-10-04T00:00:00Z');
    expect(next.results).toEqual([updated,small]);expect(next.generatedAt).toBe('2026-10-04T00:00:00Z');
    expect(mergeNormalizationIndex(undefined,[updated,small],'now').results).toEqual([updated,small]);
  });
  test('legacy index entries upgrade by adapter identity and duplicate scope writes are rejected',()=>{
    const updated=result('broadband-counties','counties','new'),old={...updated,sourceId:undefined,scope:undefined,snapshotId:'old'};
    expect(mergeNormalizationIndex({version:2,results:[old]},[updated],'now').results).toEqual([updated]);
    expect(()=>mergeNormalizationIndex(undefined,[updated,{...updated,snapshotId:'duplicate'}],'now')).toThrow('Duplicate');
  });
});
