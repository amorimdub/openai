import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {commonRecordId, type CommonRecord} from '../schema';
import type {AdapterContext,AdapterRow,ExtendedAdapter} from './types';

const fields=['Date of Sale (dd/mm/yyyy)','Address','County','Eircode','Price (€)','Not Full Market Price','VAT Exclusive','Description of Property','Property Size Description'];
const definition='Original PSRA residential property sale-register row, not an advertised property or published price statistic. Source price retains its reported VAT basis and non-full-market flag; bundled transactions and filing errors may occur. No bedroom classification, dwelling-count inference, geocoding or tax conversion.';

/** Logical CSV rows are yielded individually, keeping the national register out of a row array. */
export function* transactionCsvRows(text:string):Generator<string[]> {
  let row:string[]=[],field='',quoted=false,afterQuote=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
    if(c==='"'){if(field||afterQuote)throw new Error('Unexpected PPR CSV quote');quoted=true;continue;}
    if(c===','){row.push(field);field='';afterQuote=false;continue;}
    if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);yield row;row=[];field='';afterQuote=false;continue;}
    if(afterQuote&&!/\s/.test(c))throw new Error('Unexpected PPR text after quote');
    if(!afterQuote)field+=c;
  }
  if(quoted)throw new Error('Unterminated PPR CSV field');
  if(field||row.length||afterQuote){row.push(field);yield row;}
}
function date(value:string):string {
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());if(!m)throw new Error('Invalid PPR sale date');
  const [day,month,year]=[Number(m[1]),Number(m[2]),Number(m[3])];
  const d=new Date(Date.UTC(year,month-1,day));
  if(year<1900||d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)throw new Error('Impossible PPR sale date');
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function amount(value:string):number {
  const text=value.trim();if(!/^€?\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))throw new Error('Invalid PPR price');
  const n=Number(text.replace(/[€,\s]/g,''));if(!Number.isFinite(n)||n<0)throw new Error('Invalid PPR price range');return n;
}
function flag(value:string):boolean|null {const text=value.trim();if(text==='Yes')return true;if(text==='No')return false;if(!text)return null;throw new Error('Unrecognised PPR boolean flag');}
const ppr:ExtendedAdapter={
  id:'property-transactions',rawFolder:'ppr',sourceId:'psra-ppr',scope:'national-residential-sale-register',publisher:'Property Services Regulatory Authority',geography:'Republic of Ireland; original county labels, unlocated transaction rows',observedPeriod:'2010-01-01/2026-09-25',license:'custom-reuse',licenseEvidenceUrl:'https://www.psr.ie/re-use-of-public-sector-information/',attribution:'Property Services Regulatory Authority, Residential Property Price Register; copyright PSRA. Reproduced under the PSRA public-sector information reuse policy.',
  limitations:[definition,'PSRA custom reuse conditions require source/copyright acknowledgement, accurate reproduction and no misleading or principally promotional use; not relabelled CC BY.','Public register addresses/Eircodes are source transaction information, with no owner names or contacts. They do not establish a uniquely identified property, current occupant or availability.','There is no publisher transaction ID; immutable identity includes raw ZIP SHA256, member and logical source row. Corrections in future files create new identities.','County is an original label; no inferred town or administrative-code crosswalk.'],
  selectData:path=>path==='PPR-ALL.zip',
  *rows(bytes,ctx){
    const zip=unzipSync(bytes);const names=Object.keys(zip);
    if(names.length!==1||names[0]!=='PPR-ALL.csv')throw new Error('Unexpected PPR ZIP member schema');
    const hash=createHash('sha256').update(bytes).digest('hex');
    yield* normalizeTransactionsCsv(new TextDecoder('windows-1252',{fatal:true}).decode(zip[names[0]]),ctx,hash,names[0]);
  },
};
export const transactionAdapters:ExtendedAdapter[]=[ppr];

export function* normalizeTransactionsCsv(text:string,ctx:AdapterContext,zipHash:string,member='PPR-ALL.csv'):Generator<AdapterRow> {
  let index=0;
  for(const row of transactionCsvRows(text.replace(/^\uFEFF/,''))){
    const locator=`zip:${member}/csv:${index}`;
    if(index++===0){if(JSON.stringify(row)!==JSON.stringify(fields))throw new Error('Unexpected PPR CSV headers');yield {excludedReason:'header',locator};continue;}
    if(row.every(v=>!v.trim())){yield {excludedReason:'blank_row',locator};continue;}
    try{
      if(row.length!==fields.length)throw new Error('PPR CSV field cardinality mismatch');
      const saleDate=date(row[0]),address=row[1].trim(),county=row[2].trim(),eircode=row[3].trim();
      if(!address||!county)throw new Error('Missing PPR address or county');
      const externalId=`${zipHash}|${member}|${index-1}`;
      const record:CommonRecord={version:2,id:commonRecordId(ppr.sourceId,ppr.scope,externalId),externalId,sourceId:ppr.sourceId,scope:ppr.scope,snapshotId:ctx.snapshotId,name:`Residential sale record ${index-1}, ${county}, ${saleDate}`,raw:{path:ctx.path,locator},observedPeriod:saleDate,kind:'property_transaction',category:'property_transactions',geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',attributes:{geography:{code:county,codeSystem:'PSRA:county-label',type:'county',name:county,vintage:null},saleDate,amountEur:amount(row[4]),address,...(eircode?{eircode}:{}),county,nonMarketPrice:flag(row[5]),vatExcluded:flag(row[6]),dwellingDescription:row[7],...(row[8]?{sizeDescription:row[8]}:{}),definition}};
      yield {record};
    }catch(error){yield {quarantineReason:error instanceof Error?error.message:String(error),locator};}
  }
  if(index===0)throw new Error('Empty PPR CSV');
}
