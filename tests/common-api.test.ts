import { describe, expect, test } from 'bun:test';
import { createCommonApp } from '../src/common/app';
import { QueryError, type CommonRepository, type FeatureQuery, type MarketQuery } from '../src/common/repository';
import type { CommonManifest, CommonRecord } from '../src/common/schema';
import marketGeographies from '../config/market-geographies.json';

const source:CommonManifest = {
  version:2,snapshotId:'snapshot-a',sourceId:'source-a',scope:'national',publisher:'Publisher',
  sourceUrl:'https://example.org/source',license:'CC-BY-4.0',licenseEvidenceUrl:'https://example.org/licence',
  attribution:'Publisher',reuseStatus:'approved',fetchedAt:'2026-10-04T10:00:00Z',observedPeriod:'2026',
  geography:'Ireland',coverage:'partial',limitations:['Location observations only'],adapter:{id:'fixture',version:'1'},
  rawAssets:[{path:'data/raw/source.json',sha256:'a'.repeat(64),bytes:100}],recordCount:1,
  sha256:'a'.repeat(64),format:'ndjson',quality:{inputRecords:1,acceptedRecords:1,quarantinedRecords:0,unlocatedRecords:0,excludedRecords:0,exclusions:{}},
};
const service:CommonRecord = {
  version:2,id:'source-a:national:one',externalId:'one',sourceId:'source-a',scope:'national',snapshotId:'snapshot-a',
  name:'Recorded childcare',raw:{path:'data/raw/source.json',locator:'feature:1'},observedPeriod:'2026',
  kind:'service',category:'childcare',geometry:{type:'Point',coordinates:[-6.26,53.34]},
  locationStatus:'located',geometryMeaning:'recorded_location',attributes:{access:'unknown'},
};
const suppressedMarket:CommonRecord = {
  ...service,kind:'market_context',category:'rent',geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',
  attributes:{geography:{code:'region-1',codeSystem:'CSO-RIQ02',type:'statistical_region',name:'Region',vintage:'2025'},
    tenure:'rent',statistic:'mean',amountEur:null,unit:'EUR/month',period:'2025Q4',propertyType:'house',propertyTypeLabel:'House',
    bedroomClass:'2',bedrooms:2,sampleSize:null,observationStatus:'suppressed',sourceValue:null,definition:'Historical rent',dimensions:{}},
};
function fixture() {
  const calls:{features:FeatureQuery[];markets:MarketQuery[];places:unknown[][];areas:unknown[][]} = {features:[],markets:[],places:[],areas:[]};
  const repo:CommonRepository = {
    initialize:async()=>{},close:async()=>{},importFile:async()=>{throw new Error('unused');},
    status:async()=>({recordCount:1,sources:[source]}),
    searchPlaces:async(...args)=>{calls.places.push(args);return {records:[],nextCursor:'place-cursor',snapshotIds:['snapshot-a']};},
    features:async q=>{calls.features.push(q);return {records:[{record:service,distanceM:124}],nextCursor:'opaque-cursor',snapshotIds:['snapshot-a']};},
    areasAtPoint:async(...args)=>{calls.areas.push(args);return {records:[],nextCursor:null,snapshotIds:['snapshot-a']};},
    contextRecords:async()=>({records:[],nextCursor:null,snapshotIds:["snapshot-a"]}),
    marketContext:async q=>{calls.markets.push(q);return {records:[suppressedMarket],nextCursor:null,snapshotIds:['snapshot-a']};},
  };
  return {repo,calls,app:createCommonApp(repo)};
}
const preferences = (ids:string[]) => ({version:1,location:{longitude:-6.26,latitude:53.34},criteria:ids.map(id=>({id,importance:'required',parameters:{}}))});
const post = (app:ReturnType<typeof createCommonApp>,route:string,body:unknown) => app.request(route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

describe('common API HTTP contracts',()=>{
  test('data status separates imported snapshots from raw adapter availability',async()=>{
    const {app}=fixture();
    const response=await app.request('/data-status');
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.totalRecords).toBe(1);
    expect(body.sources).toHaveLength(1);
    expect(body.adapterRegistry.stage).toBe('expanded_import');
    expect(body.adapterRegistry.sources.some((s:{status:string})=>s.status==='reuse_gated')).toBe(true);
  });
  test('API contract, readiness and exact nonspatial geography remain discoverable',async()=>{
    const {app,repo}=fixture();
    expect((await app.request('/')).status).toBe(200);
    expect((await app.request('/ready')).status).toBe(200);
    const contract=await (await app.request('/openapi.json')).json();
    expect(contract.openapi).toBe('3.1.0');
    expect(contract.paths['/context'].get.operationId).toBe('informationContext');
    expect((await app.request('/context?geographyCode=Fingal')).status).toBe(400);
    expect((await app.request('/context?geographyCode=Fingal&geographyCodeSystem=Housing:local-authority-name&categories=government_projects')).status).toBe(200);
    repo.status=async()=>{throw new Error('offline');};
    expect((await app.request('/ready')).status).toBe(503);
  });
  test('validates spatial bounds, paging and category query before repository calls',async()=>{
    const {app,calls}=fixture();
    for (const query of ['','bbox=-6,53,-7,54','bbox=-7,53,-6,54&longitude=-6&latitude=53&radiusM=10','longitude=-6&latitude=53','longitude=NaN&latitude=53&radiusM=100','longitude=-6&latitude=53&radiusM=50001','bbox=-7,53,-6,54&categories=made_up','bbox=-7,53,-6,54&limit=251','bbox=-7,53,-6,54&unexpected=true']) {
      expect((await app.request(`/features?${query}`)).status).toBe(400);
    }
    expect(calls.features).toHaveLength(0);
    const response=await app.request('/features?bbox=-7,53,-6,54&categories=childcare,urban_area&limit=2&cursor=continuation');
    expect(response.status).toBe(200);
    expect(calls.features[0]).toEqual({bbox:[-7,53,-6,54],categories:['childcare','urban_area'],limit:2,cursor:'continuation'});
    const body=await response.json();
    expect(body.nextCursor).toBe('opaque-cursor');
    expect(body.sources[0].attribution).toBe('Publisher');
    expect(body.data.features[0].properties.raw.locator).toBe('feature:1');
    expect(body.data.features[0].properties.geometry).toBeUndefined();
    expect(body.data.features[0].geometry.type).toBe('Point');
  });
  test('dispatches near, place and area queries with bounded limits',async()=>{
    const {app,calls}=fixture();
    expect((await app.request('/features?longitude=-6.26&latitude=53.34&radiusM=1500')).status).toBe(200);
    expect(calls.features[0]?.near).toEqual({longitude:-6.26,latitude:53.34,radiusM:1500});
    expect((await app.request('/places?q=dublin&limit=3&cursor=p')).status).toBe(200);
    expect(calls.places[0]).toEqual(['dublin',3,'p']);
    expect((await app.request('/areas?longitude=-6.26&latitude=53.34&categories=broadband&limit=4&cursor=area-page')).status).toBe(200);
    expect(calls.areas[0]).toEqual([{longitude:-6.26,latitude:53.34},['broadband'],4,'area-page']);
  });
  test('place anchors dispatch the exact place ID and preserve the repository representative point',async()=>{
    const {app,repo,calls}=fixture();
    const place:CommonRecord={...service,id:'source-a:national:town with space',externalId:'town with space',name:'Recorded town',
      kind:'place',category:'urban_area',locationStatus:'located',geometryMeaning:'statistical_boundary',
      geometry:{type:'Polygon',coordinates:[[[-6.4,53.2],[-6.2,53.2],[-6.2,53.4],[-6.4,53.4],[-6.4,53.2]]]},
      attributes:{geography:{code:'town-1',codeSystem:'CSO-urban-area',type:'urban_area',name:'Recorded town',vintage:'2022'},aliases:[]}};
    const requested:string[]=[];
    repo.placeAnchor=async id=>{requested.push(id);return id===place.id?{place,longitude:-6.35,latitude:53.25}:null;};
    const response=await app.request(`/place-anchor?placeId=${encodeURIComponent(place.id)}`);
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(requested).toEqual([place.id]);
    expect(body.place).toEqual(place);
    expect([body.longitude,body.latitude]).toEqual([-6.35,53.25]);
    expect(body.anchorMeaning).toBe('representative_point_in_source_town_boundary');
    expect(body.explanation).toContain('not a geocoded home');
    expect(calls.places).toHaveLength(0);
    expect(calls.features).toHaveLength(0);
    for(const id of [service.id,'missing-town']){
      const missing=await app.request(`/place-anchor?placeId=${encodeURIComponent(id)}`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({error:'place_not_found'});
    }
    expect(requested).toEqual([place.id,service.id,'missing-town']);
  });
  test('invalid anchor requests never dispatch and unavailable anchor capability is explicit',async()=>{
    const {app,repo}=fixture();
    let dispatched=0;
    repo.placeAnchor=async()=>{dispatched++;return null;};
    for(const query of ['', 'placeId=', 'placeId=town&unexpected=true', `placeId=${'x'.repeat(1001)}`])
      expect((await app.request(`/place-anchor?${query}`)).status).toBe(400);
    expect(dispatched).toBe(0);
    delete repo.placeAnchor;
    const response=await app.request('/place-anchor?placeId=town');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:'anchor_unavailable'});
  });
  test('market geography discovery applies tenure, text and limits to active publisher metadata',async()=>{
    const {app,repo}=fixture();
    const manifests=[...new Set(marketGeographies.geographies.map(g=>g.snapshotId))].map(snapshotId=>{
      const geography=marketGeographies.geographies.find(g=>g.snapshotId===snapshotId)!;
      return {...source,snapshotId,sourceId:geography.sourceId};
    });
    repo.status=async()=>({recordCount:manifests.length,sources:manifests});
    for(const tenure of ['buy','rent'] as const){
      const expected=marketGeographies.geographies.filter(g=>g.tenure===tenure);
      expect(expected.length).toBeGreaterThan(1);
      const response=await app.request(`/market-geographies?tenure=${tenure}&limit=1`);
      expect(response.status).toBe(200);
      const body=await response.json();
      expect(body.geographies).toEqual(expected.slice(0,1));
      expect(body.total).toBe(expected.length);
      expect(body.truncated).toBe(true);
      expect(body.sources.map((s:CommonManifest)=>s.snapshotId).sort()).toEqual([...new Set(expected.map(g=>g.snapshotId))].sort());
      const query=expected[0]!.name.toUpperCase();
      const matches=expected.filter(g=>g.name.toLowerCase().includes(query.toLowerCase()));
      const searched=await (await app.request(`/market-geographies?tenure=${tenure}&q=${encodeURIComponent(`  ${query}  `)}`)).json();
      expect(searched.geographies).toEqual(matches.slice(0,1000));
      expect(searched.total).toBe(matches.length);
      expect(searched.sources.map((s:CommonManifest)=>s.snapshotId).sort()).toEqual([...new Set(matches.map(g=>g.snapshotId))].sort());
      expect(searched.explanation).toContain('No town-to-market-region mapping is inferred');
    }
    const empty=await (await app.request('/market-geographies?q=__not_a_publisher_geography__')).json();
    expect(empty.geographies).toEqual([]);
    expect(empty.sources).toEqual([]);
    expect(empty.total).toBe(0);
    expect(empty.truncated).toBe(false);
  });
  test('market geography registry checks requested active snapshots before text filtering',async()=>{
    const {app,repo}=fixture();
    const rent=marketGeographies.geographies.filter(g=>g.tenure==='rent');
    const snapshots=[...new Set(rent.map(g=>g.snapshotId))];
    repo.status=async()=>({recordCount:snapshots.length,sources:snapshots.map(snapshotId=>({...source,snapshotId}))});
    expect((await app.request('/market-geographies?tenure=rent&limit=1')).status).toBe(200);
    expect(marketGeographies.geographies.some(g=>!snapshots.includes(g.snapshotId))).toBe(true);
    const stale=await app.request('/market-geographies?q=__not_a_publisher_geography__');
    expect(stale.status).toBe(503);
    expect((await stale.json()).error).toBe('market_geography_registry_stale');
    // A previously current snapshot becoming inactive must fail on the next request.
    repo.status=async()=>({recordCount:0,sources:[]});
    const changed=await app.request('/market-geographies?tenure=rent');
    expect(changed.status).toBe(503);
    expect((await changed.json()).error).toBe('market_geography_registry_stale');
    let statusCalls=0;
    repo.status=async()=>{statusCalls++;return {recordCount:0,sources:[]};};
    for(const query of ['tenure=lease','limit=0','limit=1001','limit=1.5','q='+ 'x'.repeat(201),'unexpected=true'])
      expect((await app.request(`/market-geographies?${query}`)).status).toBe(400);
    expect(statusCalls).toBe(0);
  });
  test('market search requires explicit geography and preserves suppressed observations',async()=>{
    const {app,calls}=fixture();
    expect((await app.request('/market-context?placeId=dublin')).status).toBe(400);
    expect((await app.request('/market-context?geographyCode=dublin')).status).toBe(400);
    const response=await app.request('/market-context?geographyCode=region-1&geographyCodeSystem=CSO-RIQ02&tenure=rent&bedrooms=2');
    expect(response.status).toBe(200);
    expect(calls.markets[0]?.bedrooms).toBe(2);
    const body=await response.json();
    expect(body.records[0].attributes.amountEur).toBeNull();
    expect(body.records[0].attributes.observationStatus).toBe('suppressed');
    expect(body.evidenceStatus).toBe('context_only');
  });
  test('layers support arbitrary selected criterion count, provenance and per-layer paging',async()=>{
    const {app,calls}=fixture();
    const ids=['health.hospital','transportation.airport','quality_of_life.parks','quality_of_life.clubs','education.childcare','utilities.broadband','utilities.mains_water','budget.rent','budget.buy'];
    const p=preferences(ids);
    p.criteria[7]!.parameters={bedrooms:2} as {};
    const response=await post(app,'/layers',{...p,bbox:[-7,53,-6,54],limit:2,marketGeography:{code:'region-1',codeSystem:'CSO-RIQ02'}});
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.layers).toHaveLength(9);
    expect(body.layers[0].nextCursor).toBe('opaque-cursor');
    expect(body.layers[0].sources[0].coverage).toBe('partial');
    expect(calls.features).toHaveLength(7);
    expect(calls.features.every(q=>q.limit===2 && q.bbox?.[0]===-7)).toBe(true);
    expect(calls.markets[0]?.bedrooms).toBe(2);
    expect(body.rankingReady).toBe(false);
    expect((await post(app,'/layers',preferences(['invented']))).status).toBe(400);
    expect((await post(app,'/layers',preferences([]))).status).toBe(400);
  });
  test('assessment queries nearest independently and never claims scores or utility/travel access',async()=>{
    const {app,calls}=fixture();
    const p=preferences(['education.childcare','health.hospital','utilities.broadband','budget.rent']);
    const response=await post(app,'/assess',p);
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(calls.features).toHaveLength(1);
    expect(calls.features[0]?.limit).toBe(1);
    expect(calls.features[0]?.near?.radiusM).toBe(50000);
    expect(body.results[0].metric.value).toBe(124);
    expect(body.results.every((r:{score:null;match:string})=>r.score===null && r.match==='unknown')).toBe(true);
    expect(body.aggregate.score).toBeNull();
    expect(body.aggregate.rankingReady).toBe(false);
    expect(body.aggregate.requiredEvidenceMissing).toHaveLength(4);
    const age={...preferences(['education.childcare']),criteria:[{id:'education.childcare',importance:'required',parameters:{childAge:2}}]};
    await post(app,'/assess',age);
    expect(calls.features).toHaveLength(1);
  });
  test('empty records mean unknown, and active snapshot changes return retry conflicts',async()=>{
    const {repo}=fixture();
    repo.features=async()=>({records:[],nextCursor:null,snapshotIds:['snapshot-a']});
    const app=createCommonApp(repo);
    const body=await (await post(app,'/layers',preferences(['education.childcare']))).json();
    expect(body.layers[0].evidenceStatus).toBe('unknown');
    expect(body.layers[0].explanation).toContain('does not establish absence');
    let statusCalls=0;
    repo.status=async()=>({recordCount:1,sources:[{...source,snapshotId:++statusCalls===1?'snapshot-a':'snapshot-b'}]});
    expect((await post(app,'/layers',preferences(['education.childcare']))).status).toBe(409);
  });
  test('repository query conflicts and malformed JSON are safe client errors',async()=>{
    const {repo}=fixture();
    repo.features=async()=>{throw new QueryError('Stale cursor',409);};
    const app=createCommonApp(repo);
    expect((await app.request('/features?bbox=-7,53,-6,54')).status).toBe(409);
    expect((await app.request('/layers',{method:'POST',headers:{'content-type':'application/json'},body:'{invalid'})).status).toBe(400);
  });
});
