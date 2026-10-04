import { z } from 'zod';
import { commonRecordSchema, commonManifestSchema, bboxSchema } from './schema';
import { preferencesSchema } from '../schema';
import registry from '../../config/criteria.json';
import layerCategories from '../../config/layer-categories.json';
const ref=(name:string)=>({'$ref':`#/components/schemas/${name}`});
const record=ref('CommonRecord'),manifest=ref('CommonManifest');
const json=(schema:unknown)=>({content:{'application/json':{schema}}});
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required});
const array=(items:unknown)=>({type:'array',items});
const nullableString={type:['string','null']};
const paging={nextCursor:nullableString,snapshotIds:array({type:'string'}),sources:array(manifest)};
const geojson=object({type:{const:'FeatureCollection'},features:array(object({type:{const:'Feature'},id:{type:'string'},geometry:{type:'object'},properties:{type:'object'}}))});
const error={description:'Invalid request or snapshot conflict',...json(object({error:{type:'string'},message:{type:'string'}},['error']))};
const responses=(schema:unknown)=>({'200':{description:'Successful response',...json(schema)},'400':error,'409':error,'500':{description:'Internal error',...json(object({error:{type:'string'}}))}});
const param=(name:string,schema:unknown,required=false,description?:string)=>({name,in:'query',required,schema,...(description?{description}:{})});
const limit=param('limit',{type:'integer',minimum:1,maximum:250,default:100});
const cursor=param('cursor',{type:'string',maxLength:4096},false,'Opaque query-bound cursor. Restart paging after HTTP 409.');
const categories=param('categories',{type:'string'},false,'Comma-separated categories from /data-status and the criterion registry.');
const longitude=param('longitude',{type:'number',minimum:-11,maximum:-5});
const latitude=param('latitude',{type:'number',minimum:51,maximum:56});
const geo=[param('geographyCode',{type:'string'},true,'Original publisher geography code, without inferred town joins.'),param('geographyCodeSystem',{type:'string'},true)];
const preferences=z.toJSONSchema(preferencesSchema,{io:'input'}) as any;
const layers={...preferences,properties:{...preferences.properties,bbox:z.toJSONSchema(bboxSchema),limit:{type:'integer',minimum:1,maximum:250,default:100},marketGeography:object({code:{type:'string'},codeSystem:{type:'string'}}),contextGeography:object({code:{type:'string'},codeSystem:{type:'string'}})}};
const paths:Record<string,unknown>={
  '/':{get:{operationId:'apiIndex',summary:'API links and capabilities',responses:responses({type:'object'})}},
  '/health':{get:{operationId:'liveness',summary:'Process liveness',responses:responses(object({status:{const:'ok'},version:{const:2},mode:{type:'string'}}))}},
  '/ready':{get:{operationId:'readiness',summary:'Database and imported-snapshot readiness',responses:{...responses({type:'object'}),'503':{description:'Database or imported data unavailable',...json({type:'object'})}}}},
  '/openapi.json':{get:{operationId:'apiContract',summary:'OpenAPI 3.1 contract',responses:responses({type:'object'})}},
  '/criteria':{get:{operationId:'criterionRegistry',summary:'Configurable criteria; no fixed selection count',responses:responses({type:'object'})}},
  '/data-status':{get:{operationId:'dataStatus',summary:'Active snapshots, raw adapter status and coverage',responses:responses(object({version:{const:2},totalRecords:{type:'integer'},sources:array(manifest),adapterRegistry:{type:'object'},rankingReady:{const:false}}))}},
  '/places':{get:{operationId:'findPlaces',summary:'Search indexed CSO urban-area names',parameters:[param('q',{type:'string',minLength:1,maxLength:200},true),limit,cursor],responses:responses(object({version:{const:2},places:array(record),...paging}))}},
  '/place-anchor':{get:{operationId:'placeAnchor',summary:'Representative point on an active town polygon',description:'Not a geocoded home or confirmed destination.',parameters:[param('placeId',{type:'string'},true)],responses:responses({type:'object'})}},
  '/market-geographies':{get:{operationId:'marketGeographies',summary:'Original buying/rental geography choices and latest source period',parameters:[param('tenure',{enum:['buy','rent']}),param('q',{type:'string'}),param('limit',{type:'integer',minimum:1,maximum:1000,default:1000})],responses:responses({type:'object'})}},
  '/features':{get:{operationId:'findFeatures',summary:'GeoJSON viewport or metre-radius search',description:'Provide bbox OR longitude, latitude and radiusM. Combining them is invalid. Recorded geometry distance is not travel time.',parameters:[param('bbox',{type:'string',example:'-6.4,53.2,-6.1,53.5'},false,'west,south,east,north, with a positive-area Ireland extent'),longitude,latitude,param('radiusM',{type:'number',minimum:1,maximum:50000}),categories,limit,cursor],responses:responses(object({version:{const:2},data:geojson,...paging}))}},
  '/areas':{get:{operationId:'areasAtPoint',summary:'Boundary-inclusive area context at a point',description:'Source-protection and statistical areas do not establish household utility connections.',parameters:[{...longitude,required:true},{...latitude,required:true},categories,limit,cursor],responses:responses(object({version:{const:2},data:geojson,...paging}))}},
  '/market-context':{get:{operationId:'marketObservations',summary:'Exact-geography historical buying/rental statistics',parameters:[...geo,param('tenure',{enum:['buy','rent']}),param('period',{type:'string'}),param('propertyType',{enum:['house','apartment','all','unknown']}),param('bedroomClass',{type:'string'}),param('bedrooms',{type:'integer',minimum:0}),limit,cursor],responses:responses(object({version:{const:2},records:array(record),...paging}))}},
  '/context':{get:{operationId:'informationContext',summary:'Nonspatial housing, supply-directory and property-transaction records',description:'Without geography filters this is a national source listing. It does not map records to the chosen point. PPR rows are transactions, not statistics or listings.',parameters:[categories,...geo.map(p=>({...p,required:false})),limit,cursor],responses:responses(object({version:{const:2},records:array(record),...paging}))}},
  '/layers':{post:{operationId:'preferenceLayers',summary:'Generate selected GeoJSON and information layers',description:'Any number of distinct registered criteria. Exact marketGeography/contextGeography codes are independent from the pin. Display mappings are in config/layer-categories.json.',requestBody:{required:true,...json(ref('LayerPreferences'))},responses:responses(object({version:{const:2},layers:array({type:'object'}),rankingReady:{const:false}}))}},
  '/assess':{post:{operationId:'assessEvidence',summary:'Recorded proximity and explicit unknown evidence',description:'All scores are null while thresholds and source coverage are unapproved. No travel times, household connections, clinical suitability or property availability are inferred.',requestBody:{required:true,...json(ref('Preferences'))},responses:responses(object({version:{const:2},results:array({type:'object'}),verticals:array({type:'object'}),aggregate:{type:'object'}}))}},
};
await Bun.write('schemas/openapi.json',JSON.stringify({openapi:'3.1.0',info:{title:'Ireland location-services API',version:'2.1.0',description:'Local Hono/Bun + PostGIS API. GeoJSON map features and typed source context with explicit provenance. Dataset completeness and rankings are not certified.'},servers:[{url:'http://127.0.0.1:3080',description:'Native macOS development containers'}],paths,components:{schemas:{CommonRecord:z.toJSONSchema(commonRecordSchema),CommonManifest:z.toJSONSchema(commonManifestSchema),Preferences:preferences,LayerPreferences:layers}},'x-criterion-ids':registry.criteria.map(c=>c.id),'x-feature-categories':[...new Set([...registry.criteria.map(c=>c.category),'urban_area',...layerCategories.queryCategories])]},null,2)+'\n');
