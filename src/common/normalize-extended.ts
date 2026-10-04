import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve, join } from 'node:path';
import { rawEntries, verifyRawAsset } from './normalize';
import { commonManifestSchema, commonRecordSchema, type CommonManifest, type CommonRecord } from './schema';
import { geometryQuarantineConfigSchema, matchingGeometryQuarantine, ruleHash } from './normalize-quarantine';
import type { ExtendedAdapter } from './adapters/types';
import { nationalAdapters } from './adapters/national';
import { marketAdapters } from './adapters/market';

export async function loadExtendedAdapters(): Promise<ExtendedAdapter[]> {
  const path=new URL('./adapters/local.ts',import.meta.url).href;
  const local=await Bun.file(new URL(path)).exists() ? (await import(path)).localAdapters : [];
  const extra:ExtendedAdapter[]=[];
  for(const [module,name] of [['transactions','transactionAdapters'],['osm','osmAdapters']]){const path=new URL(`./adapters/${module}.ts`,import.meta.url).href;if(await Bun.file(new URL(path)).exists())extra.push(...(await import(path))[name]);}
  const adapters=[...nationalAdapters,...marketAdapters,...local,...extra];
  if(new Set(adapters.map(a=>a.id)).size!==adapters.length)throw new Error('Duplicate adapter ID');
  return adapters;
}
const digest=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
export async function normalizeExtended(adapter:ExtendedAdapter,options:{rawRoot?:string;output?:string;date?:string}={}) {
  const date=options.date??'2026-10-04';if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid snapshot date');
  const root=resolve(options.rawRoot??'data/raw'),folder=join(root,adapter.rawFolder,date);
  const manifestBytes=await readFile(join(folder,'manifest.json'));
  const original=JSON.parse(manifestBytes.toString()),entries=rawEntries(original);
  const selected=entries.filter(e=>adapter.selectData(e.path)).sort((a,b)=>a.path.localeCompare(b.path));
  if(!selected.length)throw new Error(`No raw data assets selected: ${adapter.id}`);
  // Hash publisher evidence as well as selected payloads, avoiding unrelated large data tables.
  const consumed=entries.filter(e=>adapter.selectData(e.path)||e.url===adapter.licenseEvidenceUrl||/license|licence|catalogue|metadata|^item\.json$/.test(e.path)).sort((a,b)=>a.path.localeCompare(b.path));
  for(const entry of consumed)await verifyRawAsset(folder,entry);
  const rawAssets=[{path:`${adapter.rawFolder}/${date}/manifest.json`,bytes:manifestBytes.length,sha256:digest(manifestBytes)},...consumed.map(e=>({path:`${adapter.rawFolder}/${date}/${e.path}`,bytes:e.bytes,sha256:e.sha256}))].sort((a,b)=>a.path.localeCompare(b.path));
  const config=geometryQuarantineConfigSchema.parse(await Bun.file(new URL('../../config/common-geometry-quarantine.json',import.meta.url)).json());
  const rules=config.rules.filter(r=>r.match.sourceId===adapter.sourceId&&r.match.scope===adapter.scope&&rawAssets.some(a=>a.path===r.match.rawPath&&a.sha256===r.match.rawSha256));
  const version='2.1.0',snapshotId=digest(JSON.stringify({sourceId:adapter.sourceId,scope:adapter.scope,adapter:adapter.id,version,rawAssets,rules}));
  const dir=join(resolve(options.output??'data/canonical'),adapter.id,snapshotId);await mkdir(dir,{recursive:true});
  const files={records:join(dir,'records.ndjson'),manifest:join(dir,'records.ndjson.manifest.json'),quarantine:join(dir,'quarantine.ndjson')};
  const out=createWriteStream(files.records+'.tmp'),bad=createWriteStream(files.quarantine+'.tmp'),hash=createHash('sha256');
  const seen=new Set<string>(),quality:CommonManifest['quality']={inputRecords:0,acceptedRecords:0,quarantinedRecords:0,unlocatedRecords:0,excludedRecords:0,exclusions:{}};
  const write=async(stream:typeof out,value:unknown)=>{const text=JSON.stringify(value)+'\n';if(!stream.write(text))await once(stream,'drain');return text;};
  try {
    for(const entry of selected) {
      const bytes=await readFile(join(folder,entry.path));if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error('Raw asset changed during normalization');
      const path=`${adapter.rawFolder}/${date}/${entry.path}`;
      for await(const row of adapter.rows(bytes,{path,snapshotId})) {
        quality.inputRecords++;
        if('excludedReason' in row){quality.excludedRecords++;quality.exclusions[row.excludedReason]=(quality.exclusions[row.excludedReason]??0)+1;continue;}
        if('quarantineReason' in row){quality.quarantinedRecords++;await write(bad,{sourceId:adapter.sourceId,scope:adapter.scope,raw:{path,locator:row.locator},reason:row.quarantineReason});continue;}
        const record:CommonRecord=commonRecordSchema.parse(row.record);
        if(record.sourceId!==adapter.sourceId||record.scope!==adapter.scope||record.snapshotId!==snapshotId||record.raw.path!==path)throw new Error('Adapter record identity or provenance mismatch');
        if(seen.has(record.id))throw new Error(`Duplicate canonical identity: ${record.id}`);seen.add(record.id);
        const rule=matchingGeometryQuarantine(record,entry.sha256,rules);
        if(rule){quality.quarantinedRecords++;await write(bad,{sourceId:adapter.sourceId,scope:adapter.scope,raw:record.raw,externalId:record.externalId,reason:rule.reason,rule:{id:rule.id,sha256:ruleHash(rule),match:rule.match,validator:rule.validator}});continue;}
        hash.update(await write(out,record));quality.acceptedRecords++;if(!record.geometry)quality.unlocatedRecords++;
      }
    }
    if(adapter.expectedCount!==undefined&&quality.inputRecords!==adapter.expectedCount)throw new Error(`Expected ${adapter.expectedCount} inputs, observed ${quality.inputRecords}`);
    out.end();bad.end();await Promise.all([once(out,'finish'),once(bad,'finish')]);
    const manifest=commonManifestSchema.parse({version:2,snapshotId,sourceId:adapter.sourceId,scope:adapter.scope,publisher:adapter.publisher,sourceUrl:selected[0]!.url,license:adapter.license,licenseEvidenceUrl:adapter.licenseEvidenceUrl,attribution:adapter.attribution,reuseStatus:'approved',fetchedAt:selected.map(e=>e.fetchedAt).sort().at(-1),observedPeriod:adapter.observedPeriod,geography:adapter.geography,coverage:'partial',limitations:[...adapter.limitations,...(quality.quarantinedRecords?[`${quality.quarantinedRecords} inputs explicitly quarantined; coverage remains partial.`]:[]),...rules.map(r=>`Frozen topology rule ${r.id}: ${r.reason}; ${ruleHash(r)}; no geometry repair.`)],adapter:{id:adapter.id,version},rawAssets,recordCount:quality.acceptedRecords,sha256:hash.digest('hex'),format:'ndjson',quality});
    await rename(files.records+'.tmp',files.records);await rename(files.quarantine+'.tmp',files.quarantine);
    await Bun.write(files.manifest+'.tmp',JSON.stringify(manifest,null,2)+'\n');await rename(files.manifest+'.tmp',files.manifest);
    return {source:adapter.id,manifest,files};
  } catch(error){out.destroy();bad.destroy();await Promise.all([rm(files.records+'.tmp',{force:true}),rm(files.quarantine+'.tmp',{force:true})]);throw error;}
}
