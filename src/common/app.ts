import { Hono } from 'hono';
import { cors } from 'hono/cors';
import openapi from '../../schemas/openapi.json';
import { bodyLimit } from 'hono/body-limit';
import { z, ZodError } from 'zod';
import { criteriaRegistry, parsePreferences } from '../engine';
import marketGeographies from '../../config/market-geographies.json';
import layerCategories from '../../config/layer-categories.json';
import adapterRegistry from '../../config/source-adapters.json';
import type { Preferences } from '../schema';
import { bboxSchema, type CommonManifest, type CommonRecord } from './schema';
import { QueryError, type CommonRepository, type FeatureMatch, type FeatureQuery, type Page } from './repository';

const categoryIds = new Set<string>([...criteriaRegistry.criteria.map(c => c.category), 'urban_area',...layerCategories.queryCategories]);
const finiteNumber = z.preprocess(v => typeof v === 'string' && v.trim() !== '' ? Number(v) : v, z.number().finite());
const limitSchema = finiteNumber.pipe(z.number().int().min(1).max(250)).default(100);
const cursorSchema = z.string().min(1).max(4096).optional();
const longitudeSchema = finiteNumber.pipe(z.number().min(-11).max(-5));
const latitudeSchema = finiteNumber.pipe(z.number().min(51).max(56));
const categoriesSchema = z.string().min(1).transform(v => v.split(',')).pipe(z.array(z.string().refine(v => categoryIds.has(v), 'Unknown category')).min(1)).optional();
const textSchema = z.string().min(1).max(1000);
const queryBboxSchema = z.string().transform(v => v.split(',').map(Number)).pipe(bboxSchema);
const featureRequestSchema = z.object({
  bbox: queryBboxSchema.optional(), longitude: longitudeSchema.optional(), latitude: latitudeSchema.optional(),
  radiusM: finiteNumber.pipe(z.number().min(1).max(50000)).optional(),
  categories: categoriesSchema, limit: limitSchema, cursor: cursorSchema,
}).strict().superRefine((q, ctx) => {
  const nearParts = [q.longitude, q.latitude, q.radiusM].filter(v => v !== undefined).length;
  if ((q.bbox && nearParts) || (!q.bbox && nearParts !== 3)) ctx.addIssue({ code: 'custom', message: 'Provide either bbox or longitude, latitude and radiusM together' });
});
const placesRequestSchema = z.object({q:z.string().trim().min(1).max(200),limit:limitSchema,cursor:cursorSchema}).strict();
const areasRequestSchema = z.object({longitude:longitudeSchema,latitude:latitudeSchema,categories:categoriesSchema,limit:limitSchema,cursor:cursorSchema}).strict();
const marketRequestSchema = z.object({
  geographyCode:textSchema, geographyCodeSystem:textSchema, tenure:z.enum(['buy','rent']).optional(),
  period:textSchema.optional(), propertyType:z.enum(['house','apartment','all','unknown']).optional(),
  bedroomClass:textSchema.optional(), bedrooms:finiteNumber.pipe(z.number().int().nonnegative()).optional(),
  limit:limitSchema,cursor:cursorSchema,
}).strict();
const contextRequestSchema = z.object({categories:categoriesSchema,geographyCode:textSchema.optional(),geographyCodeSystem:textSchema.optional(),limit:limitSchema,cursor:cursorSchema}).strict().refine(q=>Boolean(q.geographyCode)===Boolean(q.geographyCodeSystem),'Provide both geographyCode and geographyCodeSystem');
const layerExtrasSchema = z.object({
  bbox:bboxSchema.optional(),limit:z.number().int().min(1).max(250).default(100),
  contextGeography:z.object({code:textSchema,codeSystem:textSchema}).strict().optional(),
  marketGeography:z.object({code:textSchema,codeSystem:textSchema}).strict().optional(),
}).strict();

