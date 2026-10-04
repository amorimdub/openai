import { readFile,writeFile,rename,rm,mkdir } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CommonManifest } from './schema';
export type NormalizationSummary={source:string;sourceId?:string;scope?:string;snapshotId:string;quality:CommonManifest['quality'];files:{records:string;manifest:string;quarantine:string};seconds:number};
export type NormalizationIndex={version:2;generatedAt?:string;results:NormalizationSummary[];[key:string]:unknown};
function sameScope(existing:NormalizationSummary,update:NormalizationSummary):boolean {
  // Original root-created index omitted sourceId/scope: an adapter name uniquely identified its reviewed scope.
  return existing.sourceId && existing.scope && update.sourceId && update.scope
    ? existing.sourceId===update.sourceId && existing.scope===update.scope : existing.source===update.source;
}
export function mergeNormalizationIndex(previous:NormalizationIndex|undefined,updates:NormalizationSummary[],generatedAt:string):NormalizationIndex {
  if(previous && (previous.version!==2 || !Array.isArray(previous.results)))throw new Error('Unsupported normalization index');
  if(!updates.length)throw new Error('No normalization results to publish');
  if(updates.some((u,i)=>updates.slice(0,i).some(other=>sameScope(other,u))))throw new Error('Duplicate source/scope updates');
  const results=(previous?.results??[]).map(existing=>updates.find(update=>sameScope(existing,update))??existing);
  for(const update of updates)if(!results.some(existing=>sameScope(existing,update)))results.push(update);
  return {...previous,version:2,generatedAt,results};
}
export async function publishNormalizationIndex(output:string,updates:NormalizationSummary[]):Promise<string> {
  const directory=resolve(output),path=join(directory,'last-run.json');await mkdir(directory,{recursive:true});
  let previous:NormalizationIndex|undefined;
  try {previous=JSON.parse(await readFile(path,'utf8'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
  const index=mergeNormalizationIndex(previous,updates,new Date().toISOString());
  const temporary=`${path}.${randomUUID()}.tmp`;
  try {await writeFile(temporary,JSON.stringify(index,null,2)+'\n');await rename(temporary,path);}finally{await rm(temporary,{force:true});}
  return path;
}
