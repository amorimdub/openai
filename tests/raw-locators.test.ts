import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as XLSX from 'xlsx';
import {zipSync,strToU8} from 'fflate';
import {rawLocatorShapes,locatorExists} from '../src/common/raw-locators';
import {csvRecords} from '../src/common/adapters/csv';

test('CSV logical record provenance preserves quoted newlines and rejects malformed quoting',()=>{
  expect(csvRecords('a,b\r\n"two\nlines","quote ""inside"""\r\n')).toEqual([['a','b'],['two\nlines','quote "inside"']]);
  expect(()=>csvRecords('a\n"unfinished')).toThrow('Unterminated');
});
test('NaPTAN, CSV, XLSX and ZIP provenance must name an existing original row',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ireland-locators-'));
  try {
    await Bun.write(join(root,'stops.json'),JSON.stringify({NaPTAN:{StopPoints:{StopPoint:[{AtcoCode:'A'}]}}}));
    await Bun.write(join(root,'airports.csv'),'name,country\n"Airport, A",IE\n');
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Supply'],['One']]),'WSZ 2026');await Bun.write(join(root,'water.xlsx'),XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
    await Bun.write(join(root,'register.zip'),zipSync({'PPR-ALL.csv':strToU8('header\n"quoted\naddress"\n')}));
    const assets=['stops.json','airports.csv','water.xlsx','register.zip'].map(path=>({path,bytes:0,sha256:'0'.repeat(64)}));
    const shapes=await rawLocatorShapes(root,assets);
    const exists=(path:string,locator:string)=>locatorExists({raw:{path,locator}},shapes);
    expect(exists('stops.json','naptan-stop/0')).toBe(true);expect(exists('stops.json','naptan-stop/1')).toBe(false);
    expect(exists('airports.csv','rows/0')).toBe(true);expect(exists('airports.csv','rows/1')).toBe(false);
    expect(exists('water.xlsx','XLSXsheet:WSZ 2026/row:2')).toBe(true);expect(exists('water.xlsx','XLSXsheet:Other/row:2')).toBe(false);
    expect(exists('register.zip','zip:PPR-ALL.csv/csv:1')).toBe(true);expect(exists('register.zip','zip:PPR-ALL.csv/csv:2')).toBe(false);
  } finally {await rm(root,{recursive:true});}
});
