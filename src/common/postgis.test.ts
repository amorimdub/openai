import {afterAll,beforeAll,describe,expect,test} from 'bun:test';
import {SQL} from 'bun';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PostgisRepository} from './postgis';
import {commonRecordId,type CommonRecord,type CommonManifest} from './schema';
const run=process.env.POSTGIS_TEST_URL?describe:describe.skip;
run('PostGIS repository integration',()=>{
  let admin:SQL,repo:PostgisRepository,folder:string; const database='ireland_test_'+crypto.randomUUID().replaceAll('-','');
  const polygon:Extract<CommonRecord,{kind:"place"}>["geometry"]={type:'Polygon' as const,coordinates:[[[-6.3,53.3],[-6.2,53.3],[-6.2,53.4],[-6.3,53.4],[-6.3,53.3]],[[-6.27,53.33],[-6.23,53.33],[-6.23,53.37],[-6.27,53.37],[-6.27,53.33]]]};
  const raw=JSON.stringify({features:Array.from({length:10},()=>({}))});
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  function service(externalId:string,snapshotId:string,longitude=-6.26):CommonRecord {return {version:2,id:commonRecordId('test','national',externalId),externalId,sourceId:'test',scope:'national',snapshotId,name:'Park '+externalId,raw:{path:'raw.json',locator:'features/0'},observedPeriod:null,kind:'service',category:'parks',geometry:{type:'Point',coordinates:[longitude,53.35]},locationStatus:'located',geometryMeaning:'recorded_location',attributes:{access:'public'}};}
  async function exportFile(records:CommonRecord[],snapshotId:string,override:Partial<CommonManifest>={}) {
    const text=records.map(r=>JSON.stringify(r)).join('\n')+'\n';const file=join(folder,snapshotId+'.ndjson');
    const manifest:CommonManifest={version:2,snapshotId,sourceId:'test',scope:'national',publisher:'Test',sourceUrl:'https://example.org/raw',license:'CC0-1.0',licenseEvidenceUrl:'https://example.org/license',attribution:'Test',reuseStatus:'approved',fetchedAt:'2026-10-04T10:00:00Z',observedPeriod:null,geography:'Test',coverage:'partial',limitations:[],adapter:{id:'test',version:'1'},rawAssets:[{path:'raw.json',sha256:hash(raw),bytes:Buffer.byteLength(raw)}],recordCount:records.length,sha256:hash(text),format:'ndjson',quality:{inputRecords:records.length,acceptedRecords:records.length,quarantinedRecords:0,unlocatedRecords:records.filter(r=>!r.geometry).length,excludedRecords:0,exclusions:{}},...override};
    await Bun.write(file,text);await Bun.write(file+'.manifest.json',JSON.stringify(manifest));return file;
  }
  beforeAll(async()=>{
    folder=await mkdtemp(join(tmpdir(),'ireland-postgis-test-'));await Bun.write(join(folder,'raw.json'),raw);
    admin=new SQL(process.env.POSTGIS_TEST_URL!);await admin.unsafe(`CREATE DATABASE ${database}`).simple();
    const url=new URL(process.env.POSTGIS_TEST_URL!);url.pathname='/'+database;repo=new PostgisRepository(url.toString(),folder);await repo.initialize();
  },60000);
  afterAll(async()=>{await repo?.close();if(admin){await admin.unsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).simple();await admin.close();}if(folder)await rm(folder,{recursive:true});});
  test('atomic import, exact radius, pagination, query binding and limit validation',async()=>{
    const path=await exportFile([service('a','one'),service('b','one',-6.261),service('c','one',-6.5)],'one');
    expect((await repo.importFile(path)).imported).toBe(3);expect((await repo.importFile(path)).unchanged).toBe(true);
    const query={near:{longitude:-6.26,latitude:53.35,radiusM:200},limit:1,categories:['parks']};
    const first=await repo.features(query);expect(first.records[0]!.distanceM).toBe(0);expect(first.nextCursor).not.toBeNull();
    const second=await repo.features({...query,cursor:first.nextCursor!});expect(second.records[0]!.record.externalId).toBe('b');expect(second.records[0]!.distanceM).toBeGreaterThan(50);
    expect(second.nextCursor).toBeNull();
    await expect(repo.features({...query,near:{...query.near,radiusM:300},cursor:first.nextCursor!})).rejects.toThrow('different query');
    await expect(repo.features({...query,limit:0})).rejects.toThrow('limit');
  });
  test('replacement hides deletions, preserves history and invalidates cursors',async()=>{
    const first=await repo.features({bbox:[-7,53,-6,54],categories:['parks'],limit:1});
    await repo.importFile(await exportFile([service('b','two')],'two'));
    expect((await repo.status()).recordCount).toBe(1);
    await expect(repo.features({bbox:[-7,53,-6,54],categories:['parks'],limit:1,cursor:first.nextCursor!})).rejects.toMatchObject({status:409});
    expect((await repo.sql`SELECT count(*)::int AS count FROM common_records`)[0].count).toBe(4);
    await repo.importFile(join(folder,'one.ndjson'));expect((await repo.status()).sources[0]!.snapshotId).toBe('two');
  });
  test('invalid topology rolls back and source/hash/ID collisions never publish',async()=>{
    const bad=service('invalid','invalid');bad.geometry={type:'Polygon',coordinates:[[[-6.3,53.3],[-6.2,53.4],[-6.3,53.4],[-6.2,53.3],[-6.3,53.3]]]};
    await expect(repo.importFile(await exportFile([bad],'invalid'))).rejects.toThrow();
    expect((await repo.status()).sources[0]!.snapshotId).toBe('two');
    const path=await exportFile([service('x','two')],'two');await expect(repo.importFile(path)).rejects.toThrow('collision');
    const blocked=await exportFile([service('z','blocked')],'blocked',{reuseStatus:'unverified'});await expect(repo.importFile(blocked)).rejects.toThrow('approved');
    const mismatch=await exportFile([service('z','mismatch')],'mismatch',{sha256:'0'.repeat(64)});await expect(repo.importFile(mismatch)).rejects.toThrow('hash');
    const dangling=service('z','dangling');dangling.raw.locator='features/99';await expect(repo.importFile(await exportFile([dangling],'dangling'))).rejects.toThrow('locator');
    const duplicate=await exportFile([service('z','duplicate'),service('z','duplicate')],'duplicate');await expect(repo.importFile(duplicate)).rejects.toThrow('Duplicate');
  });
  test('polygon boundaries inclusive, holes excluded, normalized place search and market exact geography',async()=>{
    const place:Extract<CommonRecord,{kind:"place"}>={version:2,id:commonRecordId('test','national','area'),externalId:'area',sourceId:'test',scope:'national',snapshotId:'three',name:'Dúblin area',raw:{path:'raw.json',locator:'features/0'},observedPeriod:null,kind:'place',category:'urban_area',geometry:polygon,locationStatus:'located',geometryMeaning:'statistical_boundary',attributes:{geography:{code:'D',codeSystem:'test-geography',type:'area',name:'Dublin',vintage:'2022'},aliases:[]}};
    const market:CommonRecord={...place,id:commonRecordId('test','national','price'),externalId:'price',kind:'market_context',category:'buy',geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',attributes:{geography:place.attributes.geography,tenure:'buy',statistic:'median',amountEur:500000,unit:'EUR',period:'2026M07',propertyType:'house',propertyTypeLabel:'House',bedroomClass:null,bedrooms:null,sampleSize:12,observationStatus:'reported',sourceValue:500000,definition:'Observed',dimensions:{}}};
    await repo.importFile(await exportFile([place,market],'three'));
    expect((await repo.areasAtPoint({longitude:-6.3,latitude:53.35},undefined,10)).records.length).toBe(1);
    expect((await repo.areasAtPoint({longitude:-6.25,latitude:53.35},undefined,10)).records.length).toBe(0);
    expect((await repo.searchPlaces('Dublin',10)).records.length).toBe(1);
    const anchor=await repo.placeAnchor(place.id);expect(anchor).not.toBeNull();
    expect((await repo.sql`SELECT ST_Covers(ST_GeomFromGeoJSON(${place.geometry}::jsonb),ST_SetSRID(ST_MakePoint(${anchor!.longitude},${anchor!.latitude}),4326)) AS inside`)[0].inside).toBe(true);
    expect(await repo.placeAnchor(market.id)).toBeNull();
    expect((await repo.features({bbox:[-6.31,53.29,-6.19,53.41],limit:10})).records.length).toBe(1);
    const query={geographyCode:'D',geographyCodeSystem:'test-geography',limit:10,propertyType:'house',period:'2026M07'};
    expect((await repo.marketContext(query)).records.length).toBe(1);
    expect((await repo.marketContext({...query,geographyCodeSystem:'different'})).records.length).toBe(0);
    expect((await repo.marketContext({...query,bedrooms:3})).records.length).toBe(0);
  });
  test('indexed candidate prefilter agrees with exact geography at radius boundaries',async()=>{
    const records:CommonRecord[]=[];
    for(const [id,distance] of [['inner2',150],['inside',199.99],['edge',200],['outside',200.01]] as const){
      const projected=await repo.sql`SELECT ST_AsGeoJSON(ST_Project(ST_SetSRID(ST_MakePoint(-6.26,53.35),4326)::geography,${distance},radians(45))) AS geometry`;
      const record=service(id,'radius-boundary');record.geometry=JSON.parse(projected[0].geometry);records.push(record);
    }
    await repo.importFile(await exportFile(records,'radius-boundary'));
    const q={categories:['parks'],kinds:['service' as const],near:{longitude:-6.26,latitude:53.35,radiusM:200},limit:10};
    const page=await repo.features(q);
    const reference=await repo.sql`SELECT r.id,ST_Distance(r.geometry::geography,ST_SetSRID(ST_MakePoint(-6.26,53.35),4326)::geography) AS distance_m FROM common_records r JOIN common_active a ON a.snapshot_id=r.snapshot_id WHERE r.category='parks' AND r.kind='service' AND ST_DWithin(r.geometry::geography,ST_SetSRID(ST_MakePoint(-6.26,53.35),4326)::geography,200) ORDER BY distance_m,r.id`;
    expect(page.records.map(r=>r.record.id)).toEqual(reference.map((r:any)=>r.id));
    for(let i=0;i<reference.length;i++)expect(page.records[i]!.distanceM).toBeCloseTo(Number(reference[i].distance_m),6);
    expect(page.records.some(r=>r.record.externalId==='inside')).toBe(true);
    expect(page.records.some(r=>r.record.externalId==='outside')).toBe(false);
    const first=await repo.features({...q,limit:1});expect(first.nextCursor).not.toBeNull();
    const second=await repo.features({...q,limit:1,cursor:first.nextCursor!});expect(second.records[0]!.record.id).toBe(page.records[1]!.record.id);
    expect((await repo.features({...q,categories:['not-a-recorded-category']})).records).toEqual([]);
  });

});
