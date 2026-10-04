import { expect, test } from 'bun:test';
import { marketAdapters } from '../src/common/adapters/market';
import { commonRecordSchema } from '../src/common/schema';

const context={path:'fixture/2026-10-04/cube.json',snapshotId:'fixture-snapshot'};
function cube(table:string,choices:Record<string,string[]>,values:(number|null)[]) {
  const ordered:Record<string,string[]>={
    RIQ02:['STATISTIC','TLIST(Q1)','C02970V03592','C02969V03591','C03004V03625'],
    HPM02:['STATISTIC','TLIST(M1)','C02339V02812','C03346V04033','C03341V04028','C03344V04031','C03342V04029'],
    HPM07:['STATISTIC','TLIST(M1)','C03346V04033','C03341V04028','C03348V04035','C03344V04031'],
    HPM08:['STATISTIC','TLIST(M1)','C03346V04033','C03349V04063','C03341V04028','C03344V04031'],
  };
  const id=ordered[table];
  return {id,size:id.map(k=>choices[k].length),value:values,dimension:Object.fromEntries(id.map(k=>[k,{category:{index:Object.fromEntries(choices[k].map((c,i)=>[c,i])),label:Object.fromEntries(choices[k].map(c=>[c,`label ${c}`])),...(k==='STATISTIC'?{unit:Object.fromEntries(choices[k].map(c=>[c,{label:c.endsWith('C01')&&table==='HPM02'?'Number':'Euro'}]))}:{})}}]))};
}
function rows(table:string,c:any){return Array.from(marketAdapters.find(a=>a.selectData(`${table}.json`))!.rows(new TextEncoder().encode(JSON.stringify(c)),context) as Iterable<any>);}
function rent(rooms=['02'],types=['04'],locations=['120500'],values:(number|null)[]=[2283.59]) {return cube('RIQ02',{STATISTIC:['RIQ02'],'TLIST(Q1)':['20254'],C02970V03592:rooms,C02969V03591:types,C03004V03625:locations},values);}
test('rent keeps exact geography, quarter, bedrooms, type, unit and raw monetary cell',()=>{
  const record=rows('RIQ02',rent())[0].record;
  expect(commonRecordSchema.safeParse(record).success).toBe(true);
  expect(record.raw.locator).toBe('value/0');
  expect(record.attributes).toMatchObject({geography:{code:'120500',codeSystem:'CSO_RIQ02_C03004V03625'},tenure:'rent',amountEur:2283.59,unit:'EUR/month',period:'2025Q4',bedroomClass:'02',bedrooms:2,propertyType:'apartment',statistic:'mean'});
  expect(record.attributes.dimensions.C02970V03592).toBe('02');
  expect(record.geometry).toBeNull();
});
test('bedroom ranges and four-plus bedrooms do not become exact bedroom matches',()=>{
  const records=rows('RIQ02',rent(['06','07','08'],['05'],['120500'],[1000,1500,2000])).map(r=>r.record);
  expect(records.map(r=>r.attributes.bedrooms)).toEqual([null,null,null]);
  expect(records.map(r=>r.attributes.bedroomClass)).toEqual(['06','07','08']);
  expect(records.every(r=>r.attributes.propertyType==='unknown')).toBe(true);
});
test('missing amounts are counted exclusions while display-zero remains unknown and suppression retains provenance',()=>{
  const c:any=rent(['01'],['04'],['missing','zero','suppressed'],[null,0,null]); c.status={'2':'c'};
  const result=rows('RIQ02',c);
  expect(result[0]).toEqual({excludedReason:'source_missing_no_published_observation',locator:'value/0'});
  expect(result[1].record.attributes).toMatchObject({observationStatus:'source_zero_unverified',amountEur:null,sourceValue:0});
  expect(result[2].record.attributes).toMatchObject({observationStatus:'suppressed',amountEur:null,sourceValue:null,dimensions:{'JSON-stat:status':'c'}});
});
test('source classification or unit drift fails the snapshot; invalid monetary cells quarantine explicitly',()=>{
  const malformed=rent();malformed.size[2]=2;
  expect(()=>rows('RIQ02',malformed)).toThrow('cardinality');
  const unknown=rent(['04']);expect(()=>rows('RIQ02',unknown)).toThrow('Unknown RIQ02');
  const badUnit:any=rent();badUnit.dimension.STATISTIC.category.unit.RIQ02.label='Euro Million';expect(()=>rows('RIQ02',badUnit)).toThrow('not Euro');
  expect(rows('RIQ02',rent(['02'],['04'],['120500'],[-10]))[0]).toMatchObject({quarantineReason:'Invalid nonnegative monetary source value',locator:'value/0'});
});
test('HPM02 links only identical-dimension volume and excludes other buyer/event slices',()=>{
  const c=cube('HPM02',{STATISTIC:['HPM02C01','HPM02C03','HPM02C04'],'TLIST(M1)':['202607'],C02339V02812:['04'],C03346V04033:['-'],C03341V04028:['01','02'],C03344V04031:['01'],C03342V04029:['01']},[8,12,100000,200000,90000,190000]);
  const result=rows('HPM02',c),records=result.filter(r=>r.record).map(r=>r.record);
  expect(records).toHaveLength(2);
  expect(records.map(r=>r.attributes.amountEur)).toEqual([200000,190000]);
  expect(records.map(r=>r.attributes.sampleSize)).toEqual([12,12]);
  expect(result.filter(r=>r.excludedReason==='outside_selected_scope:C03341V04028')).toHaveLength(3);
  expect(records[0].attributes.dimensions.C03344V04031).toBe('01');
  expect(records[0].attributes.propertyType).toBe('all');
});
test('rolling 12-month observations retain window-ending month and original Eircode geography',()=>{
  const c=cube('HPM08',{STATISTIC:['HPM08C01','HPM08C02'],'TLIST(M1)':['202607'],C03346V04033:['-'],C03349V04063:['A41'],C03341V04028:['02'],C03344V04031:['-']},[400000,390000]);
  const result=rows('HPM08',c).map(r=>r.record);
  expect(result.map(r=>r.attributes.statistic)).toEqual(['mean','median']);
  expect(result[0].attributes.geography).toMatchObject({code:'A41',codeSystem:'CSO_HPM08_C03349V04063',type:'eircode_output_region'});
  expect(result[0].attributes.definition).toContain('moving 12-month');
  expect(result[0].attributes.period).toBe('2026-07');
  expect(result[0].attributes.sampleSize).toBeNull();
});
