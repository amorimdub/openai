import { rawLocatorShapes, locatorExists } from './raw-locators';
import { SQL } from 'bun';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { commonManifestSchema, commonRecordSchema, type CommonManifest, type CommonRecord } from './schema';
import { QueryError, type CommonRepository, type FeatureMatch, type FeatureQuery, type MarketQuery, type ContextQuery, type Origin, type Page } from './repository';

const normalize = (s:string) => s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
const fingerprint = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function fileHash(path:string) {
  const hash=createHash('sha256'); let bytes=0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes+=chunk.length; }
  return {sha256:hash.digest('hex'), bytes};
}
async function* lines(path:string) {
  let number=0;
  for await (const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})) {
    number++; if(!line.trim()) throw new Error(`Blank NDJSON line ${number}`);
    yield {line,number};
  }
}
type Cursor = {v:2; query:string; snapshotHash:string; id:string; distance?:number};
function checkLimit(limit:number) { if(!Number.isInteger(limit)||limit<1||limit>1000) throw new QueryError('limit must be an integer from 1 to 1000'); }
function checkPoint(p:Origin) { if(!Number.isFinite(p.longitude)||!Number.isFinite(p.latitude)||p.longitude < -180||p.longitude>180||p.latitude < -90||p.latitude>90) throw new QueryError('Invalid coordinates'); }
function readCursor(value:string|undefined,query:string,snapshots:string[]):Cursor|null {
  if(!value) return null;
  if(value.length>4096)throw new QueryError("Cursor too long");
  let c:Cursor;
  try { c=JSON.parse(Buffer.from(value,'base64url').toString()); } catch {throw new QueryError('Invalid cursor');}
  if(c.v!==2||typeof c.id!=='string'||typeof c.snapshotHash!=='string'||typeof c.query!=='string'||(c.distance!==undefined&&!Number.isFinite(c.distance))) throw new QueryError('Invalid cursor');
  if(c.query!==query) throw new QueryError('Cursor belongs to a different query');
  if(c.snapshotHash!==fingerprint(snapshots)) throw new QueryError('Data changed; restart pagination',409);
  return c;
}
function nextCursor(query:string,snapshots:string[],id:string,distance?:number) {return Buffer.from(JSON.stringify({v:2,query,snapshotHash:fingerprint(snapshots),id,...(distance===undefined?{}:{distance})})).toString('base64url');}

