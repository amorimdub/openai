import sources from '../config/sources.json';
import { randomUUID } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { geometrySchema, recordSchema, manifestSchema, type DataRecord } from './schema';
import { sha256 } from './store';

export type SourceKey = keyof typeof sources;
type Fetcher = typeof fetch;
async function json(url: URL, fetcher: Fetcher) {
  const response=await fetcher(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const value=await response.json();
  if(value.error) throw new Error(`Source API error: ${value.error.message??'unknown'}`);
  return value;
}
function query(layer: string, parameters: Record<string,string>) {
  const url=new URL(`${layer}/query`);
  url.search=new URLSearchParams(parameters).toString();
  return url;
}
// Allowlist is deliberately narrower than the canonical schema's supported licences.
export async function exportSource(key: SourceKey, path: string, fetcher: Fetcher=fetch) {
  const source=sources[key];
  if(!source) throw new Error('Source is not in the reviewed exporter allowlist');
  const metadata=await json(new URL(`${source.sourceUrl}?f=json`),fetcher);
  const field=metadata.objectIdField ?? metadata.fields?.find((f:{type:string})=>f.type==='esriFieldTypeOID')?.name;
  if(!field) throw new Error('Source has no stable object ID field');
  const idsResult=await json(query(source.sourceUrl,{where:'1=1',returnIdsOnly:'true',f:'json'}),fetcher);
  const countResult=await json(query(source.sourceUrl,{where:'1=1',returnCountOnly:'true',f:'json'}),fetcher);
  if(!Array.isArray(idsResult.objectIds) || new Set(idsResult.objectIds).size!==countResult.count || idsResult.objectIds.length!==countResult.count) throw new Error('Source ID enumeration differs from source count');
  const ids=idsResult.objectIds as number[];
  if(!ids.every(id=>Number.isSafeInteger(id))) throw new Error('Invalid source object ID');
  ids.sort((a,b)=>a-b);
  const records: DataRecord[]=[], raw:unknown[]=[];
  const seen=new Set<string>();
  for(let offset=0;offset<ids.length;offset+=200) {
    const batch=ids.slice(offset,offset+200);
    const result=await json(query(source.sourceUrl,{objectIds:batch.join(','),outFields:[field,...source.fields].join(','),outSR:'4326',f:'geojson'}),fetcher);
    if(result.exceededTransferLimit || result.properties?.exceededTransferLimit || !Array.isArray(result.features) || result.features.length!==batch.length) throw new Error('Source response truncated or missing a geometry record');
    for(const feature of result.features) {
      const properties=feature.properties;
      const externalId=String(properties?.[field]);
      if(!batch.includes(Number(externalId)) || seen.has(externalId)) throw new Error('Unexpected or duplicate source object ID');
      seen.add(externalId);
      // Ignore any unsolicited fields; raw snapshot also excludes email/telephone fields.
      const publicProperties=Object.fromEntries([field,...source.fields].map(name=>[name,properties[name]]));
      raw.push({type:'Feature',geometry:feature.geometry,properties:publicProperties});
      const geometry=feature.geometry===null ? null : geometrySchema.parse(feature.geometry);
      const name=properties[source.nameField];
      if(typeof name!=='string'||!name.trim()) throw new Error('Source record is missing its public name');
      const base={version:1,id:`${source.sourceId}:${externalId}`,externalId,sourceId:source.sourceId,scope:source.scope,name:name.trim(),geometry};
      let record:unknown;
      if(key==='towns') record={...base,kind:'place',attributes:{county:properties.COUNTY??undefined,code:properties.URBAN_AREA_CODE==null?undefined:String(properties.URBAN_AREA_CODE),geographicType:'urban_statistical_area_2022'}};
      else record={...base,kind:'service',category:'childcare',locationStatus:geometry===null?'unlocated':'located',attributes:{eircode:properties.eircode??undefined,serviceType:properties.organisation_type??undefined,programmes:['ecce','ccsp','ncs'].filter(k=>/^(yes|y|true|1)$/i.test(String(properties[k]))),access:'unknown'}};
      records.push(recordSchema.parse(record));
    }
  }
  if(seen.size!==countResult.count) throw new Error('Final source count mismatch');
  const text=records.map(r=>JSON.stringify(r)).join('\n')+(records.length?'\n':'');
  const fetchedAt=new Date().toISOString();
  const modified=metadata.editingInfo?.lastEditDate;
  const manifest=manifestSchema.parse({version:1,snapshotId:randomUUID(),sourceId:source.sourceId,scope:source.scope,publisher:source.publisher,sourceUrl:source.sourceUrl,license:source.license,licenseEvidenceUrl:source.licenseEvidenceUrl,attribution:source.attribution,fetchedAt,sourceModifiedAt:modified?new Date(modified).toISOString():null,observedPeriod:source.observedPeriod,geography:source.geography,coverage:'partial',limitations:source.limitations,dataQuality:{recordsWithGeometry:records.filter(r=>r.geometry!==null).length,recordsWithoutGeometry:records.filter(r=>r.geometry===null).length},recordCount:records.length,sha256:sha256(text),format:'ndjson'});
  await mkdir(dirname(path),{recursive:true});
  const suffix=`.${randomUUID()}.tmp`;
  await Bun.write(`${path}${suffix}`,text);
  await Bun.write(`${path}.source.json${suffix}`,JSON.stringify({type:'FeatureCollection',features:raw}));
  await Bun.write(`${path}.manifest.json${suffix}`,JSON.stringify(manifest,null,2)+'\n');
  await rename(`${path}${suffix}`,path);
  await rename(`${path}.source.json${suffix}`,`${path}.source.json`);
  // Manifest is published last; the importer always verifies its content hash.
  await rename(`${path}.manifest.json${suffix}`,`${path}.manifest.json`);
  return manifest;
}
