import { describe, expect, test } from 'bun:test';
import { nationalAdapters, nationalPoint, parseNationalCsv } from '../src/common/adapters/national';
import { Glob } from 'bun';

const adapter=(id:string)=>nationalAdapters.find(a=>a.id===id)!;
const ctx={path:'fixture/source.json',snapshotId:'fixture'};
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
describe('national source normalization',()=>{
  test('Irish Grid hospitals independently match publisher WGS84 fields',async()=>{
    const doc=await Bun.file('data/raw/hse-hospitals-2020/2026-10-04/layer-0-records-0001.json').json();
    for(const f of doc.features){const g=nationalPoint(f.geometry,29902);expect(g?.type).toBe('Point');if(g?.type==='Point'){expect(Math.abs(g.coordinates[0]-f.attributes.POINT_X)).toBeLessThan(0.000002);expect(Math.abs(g.coordinates[1]-f.attributes.POINT_Y)).toBeLessThan(0.000002);}}
    expect(()=>nationalPoint({x:600000,y:750000},12345)).toThrow('Unsupported source CRS');
  });
  test('GP native geometry is authoritative and personal contact fields are absent',()=>{
    const doc={spatialReference:{wkid:2157},features:[{attributes:{OBJECTID:7,ServiceName:'Practice',Service:'General Practitioner',GPSurname:'Private surname',GPFirstname:'Private first name',Telephone:'555',Email:'private@example.test',lat:-6.27,lon:53.38},geometry:{x:714661.4777889397,y:738216.5934001307}}]};
    const rows=[...adapter('gp').rows(bytes(doc),ctx) as Iterable<any>];expect(rows).toHaveLength(1);expect(rows[0].record.geometry.coordinates[0]).toBeCloseTo(-6.276514,5);expect(rows[0].record.geometry.coordinates[1]).toBeCloseTo(53.381664,5);
    expect(JSON.stringify(rows)).not.toContain('Private');expect(JSON.stringify(rows)).not.toContain('555');expect(JSON.stringify(rows)).not.toContain('private@example');expect(rows[0].record.observedPeriod).toBe('2020-03');
    doc.features[0].geometry={x:0,y:0};expect([...adapter('gp').rows(bytes(doc),ctx) as Iterable<any>][0].quarantineReason).toBeTruthy();
  });
  test('school levels and valid alternate official names retain historical qualifiers',()=>{
    for(const [id,category,level] of [['schools-primary','primary_school','primary'],['schools-secondary','secondary_school','secondary'],['schools-special','special_school','special']]){
      const doc={spatialReference:{wkid:2157},features:[{attributes:{ROLL_NO:'123A',School_Nam:' ',OFFICIAL_N:'Official school',Contae:'Dublin',Enrolments:999},geometry:{x:714000,y:737000}}]};
      const row=[...adapter(id).rows(bytes(doc),ctx) as Iterable<any>][0];expect(row.record.category).toBe(category);expect(row.record.attributes.schoolLevel).toBe(level);expect(row.record.name).toBe('Official school');expect(row.record.observedPeriod).toBe('2014/15');expect(JSON.stringify(row)).not.toContain('Enrolments');
    }
  });
  test('CSV quoted commas, doubled quotes and newlines are parsed and malformed rows reject',()=>{
    expect(parseNationalCsv('id,name\r\n1,"Airport, \"\"West\"\""\r\n2,"Line\nTwo"\r\n')).toEqual([{id:'1',name:'Airport, "West"'},{id:'2',name:'Line\nTwo'}]);
    expect(()=>parseNationalCsv('id,name\n1,"unfinished')).toThrow('Unterminated');expect(()=>parseNationalCsv('id,name\n1')).toThrow('cardinality');
  });
  test('airport source applies explicit passenger-service selection',()=>{
    const csv='id,name,iso_country,type,scheduled_service,longitude_deg,latitude_deg\n1,Passenger,IE,large_airport,1,-6.2,53.4\n2,Private,IE,small_airport,0,-6.2,53.4\n3,Closed,IE,closed,1,-6.2,53.4\n';
    const rows=[...adapter('airports').rows(new TextEncoder().encode(csv),ctx) as Iterable<any>];expect(rows[0].record.category).toBe('airport');expect(rows[0].record.attributes.access).toBe('unknown');expect(rows[1].excludedReason).toBe('no_reported_scheduled_service');expect(rows[2].excludedReason).toBe('not_open_airport_type');
  });
  test('NaPTAN typed locations, nested raw locator and status selection are faithful',()=>{
    const stop={'@Status':'active',AtcoCode:'ABC',Descriptor:{CommonName:{'#text':'Bus Stop'}},Place:{Location:{Translation:{GridType:'ITM',Longitude:'-6.2',Latitude:'53.4'}}},StopClassification:{StopType:'BCT'}};
    const doc={NaPTAN:{'@FileName':'NaPTAN_2026_10_01.xml',StopPoints:{StopPoint:[stop,{...stop,'@Status':'pending'}]}}};
    const rows=[...adapter('transport-stops').rows(bytes(doc),ctx) as Iterable<any>];expect(rows[0].record.raw.locator).toBe('naptan-stop/0');expect(rows[0].record.geometry.coordinates).toEqual([-6.2,53.4]);expect(rows[0].record.attributes.serviceType).toBe('BCT');expect(rows[1].excludedReason).toBe('status_pending');
    stop.Place.Location.Translation.GridType='BNG';expect([...adapter('transport-stops').rows(bytes(doc),ctx) as Iterable<any>][0].quarantineReason).toBe('Unexpected NaPTAN grid type');
  });
  test('all frozen source rows are accounted for with deterministic IDs and privacy allowlist',async()=>{
    const expected:Record<string,[number,number,number]>={hospitals:[132,0,0],gp:[6587,0,21],'schools-special':[116,0,0],'schools-primary':[3147,0,0],'schools-secondary':[711,0,0],airports:[10,127,0],'transport-stops':[17098,63,0]};
    for(const a of nationalAdapters){let accepted=0,excluded=0,quarantined=0;const ids=new Set();for(const file of [...new Glob('**/*').scanSync(`data/raw/${a.rawFolder}/2026-10-04`)].sort()){if(!a.selectData(file))continue;for await(const row of a.rows(await Bun.file(`data/raw/${a.rawFolder}/2026-10-04/${file}`).bytes(),{...ctx,path:`${a.rawFolder}/2026-10-04/${file}`})){if('record'in row){accepted++;expect(ids.has(row.record.id)).toBe(false);ids.add(row.record.id);expect(Object.keys(row.record.attributes).some(k=>/telephone|email|firstname|surname/i.test(k))).toBe(false);}else if('excludedReason'in row)excluded++;else quarantined++;}}expect([accepted,excluded,quarantined]).toEqual(expected[a.id]);}
  });
});