export class PostgisRepository implements CommonRepository {
  readonly sql:SQL;
  constructor(url:string, readonly rawRoot=resolve(process.cwd(),'data/raw')) { this.sql=new SQL(url,{max:8}); }
  async initialize() { const migration=await Bun.file(new URL('../../migrations/001-common-postgis.sql',import.meta.url)).text(); await this.sql.begin(async tx=>{await tx.unsafe(migration).simple();}); }
  async close() {await this.sql.close();}
  async importFile(filePath:string) {
    const manifest=commonManifestSchema.parse(await Bun.file(filePath+'.manifest.json').json());
    if(manifest.reuseStatus!=='approved') throw new Error('Only approved reuse manifests may be published');
    const originalHash=await fileHash(filePath);
    if(originalHash.sha256!==manifest.sha256) throw new Error('Canonical file hash mismatch');
    for(const asset of manifest.rawAssets) {
      const actual=await fileHash(resolve(this.rawRoot,asset.path));
      if(actual.sha256!==asset.sha256||actual.bytes!==asset.bytes) throw new Error(`Raw asset integrity mismatch: ${asset.path}`);
    }
    const rawPaths=new Set(manifest.rawAssets.map(a=>a.path));
    const locatorShapes=await rawLocatorShapes(this.rawRoot,manifest.rawAssets);
    const ids=new Set<string>(); let count=0,unlocated=0;
    const validate=(line:string,number:number) => {
      let record:CommonRecord;
      try {record=commonRecordSchema.parse(JSON.parse(line));} catch(error) {throw new Error(`Invalid record at line ${number}: ${String(error)}`);}
      if(record.sourceId!==manifest.sourceId||record.scope!==manifest.scope||record.snapshotId!==manifest.snapshotId) throw new Error(`Record identity differs from manifest at line ${number}`);
      if(!rawPaths.has(record.raw.path)) throw new Error(`Unknown raw asset at line ${number}`);
      if(!locatorExists(record,locatorShapes))throw new Error(`Raw locator does not exist at line ${number}`);
      return record;
    };
    for await(const {line,number} of lines(filePath)) { const r=validate(line,number); if(ids.has(r.id)) throw new Error(`Duplicate record ID: ${r.id}`); ids.add(r.id); count++; if(!r.geometry)unlocated++; }
    if(count!==manifest.recordCount||unlocated!==manifest.quality.unlocatedRecords) throw new Error('Manifest count or unlocated count mismatch');
    return await this.sql.begin(async tx=>{
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${manifest.sourceId+':'+manifest.scope},0))`;
      const existing=await tx`SELECT snapshot_id, data_hash, manifest = ${manifest}::jsonb AS same_manifest FROM common_snapshots WHERE snapshot_id=${manifest.snapshotId}`;
      if(existing.length) {
        if(existing[0].data_hash!==manifest.sha256||!existing[0].same_manifest) throw new Error('Snapshot ID collision with different content or manifest');
        return {snapshotId:manifest.snapshotId,sourceId:manifest.sourceId,scope:manifest.scope,imported:count,unchanged:true};
      }
      await tx`INSERT INTO common_snapshots(snapshot_id,source_id,scope,manifest,data_hash) VALUES(${manifest.snapshotId},${manifest.sourceId},${manifest.scope},${manifest}::jsonb,${manifest.sha256})`;
      let batch:unknown[]=[];
      const flush=async()=>{
        if(!batch.length)return;
        await tx.unsafe(`INSERT INTO common_records(snapshot_id,id,source_id,scope,kind,category,name_normalized,geometry,record)
          SELECT $1,r->>'id',r->>'sourceId',r->>'scope',r->>'kind',r->>'category',n,
          CASE WHEN r->'geometry'='null'::jsonb THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(r->'geometry'),4326) END,r
          FROM jsonb_to_recordset($2::jsonb) AS x(r jsonb,n text)`,[manifest.snapshotId,batch]);
        batch=[];
      };
      // Second read stages only already validated records. Hash again before publication to reject file changes.
      for await(const {line,number} of lines(filePath)) {const r=validate(line,number); batch.push({r,n:normalize(r.name)}); if(batch.length>=100)await flush();}
      await flush();
      const finalHash=await fileHash(filePath);
      if(finalHash.sha256!==manifest.sha256)throw new Error('Canonical file changed during import');
      const staged=await tx`SELECT count(*)::int AS count FROM common_records WHERE snapshot_id=${manifest.snapshotId}`;
      if(staged[0].count!==count)throw new Error('Staged count mismatch');
      await tx`INSERT INTO common_active(source_id,scope,snapshot_id) VALUES(${manifest.sourceId},${manifest.scope},${manifest.snapshotId}) ON CONFLICT(source_id,scope) DO UPDATE SET snapshot_id=excluded.snapshot_id`;
      return {snapshotId:manifest.snapshotId,sourceId:manifest.sourceId,scope:manifest.scope,imported:count,unchanged:false};
    });
  }
  async status() {
    return await this.sql.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY',async tx=>{
      const sources=await tx`SELECT s.manifest FROM common_active a JOIN common_snapshots s USING(snapshot_id) ORDER BY a.source_id,a.scope`;
      const manifests=sources.map((r:any)=>commonManifestSchema.parse(r.manifest));
      // Import publication validates staged row totals before atomically activating an immutable manifest.
      return {recordCount:manifests.reduce((n:number,m:CommonManifest)=>n+m.recordCount,0),sources:manifests};
    });
  }
  private async queryPage<T>(identity:unknown,limit:number,cursor:string|undefined,build:(snapshots:string[],cursor:Cursor|null)=>{text:string;params:unknown[]},map:(row:any)=>T):Promise<Page<T>> {
    checkLimit(limit); const query=fingerprint(identity);
    return await this.sql.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY',async tx=>{
      const active=await tx`SELECT snapshot_id FROM common_active ORDER BY snapshot_id`;
      const snapshots=active.map((r:any)=>r.snapshot_id as string); const position=readCursor(cursor,query,snapshots);
      const statement=build(snapshots,position); const rows=await tx.unsafe(statement.text,statement.params);
      const more=rows.length>limit; const page=rows.slice(0,limit); const last=page.at(-1);
      return {records:page.map(map),snapshotIds:snapshots,nextCursor:more&&last?nextCursor(query,snapshots,last.id,last.distance_m===undefined?undefined:Number(last.distance_m)):null};
    });
  }
  async placeAnchor(placeId:string) {
    if(!placeId||placeId.length>1000)throw new QueryError('Invalid place ID');
    const rows=await this.sql`SELECT r.record,ST_X(ST_PointOnSurface(r.geometry)) AS longitude,ST_Y(ST_PointOnSurface(r.geometry)) AS latitude FROM common_records r JOIN common_active a ON r.snapshot_id=a.snapshot_id WHERE r.id=${placeId} AND r.kind='place' LIMIT 1`;
    if(!rows.length)return null;
    return {place:commonRecordSchema.parse(rows[0].record),longitude:Number(rows[0].longitude),latitude:Number(rows[0].latitude)};
  }
  async searchPlaces(q:string,limit:number,cursor?:string) {
    const normalized=normalize(q); if(!normalized||normalized.length>200)throw new QueryError('Search text must have 1 to 200 characters');
    const escaped=normalized.replace(/[\\%_]/g,'\\$&');
    return this.queryPage({type:'places',q:normalized,limit},limit,cursor,(_,c)=>{
      const params:unknown[]=['%'+escaped+'%',limit+1]; let where="r.kind='place' AND r.name_normalized LIKE $1 ESCAPE '\\'";
      if(c){params.push(c.id);where+=' AND r.id>$3';}
      return {text:`SELECT r.id,r.record FROM common_records r JOIN common_active a ON r.snapshot_id=a.snapshot_id WHERE ${where} ORDER BY r.id LIMIT $2`,params};
    },row=>commonRecordSchema.parse(row.record));
  }
  async features(query:FeatureQuery):Promise<Page<FeatureMatch>> {
    if(!query.bbox&&!query.near)throw new QueryError("bbox or near is required");
    if(query.near){checkPoint(query.near);if(!Number.isFinite(query.near.radiusM)||query.near.radiusM<=0||query.near.radiusM>200000)throw new QueryError('radiusM must be greater than 0 and at most 200000');}
    if(query.bbox&&(!query.bbox.every(Number.isFinite)||query.bbox[0]>=query.bbox[2]||query.bbox[1]>=query.bbox[3]||query.bbox[0]<-180||query.bbox[2]>180||query.bbox[1]<-90||query.bbox[3]>90))throw new QueryError('Invalid bbox');
    const categories=query.categories?[...new Set(query.categories)].sort():undefined; const kinds=query.kinds?[...new Set(query.kinds)].sort():undefined;
    return this.queryPage({type:'features',bbox:query.bbox,near:query.near,categories,kinds,limit:query.limit},query.limit,query.cursor,(_,c)=>{
      const params:unknown[]=[]; const bind=(v:unknown)=>{params.push(v);return '$'+params.length;};
      const filters=['r.geometry IS NOT NULL']; const precise:string[]=[]; let distance:string|undefined;
      // Explicit equality parameters expose selective categories/kinds to the PostgreSQL planner.
      if(categories?.length)filters.push(`r.category IN (${categories.map(bind).join(',')})`);
      if(kinds?.length)filters.push(`r.kind IN (${kinds.map(bind).join(',')})`);
      if(query.bbox){const envelope=`ST_MakeEnvelope(${query.bbox.map(bind).join(',')},4326)`;filters.push(`r.geometry && ${envelope}`);precise.push(`ST_Intersects(c.geometry,${envelope})`);}
      if(query.near){const point=`ST_SetSRID(ST_MakePoint(${bind(query.near.longitude)},${bind(query.near.latitude)}),4326)::geography`;const radius=bind(query.near.radiusM);
        // This is the identical bounding predicate inserted by ST_DWithin's geography GiST support.
        // It is only a candidate filter; exact spheroidal ST_DWithin remains mandatory below.
        filters.push(`r.geometry::geography && _ST_Expand(${point},${radius})`);
        precise.push(`ST_DWithin(c.geometry::geography,${point},${radius})`);
        distance=`ST_Distance(c.geometry::geography,${point})`;
      }
      let matched=`SELECT c.id,c.snapshot_id${distance?`,${distance} AS distance_m`:''} FROM candidates c${precise.length?' WHERE '+precise.join(' AND '):''}`;
      const cursorFilter=c ? distance ? (()=>{if(c.distance===undefined)throw new QueryError('Invalid distance cursor');return ` WHERE (distance_m,id)>(${bind(c.distance)},${bind(c.id)})`;})() : ` WHERE id>${bind(c.id)}` : '';
      const ordering=distance?'distance_m,id':'id';
      const text=`WITH candidates AS MATERIALIZED (
        SELECT r.id,r.snapshot_id,r.geometry FROM common_records r JOIN common_active a ON r.snapshot_id=a.snapshot_id WHERE ${filters.join(' AND ')}
      ), winners AS MATERIALIZED (
        SELECT * FROM (${matched}) measured${cursorFilter} ORDER BY ${ordering} LIMIT ${bind(query.limit+1)}
      ) SELECT w.id,r.record${distance?',w.distance_m':''} FROM winners w JOIN common_records r ON r.snapshot_id=w.snapshot_id AND r.id=w.id ORDER BY ${distance?'w.distance_m,':''}w.id`;
      return {text,params};
    },row=>({record:commonRecordSchema.parse(row.record),...(row.distance_m===undefined?{}:{distanceM:Number(row.distance_m)})}));
  }
  async areasAtPoint(point:Origin,categories:string[]|undefined,limit:number,cursor?:string) {
    checkPoint(point);
    return this.queryPage({type:'areas',point,categories,limit},limit,cursor,(_,c)=>{
      const params:unknown[]=[point.longitude,point.latitude,limit+1]; let where="r.kind IN ('place','utility_area') AND ST_Covers(r.geometry,ST_SetSRID(ST_MakePoint($1,$2),4326))";
      if(categories?.length){const placeholders=categories.map(category=>{params.push(category);return '$'+params.length;});where+=` AND r.category IN (${placeholders.join(',')})`;}
      if(c){params.push(c.id);where+=` AND r.id>$${params.length}`;}
      return {text:`SELECT r.id,r.record FROM common_records r JOIN common_active a ON r.snapshot_id=a.snapshot_id WHERE ${where} ORDER BY r.id LIMIT $3`,params};
    },row=>({record:commonRecordSchema.parse(row.record)}));
  }
  async contextRecords(query:ContextQuery) {
    const categories=query.categories?[...new Set(query.categories)].sort():undefined;
    if(Boolean(query.geographyCode)!==Boolean(query.geographyCodeSystem))throw new QueryError('Provide both geography code and code system');
    return this.queryPage({type:'context',categories,geographyCode:query.geographyCode,geographyCodeSystem:query.geographyCodeSystem,limit:query.limit},query.limit,query.cursor,(_,c)=>{
      const params:unknown[]=[];const bind=(v:unknown)=>{params.push(v);return '$'+params.length;};
      const where=["r.geometry IS NULL", "r.kind IN ('utility_observation','housing_information','property_transaction','service','infrastructure')"];
      if(categories?.length)where.push(`r.category IN (${categories.map(bind).join(',')})`);
      if(query.geographyCode)where.push(`r.record->'attributes'->'geography'->>'code'=${bind(query.geographyCode)}`,`r.record->'attributes'->'geography'->>'codeSystem'=${bind(query.geographyCodeSystem)}`);
      if(c)where.push(`r.id>${bind(c.id)}`);
      return {text:`SELECT r.id,r.record FROM common_records r JOIN common_active a ON r.snapshot_id=a.snapshot_id WHERE ${where.join(' AND ')} ORDER BY r.id LIMIT ${bind(query.limit+1)}`,params};
    },r=>commonRecordSchema.parse(r.record));
  }
  async marketContext(query:MarketQuery) {
    if(!query.geographyCode||!query.geographyCodeSystem)throw new QueryError('Exact geography code and code system are required');
    return this.queryPage({type:'market',...query,cursor:undefined},query.limit,query.cursor,(_,c)=>{
      const params:unknown[]=[query.geographyCode,query.geographyCodeSystem]; const bind=(v:unknown)=>{params.push(v);return '$'+params.length;};
      const clauses=["r.kind='market_context'","r.record->'attributes'->'geography'->>'code'=$1","r.record->'attributes'->'geography'->>'codeSystem'=$2"];
      for(const key of ['tenure','period','propertyType','bedroomClass'] as const)if(query[key]!==undefined)clauses.push(`r.record->'attributes'->>'${key}'=${bind(query[key])}`);
      if(query.bedrooms!==undefined){if(!Number.isInteger(query.bedrooms)||query.bedrooms<0)throw new QueryError('Invalid bedrooms');clauses.push(`(r.record->'attributes'->>'bedrooms')::integer=${bind(query.bedrooms)}`);}
      if(c)clauses.push(`r.id>${bind(c.id)}`);
      return {text:`SELECT r.id,r.record FROM common_records r JOIN common_active a ON r.snapshot_id=a.snapshot_id WHERE ${clauses.join(' AND ')} ORDER BY r.id LIMIT ${bind(query.limit+1)}`,params};
    },row=>commonRecordSchema.parse(row.record));
  }
}
