import registry from '../config/criteria.json';
import { preferencesSchema, type Preferences, type DataRecord, type Geometry } from './schema';
import { Store } from './store';
export const criteriaRegistry = registry;
type Criterion = typeof registry.criteria[number];

export function parsePreferences(input: unknown): Preferences {
  const preferences = preferencesSchema.parse(input);
  for (const selected of preferences.criteria) {
    const definition = registry.criteria.find(c => c.id === selected.id);
    if (!definition) throw new Error(`Unknown criterion: ${selected.id}`);
    const p = selected.parameters;
    if ((p.maximumMinutes !== undefined || p.mode !== undefined) && definition.method !== 'travel_time') throw new Error(`Travel parameters are incompatible with ${selected.id}`);
    if (p.childAge !== undefined && selected.id !== 'education.childcare') throw new Error(`Child age is incompatible with ${selected.id}`);
    if (p.maximumAmountEur !== undefined && definition.method !== 'market_context') throw new Error(`Budget parameter is incompatible with ${selected.id}`);
    if (p.minimumDownloadMbps !== undefined && selected.id !== 'utilities.broadband') throw new Error(`Broadband parameter is incompatible with ${selected.id}`);
    if (p.maximumDistanceM !== undefined && definition.method !== 'distance') throw new Error(`Distance parameter is incompatible with ${selected.id}`);
    if (p.bedrooms !== undefined && !['budget.buy','budget.rent','housing.bedrooms'].includes(selected.id)) throw new Error(`Bedrooms are incompatible with ${selected.id}`);
    if ((p.facilityId !== undefined || p.requiredService !== undefined) && !['distance','travel_time'].includes(definition.method)) throw new Error(`Facility parameters are incompatible with ${selected.id}`);
  }
  return preferences;
}
export function distanceM(a: [number,number], b: [number,number]) {
  const rad = Math.PI/180;
  const x = Math.sin((b[1]-a[1])*rad/2)**2 + Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[0]-a[0])*rad/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function positions(g: Geometry): [number,number][] {
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'LineString' || g.type === 'MultiPoint') return g.coordinates;
  return g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.coordinates.flat();
}
function visible(g: Geometry, p: Preferences) {
  const origin: [number,number] = [p.location.longitude,p.location.latitude];
  if (g.type === 'Point') return distanceM(origin,g.coordinates) <= p.radiusKm*1000;
  // Polygon bounding-box intersection is display selection only; never a connection/proximity score.
  const coords = positions(g), xs = coords.map(c=>c[0]), ys=coords.map(c=>c[1]);
  const latitudeDelta = p.radiusKm/111, longitudeDelta = p.radiusKm/(111*Math.cos(origin[1]*Math.PI/180));
  return Math.max(...xs) >= origin[0]-longitudeDelta && Math.min(...xs) <= origin[0]+longitudeDelta && Math.max(...ys) >= origin[1]-latitudeDelta && Math.min(...ys) <= origin[1]+latitudeDelta;
}
function matches(record: DataRecord, definition: Criterion, p: Preferences) {
  if (definition.method === 'market_context') return record.kind === 'market_context' && record.attributes.tenure === definition.category && record.attributes.placeId === p.location.placeId;
  if (definition.id === 'housing.government_projects') return record.kind === 'housing_information' && ((p.location.placeId !== undefined && record.attributes.placeId === p.location.placeId) || (record.geometry !== null && visible(record.geometry,p)));
  return 'category' in record && record.category === definition.category;
}
function candidateRecords(store: Store, definition: Criterion, p: Preferences, selected: Preferences['criteria'][number]) {
  return store.records().filter(record => matches(record, definition,p))
    .filter(record => record.kind !== 'market_context' || selected.parameters.bedrooms === undefined || record.attributes.bedrooms === selected.parameters.bedrooms)
    .filter(record => !selected.parameters.facilityId || record.id === selected.parameters.facilityId)
    .filter(record => record.kind !== 'service' || record.attributes.access !== 'private');
}
export function layers(store: Store, p: Preferences) {
  const manifests=store.manifests();
  return { version:1, location:p.location, radiusKm:p.radiusKm, layers:p.criteria.map(selected => {
    const definition=registry.criteria.find(c=>c.id===selected.id)!;
    const candidates=candidateRecords(store,definition,p,selected);
    const inView=candidates.filter(r=>r.geometry && visible(r.geometry,p));
    const displayed=inView.slice(0,1000);
    const sourceKeys=new Set(candidates.map(r=>`${r.sourceId}:${r.scope}`));
    const sources=manifests.filter(m=>sourceKeys.has(`${m.sourceId}:${m.scope}`));
    return { id:definition.id, vertical:definition.vertical, category:definition.category,
      evidenceStatus: candidates.length ? 'partial' : 'unknown', explanation:candidates.length ? 'Recorded source features; completeness and suitability are not certified.' : 'No matching records imported; this does not prove absence.',
      sources, totalInView:inView.length, truncated:inView.length>displayed.length,
      data:{type:'FeatureCollection',features:displayed.map(record=>({type:'Feature',id:record.id,geometry:record.geometry,properties:{...record,geometry:undefined}}))},
      context:candidates.filter(r=>!r.geometry).slice(0,1000),
    };
  })};
}
export function assess(store: Store, p: Preferences) {
  const manifests=store.manifests();
  const results=p.criteria.map(selected=>{
    const definition=registry.criteria.find(c=>c.id===selected.id)!;
    const records=candidateRecords(store,definition,p,selected);
    const weight=selected.weight ?? definition.defaultWeight;
    const base={id:selected.id,vertical:definition.vertical,importance:selected.importance,weight,parameters:{...definition.defaults,...selected.parameters},score:null as number|null,evidenceStatus:'unknown' as string,match:'unknown' as string};
    if (definition.method === 'travel_time') return {...base,reason:'A recorded point cannot satisfy a travel-time requirement. Routing/network, mode, service capability and (for transit) timetable evidence have not been imported.'};
    if (definition.method === 'property_evidence') return {...base,reason:'Property connection/serviceability has not been verified. Area polygons and nearby assets cannot establish household utility access.'};
    if (definition.method === 'market_context') return {...base,evidenceStatus:records.length?'context':'unknown',context:records,reason:'Historical area statistics cannot establish an available affordable home or matching bedroom count.'};
    if (definition.method !== 'distance') return {...base,evidenceStatus:records.length?'context':'unknown',reason:'Information layer only; no approved score metric.',context:records};
    if (selected.parameters.requiredService || selected.parameters.childAge !== undefined) return {...base,reason:'Requested age/service suitability is not verified by imported location records.'};
    const origin: [number,number]=[p.location.longitude,p.location.latitude];
    const points=records.filter(r=>r.geometry?.type==='Point').map(record=>({record,distanceM:distanceM(origin,(record.geometry as Extract<Geometry,{type:'Point'}>).coordinates)})).sort((a,b)=>a.distanceM-b.distanceM);
    const nearest=points[0];
    if (!nearest) return {...base,reason:'No verified point observation matches; missing data is unknown, never zero.'};
    const source=manifests.find(m=>m.sourceId===nearest.record.sourceId && m.scope===nearest.record.scope)!;
    // Score recorded proximity only. Neither admissions nor vacancies nor quality is inferred.
    const near=definition.defaults.fullScoreDistanceM!, far=definition.defaults.zeroScoreDistanceM!;
    const score=Math.max(0,Math.min(100,100*(far-nearest.distanceM)/(far-near)));
    return {...base,score:Math.round(score*100)/100,evidenceStatus:'observed_proximity',match:selected.parameters.maximumDistanceM ? (nearest.distanceM<=selected.parameters.maximumDistanceM?'within_distance':'beyond_distance'):'not_requested',metric:{type:'straight_line_distance_m',value:Math.round(nearest.distanceM),facilityId:nearest.record.id,source},reason:'Proposed score measures proximity to a recorded point. It does not establish routes, suitability, admission, availability or service quality.'};
  });
  const scored=results.filter(r=>r.score!==null), weightTotal=results.reduce((sum,r)=>sum+r.weight,0), weighted=scored.reduce((sum,r)=>sum+r.score!*r.weight,0), knownWeight=scored.reduce((sum,r)=>sum+r.weight,0);
  const requiredCriteriaFailed=results.filter(r=>r.importance==='required' && r.match==='beyond_distance').map(r=>r.id);
  const rankingReady=registry.status==='approved' && scored.length===results.length && requiredCriteriaFailed.length===0 && scored.every(r=>'metric' in r && r.metric.source.coverage==='accepted');
  const verticals=[...new Set(results.map(r=>r.vertical))].map(vertical=>{
    const entries=results.filter(r=>r.vertical===vertical), known=entries.filter(r=>r.score!==null), weight=entries.reduce((sum,r)=>sum+r.weight,0);
    return {vertical,selectedCriteria:entries.length,scoredCriteria:known.length,score:known.length===entries.length ? Math.round(known.reduce((sum,r)=>sum+r.score!*r.weight,0)/weight*100)/100 : null};
  });
  const missingRequired=results.filter(r=>r.importance==='required'&&r.score===null).map(r=>r.id);
  return {version:1,location:p.location,configurationStatus:registry.status,results,verticals,
    aggregate:{score:scored.length===results.length ? Math.round(weighted/weightTotal*100)/100 : null,requiredEvidenceMissing:missingRequired,requiredCriteriaFailed,scoredCriteria:scored.length,selectedCriteria:results.length,weightedCoverage:knownWeight/weightTotal,scoreBounds:{minimum:Math.round(weighted/weightTotal*100)/100,maximum:Math.round((weighted+100*(weightTotal-knownWeight))/weightTotal*100)/100},rankingReady,explanation:'Unknown criteria retain their weight. Scores remain null until all selected criteria are measured; bounds express missing evidence and are not rankings. Ranking additionally requires approved configuration, accepted comparable evidence and satisfied required distance constraints.'}};
}
