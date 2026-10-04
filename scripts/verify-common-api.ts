import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { commonRecordSchema, type CommonRecord } from '../src/common/schema';

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:3080').replace(/\/$/,'');
const output = process.argv[3] ?? 'docs/research/common-api-live-verification.json';
const expectedRecords = Number(process.argv[4] ?? '83620');
const evidence:{name:string;passed:boolean;durationMs:number;details?:unknown;error?:string}[] = [];
function assert(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
async function check(name:string,run:()=>Promise<unknown>) {
  const started=performance.now();
  try {const details=await run();evidence.push({name,passed:true,durationMs:Math.round(performance.now()-started),details});}
  catch(error) {evidence.push({name,passed:false,durationMs:Math.round(performance.now()-started),error:error instanceof Error?error.message:String(error)});}
}
async function request(path:string,options?:RequestInit) {
  const response=await fetch(baseUrl+path,{...options,signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  let body:any;
  try {body=JSON.parse(text);} catch {body={nonJsonResponse:text.slice(0,200)};}
  return {status:response.status,body};
}
async function ok(path:string,options?:RequestInit) {
  const response=await request(path,options);
  assert(response.status===200,`${path}: expected 200, received ${response.status} ${JSON.stringify(response.body).slice(0,400)}`);
  return response.body;
}
const post=(body:unknown):RequestInit=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const query=(fields:Record<string,string|number>)=>'?' + new URLSearchParams(Object.entries(fields).map(([key,value])=>[key,String(value)]));
let status:any,registry:any,marketFixture:Extract<CommonRecord,{kind:'market_context'}>|undefined;

await check('health and version',async()=>{
  const body=await ok('/health');
  assert(body.status==='ok' && body.version===2,'Expected healthy version-2 common API');
  return body;
});
await check('active sources, exact record count and adapter transparency',async()=>{
  status=await ok('/data-status');
  assert(status.totalRecords===expectedRecords,`Expected ${expectedRecords} records, observed ${status.totalRecords}`);
  assert(status.sources.reduce((sum:number,s:any)=>sum+s.recordCount,0)===status.totalRecords,'Active source counts do not sum to database count');
  assert(status.sources.every((s:any)=>s.reuseStatus==='approved' && s.coverage!=='accepted'),'Expected approved reuse with partial/unknown real-world coverage');
  assert(status.adapterRegistry.sources.some((s:any)=>s.status==='deferred'),'Raw deferred sources are not disclosed');
  assert(status.rankingReady===false,'Unapproved rankings must remain disabled');
  return {totalRecords:status.totalRecords,sources:status.sources.map((s:any)=>({sourceId:s.sourceId,scope:s.scope,snapshotId:s.snapshotId,recordCount:s.recordCount,coverage:s.coverage})),rawSourceStatuses:status.adapterRegistry.sources.reduce((counts:Record<string,number>,s:any)=>({...counts,[s.status]:(counts[s.status]??0)+1}),{})};
});
await check('criterion registry and Dublin town search',async()=>{
  registry=await ok('/criteria');
  assert(Array.isArray(registry.criteria) && registry.criteria.length>=7,'Expected configurable criteria registry');
  const body=await ok('/places?q=dublin&limit=10');
  assert(body.places.some((p:any)=>p.name.toLowerCase().includes('dublin')),'Dublin urban area missing');
  assert(body.places.every((p:any)=>p.kind==='place' && p.version===2),'Search returned noncanonical places');
  assert(body.sources.length>0,'Place provenance missing');
  return {criterionCount:registry.criteria.length,places:body.places.map((p:any)=>({id:p.id,name:p.name,geography:p.attributes.geography})),snapshotIds:body.snapshotIds};
});
await check('viewport pagination, stable IDs and bound query cursors',async()=>{
  const fields={bbox:'-11,51,-5,56',categories:'childcare',limit:2};
  const page1=await ok('/features'+query(fields));
  assert(page1.data.features.length===2 && page1.nextCursor,'Expected first two childcare records and continuation');
  const page2=await ok('/features'+query({...fields,cursor:page1.nextCursor}));
  assert(page2.data.features.length===2,'Expected second page of childcare records');
  const ids=[...page1.data.features,...page2.data.features].map((f:any)=>f.id);
  assert(new Set(ids).size===4,'Pagination duplicated canonical IDs');
  assert(page1.data.features.every((f:any)=>f.properties.geometry===undefined && f.properties.raw?.locator && f.geometry),'GeoJSON duplicated geometry or lost raw identity');
  const wrong=await request('/features'+query({...fields,categories:'clubs',cursor:page1.nextCursor}));
  assert(wrong.status===400,'Cursor from a different category query was accepted');
  return {firstIds:ids.slice(0,2),secondIds:ids.slice(2),wrongQueryCursorStatus:wrong.status,sourceIds:page1.sources.map((s:any)=>s.sourceId)};
});
await check('radius query reports bounded, ordered geometry distances',async()=>{
  const body=await ok('/features'+query({longitude:-6.2603,latitude:53.3498,radiusM:10000,categories:'childcare',limit:5}));
  assert(body.data.features.length>0,'No childcare observations near Dublin');
  const distances=body.data.features.map((f:any)=>f.properties.recordedGeometryDistanceM);
  assert(distances.every((d:number,i:number)=>Number.isFinite(d) && d>=0 && d<=10000 && (i===0 || d>=distances[i-1])),'Radius records had invalid or unordered distances');
  return {returned:distances.length,distancesM:distances,sourceIds:body.sources.map((s:any)=>s.sourceId)};
});
await check('polygon area membership with provenance',async()=>{
  const body=await ok('/areas'+query({longitude:-6.2603,latitude:53.3498,limit:25}));
  assert(body.data.features.some((f:any)=>f.properties.kind==='place'),'Dublin point was not covered by a place polygon');
  assert(body.data.features.some((f:any)=>f.properties.kind==='utility_area'),'Dublin point lacked broadband area context');
  assert(body.data.features.every((f:any)=>['Polygon','MultiPolygon'].includes(f.geometry.type)),'Area route returned nonpolygon geometry');
  return {areas:body.data.features.map((f:any)=>({id:f.id,kind:f.properties.kind,category:f.properties.category})),sourceIds:body.sources.map((s:any)=>s.sourceId)};
});
await check('exact HPM05 geography, period and dwelling filters',async()=>{
  for await(const path of new Bun.Glob('data/canonical/purchase/*/records.ndjson').scan('.')) {
    for await(const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})) {
      const record=commonRecordSchema.parse(JSON.parse(line));
      if(record.kind==='market_context'){marketFixture=record;break;}
    }
    if(marketFixture)break;
  }
  assert(marketFixture,'Canonical purchase fixture unavailable');
  const a=marketFixture.attributes;
  const fields={geographyCode:a.geography.code,geographyCodeSystem:a.geography.codeSystem,tenure:a.tenure,period:a.period,propertyType:a.propertyType,limit:25};
  const body=await ok('/market-context'+query(fields));
  const exact=body.records.find((r:any)=>r.id===marketFixture!.id);
  assert(exact?.attributes.amountEur===a.amountEur && exact.attributes.sampleSize===a.sampleSize,'Exact canonical purchase observation was not preserved');
  assert(body.records.every((r:any)=>r.attributes.geography.code===a.geography.code && r.attributes.geography.codeSystem===a.geography.codeSystem && r.attributes.period===a.period && r.attributes.propertyType===a.propertyType),'Market filters returned mismatched observation dimensions');
  const unknownBedrooms=await ok('/market-context'+query({...fields,bedrooms:2}));
  assert(unknownBedrooms.records.length===0,'Unknown purchase bedroom counts matched an exact requested bedroom count');
  return {fixtureId:marketFixture.id,geography:a.geography,period:a.period,amountEur:a.amountEur,sampleSize:a.sampleSize,matchingRecords:body.records.length,exactBedroomsRecords:unknownBedrooms.records.length};
});
await check('one, seven and all configured criteria generate individual layers',async()=>{
  assert(registry?.criteria,'Live registry unavailable');
  const counts=[1,7,registry.criteria.length];
  const results=[];
  for(const count of counts) {
    const selected=registry.criteria.slice(0,count).map((d:any)=>({id:d.id,importance:'preferred',parameters:{}}));
    const payload={version:1,location:{longitude:-6.2603,latitude:53.3498},radiusKm:10,criteria:selected,limit:1,...(marketFixture?{marketGeography:{code:marketFixture.attributes.geography.code,codeSystem:marketFixture.attributes.geography.codeSystem}}:{})};
    const body=await ok('/layers',post(payload));
    assert(body.layers.length===count && body.rankingReady===false,`${count} selected criteria did not produce ${count} conservative layers`);
    assert(body.layers.every((l:any)=>l.data.type==='FeatureCollection' && l.data.features.length<=1 && l.evidenceStatus!=='accepted'),'Layer bounds or evidence status incorrect');
    results.push({selected:count,returned:body.layers.length,layersWithRecords:body.layers.filter((l:any)=>l.data.features.length || l.context.length).map((l:any)=>l.id)});
  }
  return results;
});
await check('assessments retain unknown scores with independent recorded proximity',async()=>{
  const ids=registry.criteria.map((d:any)=>d.id);
  const body=await ok('/assess',post({version:1,location:{longitude:-6.2603,latitude:53.3498},criteria:ids.map((id:string)=>({id,importance:'required',parameters:{}}))}));
  assert(body.results.length===ids.length && body.results.every((r:any)=>r.score===null && r.match==='unknown'),'Assessment fabricated scores or access matches');
  assert(body.aggregate.score===null && body.aggregate.rankingReady===false,'Aggregate ranking was incorrectly certified');
  const childcare=body.results.find((r:any)=>r.id==='education.childcare');
  assert(childcare?.metric?.type==='recorded_point_distance_m' && childcare.metric.value>=0,'Recorded childcare proximity not observed');
  return {selectedCriteria:ids.length,requiredEvidenceMissing:body.aggregate.requiredEvidenceMissing.length,rankingReady:body.aggregate.rankingReady,recordedChildcareDistanceM:childcare.metric.value};
});
await check('invalid request validation and explicit market geographic contract',async()=>{
  const paths=['/features?bbox=-6,53,-7,54','/features?bbox=-7,53,-6,54&categories=invented','/features?longitude=NaN&latitude=53&radiusM=100','/features?longitude=-6&latitude=53&radiusM=50001','/features?bbox=-7,53,-6,54&limit=251','/market-context?placeId=dublin'];
  const statuses=[];
  for(const path of paths){const response=await request(path);assert(response.status===400,`Invalid ${path} returned ${response.status}`);statuses.push({path,status:response.status});}
  const invalid=await request('/layers',post({version:1,location:{longitude:-6.26,latitude:53.34},criteria:[{id:'invented',importance:'preferred',parameters:{}}]}));
  assert(invalid.status===400,'Unknown criterion accepted');
  return [...statuses,{path:'/layers with unknown criterion',status:invalid.status}];
});

const report={version:1,verifiedAt:new Date().toISOString(),baseUrl,expectedRecords,passed:evidence.every(item=>item.passed),checks:evidence,scope:'Observed local macOS native-container API acceptance; not deployed or certified source completeness.'};
await Bun.write(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:evidence.length,failures:evidence.filter(item=>!item.passed),output},null,2));
if(!report.passed)process.exitCode=1;
