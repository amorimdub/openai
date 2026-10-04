import { unzipSync } from 'fflate';
import { transactionCsvRows } from './adapters/transactions';
import { readOsmExtract } from './adapters/osm';
import { Database } from 'bun:sqlite';
import * as XLSX from 'xlsx';
import { parseCsv, csvRecords } from './adapters/csv';
import type { CommonManifest, CommonRecord } from './schema';
import { resolve } from 'node:path';

type Shape={features?:number;values?:Set<string>;cells?:number;stops?:number;rows?:number;csv?:number;sheets?:Map<string,Set<number>>;gpkg?:Map<string,Set<string>>;zip?:Map<string,number>;osm?:Set<string>};
export async function rawLocatorShapes(root:string,assets:CommonManifest['rawAssets']):Promise<Map<string,Shape>> {
  const shapes=new Map<string,Shape>();
  for(const asset of assets){const file=resolve(root,asset.path),shape:Shape={};
    if(/\.(json|geojson)$/i.test(file)) {
      const doc=await Bun.file(file).json();
      if(Array.isArray(doc.features))shape.features=doc.features.length;
      if(Array.isArray(doc.value))shape.cells=doc.value.length;
      else if(doc.value&&typeof doc.value==='object')shape.values=new Set(Object.keys(doc.value));
      if(Array.isArray(doc.size)&&doc.size.every((n:unknown)=>Number.isInteger(n)&&Number(n)>=0))shape.cells=doc.size.reduce((p:number,n:number)=>p*n,1);
      if(Array.isArray(doc.NaPTAN?.StopPoints?.StopPoint))shape.stops=doc.NaPTAN.StopPoints.StopPoint.length;
    }else if(/\.csv$/i.test(file)){
      const bytes=await Bun.file(file).bytes();shape.csv=csvRecords(bytes).length;
      try {shape.rows=parseCsv(bytes).rows.length;}catch{/* Ragged report records use csv/N with headers retained. */}
    }else if(/\.xlsx$/i.test(file)){
      const wb=XLSX.read(await Bun.file(file).bytes(),{type:'array'});shape.sheets=new Map();
      for(const name of wb.SheetNames){const indices=new Set<number>();for(const key of Object.keys(wb.Sheets[name]!)){if(key.startsWith('!'))continue;indices.add(XLSX.utils.decode_cell(key).r+1);}shape.sheets.set(name,indices);}
    }else if(/\.zip$/i.test(file)){
      const archive=unzipSync(await Bun.file(file).bytes());shape.zip=new Map();
      for(const [name,bytes] of Object.entries(archive)){if(!name.endsWith('.csv'))continue;let count=0;for(const row of transactionCsvRows(new TextDecoder('windows-1252',{fatal:true}).decode(bytes)))count++;shape.zip.set(name,count);}
    }else if(/\.pbf$/i.test(file)){
      shape.osm=new Set();for await(const row of readOsmExtract(file,true)){if(typeof row.locator!=='string')throw new Error('Invalid independent OSM locator');shape.osm.add(row.locator);}
    }else if(/\.gpkg$/i.test(file)){
      const db=new Database(file,{readonly:true});shape.gpkg=new Map();
      try {const tables=db.query('SELECT table_name FROM gpkg_contents').all() as {table_name:string}[];
        for(const {table_name:table} of tables){const quoted='"'+table.replaceAll('"','""')+'"';const cols=db.query(`PRAGMA table_info(${quoted})`).all() as {name:string;pk:number}[];const key=cols.find(c=>c.pk===1)?.name;if(!key)continue;const column='"'+key.replaceAll('"','""')+'"';const ids=db.query(`SELECT ${column} AS id FROM ${quoted}`).all() as {id:string|number}[];shape.gpkg.set(`${table}/${key}`,new Set(ids.map(r=>String(r.id))));}
      }finally{db.close();}
    }
    shapes.set(asset.path,shape);
  }
  return shapes;
}
export function locatorExists(record:Pick<CommonRecord,'raw'>,shapes:Map<string,Shape>):boolean {
  const shape=shapes.get(record.raw.path);if(!shape)return false;
  const simple=/^(features|value|rows|csv|naptan-stop)\/(0|[1-9][0-9]*)$/.exec(record.raw.locator);
  if(simple){const [,kind,index]=simple,n=Number(index);if(kind==='value')return Boolean(shape.values?.has(index!)||(shape.cells!==undefined&&n<shape.cells));const total=kind==='features'?shape.features:kind==='rows'?shape.rows:kind==='csv'?shape.csv:shape.stops;return total!==undefined&&n<total;}
  const sheet=/^XLSXsheet:(.+)\/row:([1-9][0-9]*)$/.exec(record.raw.locator);
  if(sheet)return shape.sheets?.get(sheet[1]!)?.has(Number(sheet[2]))??false;
  const zip=/^zip:(.+)\/csv:(0|[1-9][0-9]*)$/.exec(record.raw.locator);
  if(zip){const count=shape.zip?.get(zip[1]!);return count!==undefined&&Number(zip[2])<count;}
  if(/^osm\/(node|way|relation)\/[1-9][0-9]*@[1-9][0-9]*$/.test(record.raw.locator))return shape.osm?.has(record.raw.locator)??false;
  const gpkg=/^gpkg:(.+)\/([^/:]+):([^/]+)$/.exec(record.raw.locator);
  if(gpkg)return shape.gpkg?.get(`${gpkg[1]}/${gpkg[2]}`)?.has(gpkg[3]!)??false;
  return false;
}
