import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {commonRecordSchema,type CommonRecord} from '../src/common/schema';

// Usage: bun run scripts/verify-expanded-api.ts BASE_URL OUTPUT EXPECTED_ACTIVE_RECORD_COUNT
const baseUrl=(process.argv[2]??'http://127.0.0.1:3080').replace(/\/$/,'');
const output=process.argv[3]??'docs/research/expanded-api-verification.json';
const expectedRecords=Number(process.argv[4]);
if(!Number.isInteger(expectedRecords)||expectedRecords<1)throw new Error('Pass independently observed expected active record count as argument 4');
const evidence:{name:string;passed:boolean;durationMs:number;details?:unknown;error?:string}[]=[];
function assert(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
async function check(name:string,run:()=>Promise<unknown>){const start=performance.now();try{evidence.push({name,passed:true,durationMs:Math.round(performance.now()-start),details:await run()});evidence.at(-1)!.durationMs=Math.round(performance.now()-start);}catch(error){evidence.push({name,passed:false,durationMs:Math.round(performance.now()-start),error:error instanceof Error?error.message:String(error)});}const last=evidence.at(-1)!;console.log(JSON.stringify({check:last.name,passed:last.passed,durationMs:last.durationMs,...(last.error?{error:last.error}:{})}));}
async function request(path:string,options?:RequestInit){const response=await fetch(baseUrl+path,{...options,signal:AbortSignal.timeout(60000)});const text=await response.text();let body:any;try{body=JSON.parse(text);}catch{body={nonJsonResponse:text.slice(0,200)};}return {status:response.status,body};}
async function ok(path:string,options?:RequestInit){const result=await request(path,options);assert(result.status===200,`${path}: ${result.status} ${JSON.stringify(result.body).slice(0,500)}`);return result.body;}
const query=(fields:Record<string,string|number>)=>'?' + new URLSearchParams(Object.entries(fields).map(([key,value])=>[key,String(value)]));
const post=(body:unknown):RequestInit=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const bbox='-11,51,-5,56';
let status:any,registry:any;
const provenance=(body:any,records:any[])=>{assert(body.sources.length>0,'Source evidence missing');for(const record of records){const r=record.properties??record;assert(r.raw?.path&&r.raw?.locator&&r.snapshotId,'Raw provenance missing');assert(body.sources.some((s:any)=>s.snapshotId===r.snapshotId),'Record source snapshot missing');assert(Object.hasOwn(r,'observedPeriod'),'Observation period missing (explicit null is allowed)');}};

await check('health, exact active count, source accounting and reuse gates',async()=>{
  const health=await ok('/health');assert(health.status==='ok'&&health.version===2,'Expected common API health');
  const ready=await ok('/ready');
  const openapi=await ok('/openapi.json');
  assert(openapi.openapi==='3.1.0'&&openapi.components?.schemas&&openapi.paths?.['/context'],'OpenAPI 3.1 contract/models missing');
  status=await ok('/data-status');registry=await ok('/criteria');
  assert(ready.status==='ready'&&ready.totalRecords===expectedRecords&&ready.activeSourceScopes===status.sources.length,'Readiness did not prove loaded database and active source counts');
  assert(status.totalRecords===expectedRecords,`Expected ${expectedRecords}, observed ${status.totalRecords}`);
  assert(status.sources.reduce((n:number,s:any)=>n+s.recordCount,0)===status.totalRecords,'Source counts do not equal active count');
  assert(status.sources.every((s:any)=>s.reuseStatus==='approved'&&s.coverage!=='accepted'),'Unexpected unapproved reuse or coverage');
  assert(status.rankingReady===false&&status.missingDataMeans==='unknown_not_absent','Incomplete ranking or unknown policy lost');
  for(const id of ['doe-schools-current','tusla-early-years','tusla-county-register','esb-network-capacity-reuse-gate'])assert(status.adapterRegistry.sources.some((s:any)=>s.rawSourceId===id&&s.status==='reuse_gated'),`Reuse gate missing: ${id}`);
  for(const id of ['osm-geofabrik','ppr'])assert(status.adapterRegistry.sources.some((s:any)=>s.rawSourceId===id&&['parsed','partially_parsed','deferred'].includes(s.status)),`Dedicated source model status missing: ${id}`);
  return {readiness:ready,openapi:{version:openapi.openapi,schemaNames:Object.keys(openapi.components.schemas)},totalRecords:status.totalRecords,activeSnapshots:status.sources.length,criteria:registry.criteria.length,sources:status.sources.map((s:any)=>({sourceId:s.sourceId,scope:s.scope,recordCount:s.recordCount,period:s.observedPeriod,quality:s.quality})),rankingReady:status.rankingReady};
});
await check('hospital, GP and all school levels have canonical locations and dated provenance',async()=>{
  const results=[];
  for(const category of ['hospital','gp','primary_school','secondary_school','special_school']){
    const body=await ok('/features'+query({bbox,categories:category,limit:5}));
    const records=body.data.features;assert(records.length>0,`No ${category} locations`);provenance(body,records);
    assert(records.every((f:any)=>f.properties.category===category&&f.properties.kind==='service'&&f.geometry.type==='Point'),'Unexpected service kind, category or geometry');
    assert(records.every((f:any)=>f.properties.observedPeriod==='2020-03'||f.properties.observedPeriod==='2014/15'),'Historical source vintage disappeared');
    results.push({category,returned:records.length,sourceIds:body.sources.map((s:any)=>s.sourceId),periods:[...new Set(records.map((f:any)=>f.properties.observedPeriod))]});
  }return results;
});
await check('airports and transport stops preserve mode classifications and radius distances',async()=>{
  const airports=await ok('/features'+query({bbox,categories:'airport',limit:20}));
  assert(airports.data.features.length>0,'No scheduled airport observations');provenance(airports,airports.data.features);
  const stops=await ok('/features'+query({longitude:-6.2603,latitude:53.3498,radiusM:10000,categories:'transport_stop',limit:10}));
  assert(stops.data.features.length===10,'Expected ten directory stops near Dublin');provenance(stops,stops.data.features);
  const distances=stops.data.features.map((f:any)=>f.properties.recordedGeometryDistanceM);
  assert(distances.every((d:number,i:number)=>Number.isFinite(d)&&d>=0&&d<=10000&&(i===0||d>=distances[i-1])),'Transport distances are not bounded and ordered');
  assert(stops.data.features.every((f:any)=>f.properties.attributes.serviceType&&f.properties.observedPeriod==='2026-10-01'),'Directory classification or vintage lost');
  return {airports:airports.data.features.length,stopCount:stops.data.features.length,stopDistancesM:distances};
});
await check('expanded local facilities, lights and water layers are available without connection claims',async()=>{
  const results=[];
  for(const category of ['parks','community_centres','activities','street_lighting','water_supply_remediation','water_source_protection','group_water_source_protection','playgrounds']){
    const body=await ok('/features'+query({bbox,categories:category,limit:3}));const records=body.data.features;
    assert(records.length>0,`No ${category} records`);provenance(body,records);
    assert(records.every((f:any)=>f.properties.category===category),'Wrong category returned');
    if(category==='street_lighting')assert(records.every((f:any)=>f.properties.kind==='infrastructure'&&f.properties.attributes.status==='unknown'),'Lights imply unverified operating state');
    if(category.endsWith('source_protection'))assert(records.every((f:any)=>f.properties.geometryMeaning==='source_protection_boundary'),'Water protection mislabelled as served-premises boundary');
    results.push({category,returned:records.length,sourceIds:body.sources.map((s:any)=>s.sourceId),kinds:[...new Set(records.map((f:any)=>f.properties.kind))]});
  }return results;
});
await check('pagination across expanded scopes remains bounded and rejects changed query',async()=>{
  const results=[];
  const queries:Record<string,string|number>[]=[{bbox,limit:2},{bbox,categories:'parks',limit:2},{bbox,categories:'street_lighting',limit:2}];
  for(const fields of queries){
    const first=await ok('/features'+query(fields));assert(first.data.features.length===2&&first.nextCursor,'First page or cursor missing');
    assert(first.nextCursor.length<4096,`Unusable expanded cursor of ${first.nextCursor.length} characters`);
    const second=await ok('/features'+query({...fields,cursor:first.nextCursor}));assert(second.data.features.length===2,'Second page missing');
    const ids=[...first.data.features,...second.data.features].map((f:any)=>f.id);assert(new Set(ids).size===4,'Pages overlap');
    const invalid=await request('/features'+query({...fields,limit:3,cursor:first.nextCursor}));assert(invalid.status===400,'Changed-limit cursor accepted');
    results.push({category:fields.categories??'all',cursorLength:first.nextCursor.length,uniqueIds:ids.length});
  }return results;
});
await check('rental source example, exact bedroom filter and range semantics',async()=>{
  const fields={geographyCode:'120500',geographyCodeSystem:'CSO_RIQ02_C03004V03625',tenure:'rent',period:'2025Q4',propertyType:'apartment',limit:25};
  const exact=await ok('/market-context'+query({...fields,bedrooms:2}));provenance(exact,exact.records);
  assert(exact.records.length===1,'Two-bedroom query should return one original category');
  const record=exact.records[0];assert(record.attributes.amountEur===2283.59&&record.attributes.unit==='EUR/month'&&record.attributes.bedroomClass==='02','Published rent example changed');
  const ranges=await ok('/market-context'+query({...fields,bedroomClass:'08'}));
  assert(ranges.records.length>0&&ranges.records.every((r:any)=>r.attributes.bedrooms===null),'Four-plus class falsely became four exact bedrooms');
  const four=await ok('/market-context'+query({...fields,bedrooms:4}));assert(four.records.length===0,'Four-plus rent falsely matched exactly four bedrooms');
  const missing=await ok('/market-context'+query({...fields,geographyCode:'does-not-exist'}));assert(missing.records.length===0&&missing.evidenceStatus==='context_only','Missing market source not kept unknown');
  return {amountEur:record.attributes.amountEur,unit:record.attributes.unit,exactBedroomRecords:exact.records.length,rangedBedroomRecords:ranges.records.length,exactFourBedroomRecords:four.records.length};
});
await check('additional purchase published rolling and monthly statistics preserve original geography',async()=>{
  const results=[];
  for(const [system,code,period] of [['CSO_HPM02_C02339V02812','-','2026-07'],['CSO_HPM07_C03348V04035','-','2026-07'],['CSO_HPM08_C03349V04063','A41','2026-07']]){
    const body=await ok('/market-context'+query({geographyCode:code,geographyCodeSystem:system,tenure:'buy',period,limit:10}));
    assert(body.records.length===2,'Expected publisher mean and median');provenance(body,body.records);
    assert(body.records.every((r:any)=>r.attributes.geography.code===code&&r.attributes.geography.codeSystem===system&&r.attributes.period===period&&r.attributes.bedrooms===null),'Purchase dimensions changed');
    const bedrooms=await ok('/market-context'+query({geographyCode:code,geographyCodeSystem:system,tenure:'buy',period,bedrooms:2,limit:10}));assert(bedrooms.records.length===0,'Unknown purchase bedrooms matched request');
    results.push({system,code,statistics:body.records.map((r:any)=>r.attributes.statistic),amounts:body.records.map((r:any)=>r.attributes.amountEur)});
  }return results;
});
await check('unlocated housing and water directories remain queryable information',async()=>{
  const index=await Bun.file('data/canonical/last-run.json').json();const results=[];
  for(const kind of ['housing_information','utility_observation']){
    let fixture:CommonRecord|undefined;
    for(const entry of index.results){if(!(kind==='housing_information'?entry.source==='housing-construction':entry.source==='uisce-water-zones'))continue;for await(const line of createInterface({input:createReadStream(entry.files.records),crlfDelay:Infinity})){const r=commonRecordSchema.parse(JSON.parse(line));if(r.kind===kind){fixture=r;break;}}if(fixture)break;}
    assert(fixture,`No canonical ${kind} fixture`);
    const geography=(fixture.attributes as any).geography;
    const body=await ok('/context'+query({geographyCode:geography.code,geographyCodeSystem:geography.codeSystem,categories:fixture.category,limit:250}));
    assert(body.records.some((r:any)=>r.id===fixture!.id),'Exact directory context fixture missing');provenance(body,body.records);
    assert(body.records.every((r:any)=>r.kind===kind&&r.geometry===null&&r.locationStatus==='unlocated'&&r.attributes.geography.code===geography.code),'Context contains fabricated geometry or mismatched geography');
    results.push({kind,category:fixture.category,geography,returned:body.records.length});
  }
  const wrong=await request('/context?placeId=dublin');assert(wrong.status===400,'Unverified town-to-directory join accepted');return results;
});
await check('PPR transactions are separate unlocated register records under publisher reuse policy',async()=>{
  const body=await ok('/context'+query({categories:'property_transactions',geographyCode:'Dublin',geographyCodeSystem:'PSRA:county-label',limit:2}));
  assert(body.records.length===2,'No exact-county transaction information');provenance(body,body.records);
  assert(body.records.every((r:any)=>r.kind==='property_transaction'&&r.geometry===null&&r.locationStatus==='unlocated'&&r.attributes.geography.code==='Dublin'&&r.attributes.geography.codeSystem==='PSRA:county-label'),'Register transactions inferred geographic locations or changed counties');
  assert(body.records.every((r:any)=>r.raw.locator.startsWith('zip:PPR-ALL.csv/csv:')&&Number.isFinite(r.attributes.amountEur)&&!Object.hasOwn(r.attributes,'bedrooms')),'Transaction source locator or amount lost; bedroom classification invented');
  const source=body.sources.find((s:any)=>s.sourceId==='psra-ppr');assert(source?.license==='custom-reuse'&&source.recordCount===809014,'PPR publisher policy or source count changed');
  assert(body.nextCursor&&body.nextCursor.length<4096,'PPR continuation unusable');
  const next=await ok('/context'+query({categories:'property_transactions',geographyCode:'Dublin',geographyCodeSystem:'PSRA:county-label',limit:2,cursor:body.nextCursor}));
  assert(new Set([...body.records,...next.records].map((r:any)=>r.id)).size===4,'Transaction context pages overlapped');
  return {returned:body.records.length,license:source.license,registerRecords:source.recordCount,geometryStatus:'unlocated',cursorLength:body.nextCursor.length};
});
await check('one, seven and all configured criteria generate conservative layers',async()=>{
  assert(registry?.criteria?.length>=24,'Criterion registry incomplete');const results=[];
  for(const count of [1,7,registry.criteria.length]){
    const criteria=registry.criteria.slice(0,count).map((d:any)=>({id:d.id,importance:'preferred',parameters:{}}));
    const body=await ok('/layers',post({version:1,location:{longitude:-6.2603,latitude:53.3498},radiusKm:10,criteria,limit:1,marketGeography:{code:'120500',codeSystem:'CSO_RIQ02_C03004V03625'}}));
    assert(body.layers.length===count&&body.rankingReady===false,`${count} requested layers were not preserved`);
    assert(body.layers.every((l:any)=>l.data.type==='FeatureCollection'&&l.data.features.length<=1&&l.evidenceStatus!=='accepted'),'Layer paging or conservative evidence policy failed');
    results.push({criteria:count,layers:body.layers.length,withFeatures:body.layers.filter((l:any)=>l.data.features.length).length,withContext:body.layers.filter((l:any)=>l.context.length).length});
  }return results;
});
await check('assessments never fabricate travel time, affordability or household utility matches',async()=>{
  const criteria=registry.criteria.map((d:any)=>({id:d.id,importance:'required',parameters:{}}));
  const body=await ok('/assess',post({version:1,location:{longitude:-6.2603,latitude:53.3498},criteria}));
  assert(body.results.length===criteria.length&&body.results.every((r:any)=>r.score===null&&r.match==='unknown'),'Assessment fabricated a ranking');
  assert(body.aggregate.score===null&&body.aggregate.rankingReady===false,'Aggregate fabricated ranking');
  for(const id of ['health.hospital','health.gp','transportation.public_transport','utilities.mains_water','utilities.electricity','budget.rent'])assert(body.results.find((r:any)=>r.id===id)?.evidenceStatus==='unknown',`${id} inferred suitability from proximity`);
  return {selected:body.results.length,requiredEvidenceMissing:body.aggregate.requiredEvidenceMissing.length,rankingReady:body.aggregate.rankingReady};
});

const report={version:1,verifiedAt:new Date().toISOString(),baseUrl,expectedRecords,passed:evidence.every(c=>c.passed),checks:evidence,scope:'Independent observations of local native macOS-container API; historical/partial data and unknown suitability remain explicit. Not a public deployment.'};
await Bun.write(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:evidence.length,failures:evidence.filter(c=>!c.passed),output},null,2));if(!report.passed)process.exitCode=1;
