import { normalizeSource, SOURCE_NAMES, type SourceName } from './normalize';
import { loadExtendedAdapters, normalizeExtended } from './normalize-extended';
import { publishNormalizationIndex, type NormalizationSummary } from './normalize-index';

const extended=await loadExtendedAdapters(),names:string[]=[...SOURCE_NAMES,...extended.map(a=>a.id)];
const args=process.argv.slice(2), options:{date?:string;rawRoot?:string;output?:string;sources?:string[]}={};
for(let i=0;i<args.length;i++) {
  const key=args[i];const value=args[++i];if(!value)throw new Error(`Missing value for ${key}`);
  if(key==='--date')options.date=value;
  else if(key==='--raw-root')options.rawRoot=value;
  else if(key==='--output')options.output=value;
  else if(key==='--sources') {
    const sources=value.split(',');if(!sources.length || sources.some(s=>!names.includes(s)))throw new Error(`Sources must be among: ${names.join(',')}`);
    if(new Set(sources).size!==sources.length)throw new Error('Duplicate source argument');options.sources=sources;
  } else throw new Error(`Unknown argument ${key}`);
}
const results:NormalizationSummary[]=[];
for(const source of options.sources??names) {
  const start=performance.now(),result=SOURCE_NAMES.includes(source as SourceName)?await normalizeSource(source as SourceName,options as any):await normalizeExtended(extended.find(a=>a.id===source)!,options);
  const summary={source,sourceId:result.manifest.sourceId,scope:result.manifest.scope,snapshotId:result.manifest.snapshotId,quality:result.manifest.quality,files:result.files,seconds:Math.round((performance.now()-start)/100)/10};
  results.push(summary);console.log(JSON.stringify(summary));
}

// Publication follows complete success of the selected adapters; a failed batch preserves its previous index.
await publishNormalizationIndex(options.output??'data/canonical',results);