function sourceEvidence(sources:CommonManifest[], snapshotIds:string[]) {
  const snapshots = new Set(snapshotIds);
  const evidence = sources.filter(s => snapshots.has(s.snapshotId));
  if (snapshotIds.some(id => !evidence.some(s => s.snapshotId === id))) throw new QueryError('Source snapshots changed while collecting provenance; retry.',409);
  return evidence;
}
function recordSources(sources:CommonManifest[], records:CommonRecord[]) {
  return sourceEvidence(sources,[...new Set(records.map(r => r.snapshotId))]);
}
function featureCollection(matches:FeatureMatch[]) {
  return {type:'FeatureCollection' as const,features:matches.map(({record,distanceM}) => {
    const {geometry,...properties} = record;
    return {type:'Feature' as const,id:record.id,geometry,properties:{...properties,...(distanceM === undefined ? {} : {recordedGeometryDistanceM:distanceM})}};
  })};
}
function sameSnapshots(a:CommonManifest[],b:CommonManifest[]) {
  const ids = (sources:CommonManifest[]) => sources.map(s => `${s.sourceId}:${s.scope}:${s.snapshotId}`).sort().join('\n');
  return ids(a) === ids(b);
}
function parseLayerInput(body:unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new QueryError('Expected a preferences object');
  const {bbox,limit,marketGeography,contextGeography,...preferences} = body as Record<string,unknown>;
  return {preferences:parsePreferences(preferences),...layerExtrasSchema.parse({bbox,limit,marketGeography,contextGeography})};
}
const missingExplanation = 'No matching records in this query does not establish absence. Source coverage, current availability and suitability are not certified.';

