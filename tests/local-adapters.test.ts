import {describe,test,expect} from 'bun:test';
import * as XLSX from 'xlsx';
import {Database} from 'bun:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {localAdapters,parseLocalCsv,geoPackagePoint} from '../src/common/adapters/local';
import {commonRecordSchema} from '../src/common/schema';
const context={path:'fixture/source.json',snapshotId:'fixture'};
const json=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const plan=(id:string)=>localAdapters.find(p=>p.id===id)!;
async function rows(id:string,payload:Uint8Array){const out=[];for await(const row of plan(id).rows(payload,context))out.push(row);return out;}
function point(){const b=new Uint8Array(29);b[0]=71;b[1]=80;b[3]=1;const v=new DataView(b.buffer);v.setInt32(4,2157,true);v.setUint8(8,1);v.setUint32(9,1,true);v.setFloat64(13,700000,true);v.setFloat64(21,730000,true);return b;}

describe('Licensed local adapters',()=>{
 test('DLR mixed facilities retain categories and exclude phone/email fields',async()=>{
  const out=await rows('community-dlr',json({type:'FeatureCollection',features:[{type:'Feature',properties:{FID:1,name:'Local library',category:'Library',Email:'private@example.test',Phone:'123'},geometry:{type:'Point',coordinates:[-6.2,53.3]}}]}));
  const r=(out[0] as any).record;expect(r.category).toBe('libraries');expect(r.attributes.serviceType).toBe('Library');expect(r.attributes.Email).toBeUndefined();expect(commonRecordSchema.safeParse(r).success).toBe(true);
 });
 test('lighting keeps dated asset status unknown and preserves unlocated records',async()=>{
  const out=await rows('lighting-dlr',json({type:'FeatureCollection',features:[{type:'Feature',properties:{OBJECTID:1,PostalStreetName:'Main',LAMP:'LED'},geometry:null}]}));
  const r=(out[0] as any).record;expect(r.kind).toBe('infrastructure');expect(r.geometry).toBeNull();expect(r.locationStatus).toBe('unlocated');expect(r.attributes.status).toBe('unknown');expect(r.observedPeriod).toBe('2021-04-19');expect(r.category).toBe('street_lighting');
 });
 test('known corrupt Fingal community inventory is quarantined without coordinate guessing',async()=>{
  const out=await rows('community-fcc',json({features:[{attributes:{OBJECTID:1,Organisation:'Centre',Lat:-6.2,Long:53.4},geometry:{x:5000000,y:-700000}}]}));
  expect(out).toHaveLength(1);expect((out[0] as any).quarantineReason).toContain('transposed/corrupt');expect((out[0] as any).record).toBeUndefined();
 });
 test('GSI study dates and source protection meaning do not imply household supply',async()=>{
  const out=await rows('water-gsi-group',json({spatialReference:{wkid:4326},features:[{attributes:{OBJECTID:1,GWS_NAME:'Scheme',YEAR:2013},geometry:{rings:[[[-8,53],[-7.9,53],[-7.9,53.1],[-8,53.1],[-8,53]]]}}]}));
  const r=(out[0] as any).record;expect(r.observedPeriod).toBe('2013');expect(r.geometryMeaning).toBe('source_protection_boundary');expect(r.attributes.definition).toContain('does not indicate property connection');expect(r.attributes.metrics).toEqual([]);
 });
 test('EPA Irish Grid multipoint transforms to Ireland and keeps remedial context',async()=>{
  const out=await rows('water-ral',json({crs:{properties:{name:'urn:ogc:def:crs:EPSG::29902'}},features:[{type:'Feature',properties:{Scheme_Code:'1900PUB1002',Water_Supply_Name:'Adare',County:'Limerick',Inadequate_Disinfection:'True'},geometry:{type:'MultiPoint',coordinates:[[146503,146164]]}}]}));
  const r=(out[0] as any).record;expect(r.geometry.coordinates[0][0]).toBeLessThan(-8);expect(r.geometry.coordinates[0][1]).toBeGreaterThan(52);expect(r.attributes.issues).toEqual(['Inadequate_Disinfection']);expect(r.attributes.status).toBe('unknown');
 });
 test('CSV preserves quoted fields and every logical row; housing keeps dated nonspatial information',async()=>{
  expect(parseLocalCsv(new TextEncoder().encode('a,"two, parts","say ""hello"""\n'))).toEqual([['a','two, parts','say "hello"']]);
  const csv='summary\nunits\nNo.,Funding,LA,Scheme,Units,AHB,S1,S2,S3,S4,On Site,Completed\n1,CALF,Carlow,"A, scheme",18,Org,,,,,,Q4-2025\n,,,,,,,,,,,\n';
  const out=await rows('housing-construction',new TextEncoder().encode(csv));const r=(out.find(x=>'record'in x) as any).record;
  expect(r.kind).toBe('housing_information');expect(r.geometry).toBeNull();expect(r.attributes.status).toBe('completed: Q4-2025');expect(r.attributes.period).toBe('2026-Q1');expect(r.attributes.units).toBe(18);expect(r.raw.locator).toBe('csv/3');expect(out.filter(x=>'excludedReason'in x)).toHaveLength(4);
 });
 test('Uisce sheet produces typed directory information without invented geometry',async()=>{
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Water Services Area','Water Supply Zone Name','EDEN Water Supply Zone Code','WSZ ID','Water Resource Zone Code','Owned By','Population'],['Carlow','Town supply','CODE1','WSZ1','WR1','Irish Water',25]]),'WSZ 2026');
  const out=await rows('uisce-water-zones',new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})));const r=(out.find(x=>'record'in x) as any).record;
  expect(r.geometry).toBeNull();expect(r.kind).toBe('utility_observation');expect(r.attributes.population).toBe(25);expect(r.attributes.supplyCode).toBe('CODE1');expect(r.raw.locator).toBe('XLSXsheet:WSZ 2026/row:2');expect(r.attributes.definition).toContain('no household connection inference');
 });
 test('GeoPackage point decoding and read-only Cork adapter retain source identity',async()=>{
  const p=geoPackagePoint(point());expect(p[0]).toBeGreaterThan(-7);expect(p[1]).toBeGreaterThan(53);
  const dir=await mkdtemp(join(tmpdir(),'cork-adapter-test-'));const file=join(dir,'source.gpkg');const db=new Database(file);db.exec('CREATE TABLE gpkg_geometry_columns(table_name TEXT,geometry_type_name TEXT,srs_id INTEGER); CREATE TABLE Parks(OBJECTID INTEGER,SHAPE BLOB,Name TEXT,Type TEXT)');db.query('INSERT INTO gpkg_geometry_columns VALUES(?,?,?)').run('Parks','POINT',2157);db.query('INSERT INTO Parks VALUES(?,?,?,?)').run(1,point(),'Town park','Local');db.close();
  try{const out=await rows('cork-parks',new Uint8Array(await Bun.file(file).arrayBuffer()));const r=(out[0] as any).record;expect(r.category).toBe('parks');expect(r.externalId).toBe('1');expect(r.raw.locator).toBe('gpkg:Parks/OBJECTID:1');expect(r.attributes.serviceType).toBe('Local');}finally{await rm(dir,{recursive:true});}
 });
 test('every public adapter has dataset-specific reuse evidence and information limits',()=>{
  expect(localAdapters).toHaveLength(21);for(const adapter of localAdapters){expect(adapter.licenseEvidenceUrl).toMatch(/^https:\/\//);expect(adapter.limitations.length).toBeGreaterThan(0);expect(adapter.license).not.toBe('unverified');}expect(plan('housing-construction').license).toBe('CC-BY-SA-4.0');expect(plan('community-sdcc').license).toBe('CC0-1.0');
 });
});
