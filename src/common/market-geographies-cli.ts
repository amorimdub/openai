import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {rename} from 'node:fs/promises';
import type {CommonRecord} from './schema';
export async function generateMarketGeographies(indexPath='data/canonical/last-run.json',target='config/market-geographies.json') {
 const index=await Bun.file(indexPath).json();const choices=new Map<string,any>();
 for(const entry of index.results){const manifest=await Bun.file(entry.files.records+'.manifest.json').json();if(!['cso-hpm02','cso-hpm05','cso-hpm07','cso-hpm08','rtb-riq02'].includes(manifest.sourceId))continue;
  for await(const line of createInterface({input:createReadStream(entry.files.records),crlfDelay:Infinity})){if(!line.trim())continue;const record=JSON.parse(line) as CommonRecord;if(record.kind!=='market_context')continue;const a=record.attributes,g=a.geography,key=record.snapshotId+'|'+g.codeSystem+'|'+g.code;
   let choice=choices.get(key);if(!choice){choice={...g,sourceId:record.sourceId,snapshotId:record.snapshotId,tenure:a.tenure,latestPeriod:a.period,propertyTypes:[],bedroomClasses:[]};choices.set(key,choice);}
   if(a.period>choice.latestPeriod)choice.latestPeriod=a.period;
   if(!choice.propertyTypes.some((p:any)=>p.value===a.propertyType))choice.propertyTypes.push({value:a.propertyType,label:a.propertyTypeLabel});
   if(a.bedroomClass!==null&&!choice.bedroomClasses.some((b:any)=>b.code===a.bedroomClass))choice.bedroomClasses.push({code:a.bedroomClass,bedrooms:a.bedrooms,label:a.dimensions['C02970V03592:label']??a.bedroomClass});
  }
 }
 const geographies=[...choices.values()].map(g=>({...g,codeSystem:g.codeSystem})).sort((a,b)=>a.tenure.localeCompare(b.tenure)||a.name.localeCompare(b.name)||a.codeSystem.localeCompare(b.codeSystem));
 await Bun.write(target+'.tmp',JSON.stringify({version:2,generatedAt:new Date().toISOString(),geographies},null,2)+'\n');await rename(target+'.tmp',target);return geographies.length;
}
if(import.meta.main)console.log(JSON.stringify({geographies:await generateMarketGeographies()}));
