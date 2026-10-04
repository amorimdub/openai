import {expect,test} from 'bun:test';
import {zipSync} from 'fflate';
import {normalizeTransactionsCsv,transactionAdapters,transactionCsvRows} from '../src/common/adapters/transactions';
import {commonRecordSchema} from '../src/common/schema';

const header='Date of Sale (dd/mm/yyyy),Address,County,Eircode,Price (€),Not Full Market Price,VAT Exclusive,Description of Property,Property Size Description';
const ctx={path:'ppr/2026-10-04/PPR-ALL.zip',snapshotId:'fixture-snapshot'};
const sourceHash='a'.repeat(64);
function rows(lines:string[]){return Array.from(normalizeTransactionsCsv([header,...lines].join('\r\n'),ctx,sourceHash));}
const line='25/09/2026,"Example address, unit 1",Dublin,,"€123,456.78",Yes,Yes,New Dwelling house /Apartment,';
test('PPR transaction retains reported amount, tax and market flags without aggregate or geocode inference',()=>{
  const result=rows([line]);expect(result[0]).toEqual({excludedReason:'header',locator:'zip:PPR-ALL.csv/csv:0'});
  const r=(result[1] as any).record;expect(commonRecordSchema.safeParse(r).success).toBe(true);
  expect(r.kind).toBe('property_transaction');expect(r.geometry).toBeNull();
  expect(r.raw.locator).toBe('zip:PPR-ALL.csv/csv:1');
  expect(r.attributes).toMatchObject({saleDate:'2026-09-25',amountEur:123456.78,nonMarketPrice:true,vatExcluded:true,geography:{code:'Dublin',codeSystem:'PSRA:county-label'},address:'Example address, unit 1'});
  expect(r.attributes).not.toHaveProperty('bedrooms');expect(r.attributes).not.toHaveProperty('eircode');
});
test('duplicate-looking source rows keep distinct immutable ZIP and row identities',()=>{
  const result=rows([line,line]).filter((r:any)=>r.record).map((r:any)=>r.record);
  expect(new Set(result.map(r=>r.id)).size).toBe(2);
  const changed=Array.from(normalizeTransactionsCsv([header,line].join('\n'),ctx,'b'.repeat(64)))[1] as any;
  expect(result[0].id).not.toBe(changed.record.id);
});
test('logical CSV rows retain quoted commas, escaped quotes and embedded newlines',()=>{
  expect(Array.from(transactionCsvRows('a,b\r\n"one\nline","say ""yes"""\r\n'))).toEqual([['a','b'],['one\nline','say "yes"']]);
  expect(()=>Array.from(transactionCsvRows('"unfinished'))).toThrow('Unterminated');
});
test('malformed dates, monetary values and flags quarantine with source locator',()=>{
  const malformed=[line.replace('25/09/2026','31/02/2026'),line.replace('€123,456.78','€12,34.00'),line.replace(',Yes,Yes,',',Maybe,Yes,')];
  const result=rows(malformed).slice(1);
  expect(result.every(r=>'quarantineReason' in r)).toBe(true);
  expect(result.map((r:any)=>r.locator)).toEqual(['zip:PPR-ALL.csv/csv:1','zip:PPR-ALL.csv/csv:2','zip:PPR-ALL.csv/csv:3']);
  expect(()=>Array.from(normalizeTransactionsCsv('wrong,header',ctx,sourceHash))).toThrow('headers');
});
test('saved ZIP is decoded as Windows-1252 and policy remains publisher-specific reuse',()=>{
  const csv=[header,line.replace('Example address','Example É address')].join('\r\n');
  const bytes=Uint8Array.from(Array.from(csv).map(c=>c==='€'?0x80:c.charCodeAt(0)));
  const adapter=transactionAdapters[0];const result=Array.from(adapter.rows(zipSync({'PPR-ALL.csv':bytes}),ctx) as Iterable<any>);
  expect(result[1].record.attributes.address).toBe('Example É address, unit 1');
  expect(adapter.license).toBe('custom-reuse');
  expect(adapter.licenseEvidenceUrl).toBe('https://www.psr.ie/re-use-of-public-sector-information/');
});