export function createCommonApp(repo:CommonRepository) {
  const app = new Hono();
  const origins=(process.env.CORS_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean);
  if(origins.length)app.use('*',cors({origin:origin=>origins.includes(origin)?origin:undefined,allowMethods:['GET','POST','OPTIONS'],allowHeaders:['Content-Type']}));
  app.use('*',bodyLimit({maxSize:256*1024}));
  app.onError((error,c) => {
    if (error instanceof ZodError) return c.json({error:'invalid_request',issues:error.issues},400);
    if (error instanceof QueryError) return c.json({error:error.status === 409 ? 'snapshot_changed_retry' : 'invalid_request',message:error.message},error.status);
    if (error instanceof SyntaxError || error.message.startsWith('Unknown criterion:') || error.message.includes('incompatible with')) return c.json({error:'invalid_request',message:error.message},400);
    console.error('Common API error:',error.name);
    return c.json({error:'internal_error'},500);
  });
  app.get('/',c=>c.json({service:'Ireland location-services API',version:2,contract:'/openapi.json',readiness:'/ready',criteria:'/criteria',dataStatus:'/data-status',search:['/places','/features','/areas','/market-context','/context'],preferences:['/layers','/assess'],rankingReady:false}));
  app.get('/openapi.json',c=>c.json(openapi));
  app.get('/ready',async c=>{try{const status=await repo.status();return c.json({status:status.sources.length?'ready':'data_not_loaded',totalRecords:status.recordCount,activeSourceScopes:status.sources.length},status.sources.length?200:503);}catch{return c.json({status:'database_unavailable'},503);}});
  app.get('/health',c => c.json({status:'ok',version:2,mode:'postgis_common_schema'}));
  app.get('/criteria',c => c.json({...criteriaRegistry,apiVersion:2}));
  app.get('/data-status',async c => {
    const status = await repo.status();
    return c.json({version:2,totalRecords:status.recordCount,sources:status.sources,adapterRegistry,missingDataMeans:'unknown_not_absent',rankingReady:false});
  });
  app.get('/places',async c => {
    const q = placesRequestSchema.parse(c.req.query());
    const page = await repo.searchPlaces(q.q,q.limit,q.cursor);
    const status = await repo.status();
    return c.json({version:2,places:page.records,nextCursor:page.nextCursor,snapshotIds:page.snapshotIds,sources:recordSources(status.sources,page.records),coverage:'CSO urban areas do not enumerate every rural locality.'});
  });
  app.get('/place-anchor',async c=>{
    const q=z.object({placeId:z.string().min(1).max(1000)}).strict().parse(c.req.query());
    if(!repo.placeAnchor)return c.json({error:'anchor_unavailable'},503);
    const anchor=await repo.placeAnchor(q.placeId);if(!anchor)return c.json({error:'place_not_found'},404);
    return c.json({version:2,...anchor,anchorMeaning:'representative_point_in_source_town_boundary',explanation:'A point on the source town polygon, not a geocoded home or a verified destination.'});
  });
  app.get('/market-geographies',async c=>{
    const q=z.object({tenure:z.enum(['buy','rent']).optional(),limit:finiteNumber.pipe(z.number().int().min(1).max(1000)).default(1000),q:z.string().trim().max(200).optional()}).strict().parse(c.req.query());
    const status=await repo.status(),active=new Set(status.sources.map(s=>s.snapshotId));
    const requested=marketGeographies.geographies.filter(g=>!q.tenure||g.tenure===q.tenure);
    if(requested.some(g=>!active.has(g.snapshotId)))return c.json({error:'market_geography_registry_stale',message:'Rebuild the geography inventory from the current imported canonical snapshots.'},503);
    const matches=requested.filter(g=>!q.q||g.name.toLowerCase().includes(q.q.toLowerCase()));
    return c.json({version:2,geographies:matches.slice(0,q.limit),total:matches.length,truncated:matches.length>q.limit,sources:sourceEvidence(status.sources,[...new Set(matches.map(g=>g.snapshotId))]),explanation:'Original publisher geographies selected explicitly. No town-to-market-region mapping is inferred.'});
  });
  app.get('/features',async c => {
    const q = featureRequestSchema.parse(c.req.query());
    const query:FeatureQuery = {categories:q.categories,limit:q.limit,cursor:q.cursor,...(q.bbox ? {bbox:q.bbox} : {near:{longitude:q.longitude!,latitude:q.latitude!,radiusM:q.radiusM!}})};
    const page = await repo.features(query);
    const status = await repo.status();
    return c.json({version:2,data:featureCollection(page.records),nextCursor:page.nextCursor,snapshotIds:page.snapshotIds,sources:recordSources(status.sources,page.records.map(r=>r.record)),explanation:missingExplanation});
  });
  app.get('/areas',async c => {
    const q = areasRequestSchema.parse(c.req.query());
    const page = await repo.areasAtPoint({longitude:q.longitude,latitude:q.latitude},q.categories,q.limit,q.cursor);
    const status = await repo.status();
    return c.json({version:2,data:featureCollection(page.records),nextCursor:page.nextCursor,snapshotIds:page.snapshotIds,sources:recordSources(status.sources,page.records.map(r=>r.record)),explanation:'Polygon membership is area context. It does not establish a property connection, access or serviceability.'});
  });
  app.get('/market-context',async c => {
    if (c.req.query('placeId') !== undefined) throw new QueryError('Use geographyCode and geographyCodeSystem; a town ID cannot be joined to market regions without a verified crosswalk.');
    const query = marketRequestSchema.parse(c.req.query());
    const page = await repo.marketContext(query);
    const status = await repo.status();
    return c.json({version:2,records:page.records,nextCursor:page.nextCursor,snapshotIds:page.snapshotIds,sources:recordSources(status.sources,page.records),evidenceStatus:'context_only',limitation:'Historical area observations do not establish dwelling availability, household affordability or bedrooms of an individual property. Missing and suppressed amounts remain null.'});
  });
  app.get('/context',async c=>{
    const query=contextRequestSchema.parse(c.req.query()),page=await repo.contextRecords(query),status=await repo.status();
    return c.json({version:2,records:page.records,nextCursor:page.nextCursor,snapshotIds:page.snapshotIds,sources:recordSources(status.sources,page.records),evidenceStatus:'context_only',explanation:'Nonspatial source records. Exact publisher geography filters are optional; no town, point or household join is inferred.'});
  });
  app.post('/layers',async c => {
    const {preferences:p,bbox,limit,marketGeography,contextGeography} = parseLayerInput(await c.req.json());
    const before = await repo.status();
    const layers = await Promise.all(p.criteria.map(async selected => {
      const definition = criteriaRegistry.criteria.find(d => d.id === selected.id)!;
      const base = {id:selected.id,vertical:definition.vertical,category:definition.category,parameters:selected.parameters};
      if (definition.method === 'market_context') {
        const page:Page<CommonRecord> = marketGeography ? await repo.marketContext({geographyCode:marketGeography.code,geographyCodeSystem:marketGeography.codeSystem,tenure:definition.category as 'buy'|'rent',bedrooms:selected.parameters.bedrooms,limit}) : {records:[],nextCursor:null,snapshotIds:[]};
        return {...base,data:featureCollection([]),context:page.records,nextCursor:page.nextCursor,snapshotIds:page.snapshotIds,sources:recordSources(before.sources,page.records),evidenceStatus:page.records.length ? 'context_only' : 'unknown',explanation:marketGeography ? 'Historical observations for the explicit geography code. Unknown bedroom counts do not match requested bedrooms. These are not available homes.' : 'Provide marketGeography.code and codeSystem; no town-to-market-region join is inferred.'};
      }
      const mapping=(layerCategories.criteria as Record<string,{spatial:string[];context?:string[];explanation?:string}>)[selected.id];
      const context=mapping?.context&&contextGeography?await repo.contextRecords({categories:mapping.context,geographyCode:contextGeography.code,geographyCodeSystem:contextGeography.codeSystem,limit}):{records:[],nextCursor:null,snapshotIds:[]};
      const page = await repo.features({categories:mapping?.spatial??[definition.category],limit,...(bbox ? {bbox} : {near:{longitude:p.location.longitude,latitude:p.location.latitude,radiusM:p.radiusKm*1000}})});
      return {...base,data:featureCollection(page.records),displayCategories:mapping?.spatial??[definition.category],contextCategories:mapping?.context??[],context:context.records,contextNextCursor:context.nextCursor,nextCursor:page.nextCursor,snapshotIds:[...new Set([...page.snapshotIds,...context.snapshotIds])],sources:recordSources(before.sources,[...page.records.map(r=>r.record),...context.records]),evidenceStatus:page.records.length||context.records.length ? 'partial' : 'unknown',explanation:`${mapping?.explanation??''} ${mapping?.context&&!contextGeography?'Provide contextGeography for exact nonspatial area context; no pin-to-directory join is inferred. ':''}Recorded category features for display. Requested age, named facility, service capability and household suitability have not been established. ${missingExplanation}`};
    }));
    const after = await repo.status();
    if (!sameSnapshots(before.sources,after.sources)) throw new QueryError('Active source snapshots changed during the layer request; retry.',409);
    return c.json({version:2,location:p.location,radiusKm:p.radiusKm,layers,rankingReady:false});
  });
  app.post('/assess',async c => {
    const p:Preferences = parsePreferences(await c.req.json());
    const before = await repo.status();
    const results = await Promise.all(p.criteria.map(async selected => {
      const definition = criteriaRegistry.criteria.find(d => d.id === selected.id)!;
      const base = {id:selected.id,vertical:definition.vertical,importance:selected.importance,weight:selected.weight ?? definition.defaultWeight,parameters:{...definition.defaults,...selected.parameters},score:null,match:'unknown',evidenceStatus:'unknown'};
      if (definition.method === 'distance' && selected.parameters.childAge === undefined && !selected.parameters.requiredService && !selected.parameters.facilityId) {
        // This independent nearest query never reuses a truncated display page.
        const page = await repo.features({categories:[definition.category],kinds:['service'],near:{longitude:p.location.longitude,latitude:p.location.latitude,radiusM:50000},limit:1});
        const first = page.records[0];
        if (first?.record.geometry?.type === 'Point' && first.distanceM !== undefined) return {...base,evidenceStatus:'recorded_point_proximity',metric:{type:'recorded_point_distance_m',value:first.distanceM,facilityId:first.record.id},sources:recordSources(before.sources,[first.record]),reason:'Distance to a recorded point within the 50 km query. Proposed thresholds and partial source coverage are not an accepted ranking or proof of access, suitability or availability.'};
        return {...base,reason:'No suitable recorded point was returned within the 50 km query. Polygon distance does not establish distance to an entrance. Missing evidence is unknown.'};
      }
      const reason = definition.method === 'travel_time' ? 'Routing, mode, timetable and service-capability evidence are required; recorded proximity is not travel time.' : definition.method === 'property_evidence' ? 'Area membership or nearby assets cannot establish household utility connections or serviceability.' : definition.method === 'market_context' ? 'Historical market context does not establish an available affordable dwelling. Query /market-context with explicit geography codes.' : 'Requested suitability is unverified or this criterion is information only.';
      return {...base,reason};
    }));
    const after = await repo.status();
    if (!sameSnapshots(before.sources,after.sources)) throw new QueryError('Active source snapshots changed during assessment; retry.',409);
    const verticals = [...new Set(results.map(r => r.vertical))].map(vertical => ({vertical,selectedCriteria:results.filter(r => r.vertical === vertical).length,scoredCriteria:0,score:null}));
    return c.json({version:2,location:p.location,configurationStatus:criteriaRegistry.status,results,verticals,aggregate:{score:null,rankingReady:false,selectedCriteria:results.length,scoredCriteria:0,requiredEvidenceMissing:results.filter(r => r.importance === 'required').map(r => r.id),explanation:'Common-schema foundation: partial observations and proposed thresholds are not sufficient for accepted scores. Preferences are processed for this request and are not stored.'}});
  });
  return app;
}
