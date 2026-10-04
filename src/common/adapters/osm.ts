import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commonRecordId, commonRecordSchema, type CommonRecord } from '../schema';
import type { AdapterRow, ExtendedAdapter, AdapterContext } from './types';

export const osmPython = () => process.env.OSM_PYTHON ?? '/private/tmp/ireland-osm-venv/bin/python';
const extractor = new URL('../../../scripts/extract-osm.py',import.meta.url).pathname;
export async function* readOsmExtract(path:string,idsOnly=false): AsyncIterable<any> {
  const child=Bun.spawn([osmPython(),extractor,path,...(idsOnly?['--ids']:[])],{stdout:'pipe',stderr:'pipe'});
  const stderr=new Response(child.stderr).text();
  let pending='';const decoder=new TextDecoder();
  try {
    for await(const chunk of child.stdout){pending+=decoder.decode(chunk,{stream:true});let newline;while((newline=pending.indexOf('\n'))!==-1){const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(line)yield JSON.parse(line);}}
    pending+=decoder.decode();if(pending.trim())yield JSON.parse(pending);
    const code=await child.exited;const diagnostic=await stderr;if(code!==0)throw new Error(`OSM extraction failed (${code}): ${diagnostic.slice(-2000)}`);
  }finally {if(child.exitCode===null)child.kill();}
}

export function normalizeOsmRow(row:any,ctx:AdapterContext): AdapterRow {
  const locator=row.locator;
  if(row.error)return{quarantineReason:String(row.error),locator};
  try {
    if(!['node','way','relation'].includes(row.primitive)||!/^\d+$/.test(row.id)||!Number.isInteger(row.version)||row.version<1)throw new Error('Invalid OSM primitive identity');
    if(locator!==`osm/${row.primitive}/${row.id}@${row.version}`)throw new Error('OSM primitive locator mismatch');
    if(!['shops','parks','community_centres','green_areas','road_network','cycle_network'].includes(row.category))throw new Error('Unknown selected OSM category');
    const tags=row.tags??{},externalId=`${row.primitive}/${row.id}`;
    const base={version:2 as const,id:commonRecordId('osm-geofabrik','bounded-public-pois-and-strategic-networks',externalId),externalId,sourceId:'osm-geofabrik',scope:'bounded-public-pois-and-strategic-networks',snapshotId:ctx.snapshotId,
      name:typeof tags.name==='string'&&tags.name.trim()?tags.name:`OSM ${row.category.replaceAll('_',' ')} ${externalId}`,
      raw:{path:ctx.path,locator},observedPeriod:'2026-10-03T20:20:50Z',sourceModifiedAt:new Date(row.timestamp).toISOString(),sourceVersion:row.version,geometry:row.geometry,locationStatus:'located' as const};
    let record: CommonRecord;
    if(['road_network','cycle_network'].includes(row.category)){
      if(row.geometry?.type!=='LineString'&&row.geometry?.type!=='MultiLineString')throw new Error('Selected OSM network must retain line geometry');
      record=commonRecordSchema.parse({...base,kind:'infrastructure',category:row.category,geometryMeaning:'infrastructure_asset',attributes:{assetType:tags.highway??'unknown',status:'unknown',definition:row.category==='road_network'?'OSM strategic road geometry; excludes local roads. No connectivity, direction, speed or journey-time graph is established.':'Explicit OSM cycleway or path/track with bicycle=designated; no safe/connected routing graph is established.',...(tags['addr:street']?{street:tags['addr:street']}:{}),sourceCode:`highway=${tags.highway??''};bicycle=${tags.bicycle??''}`}});
    }else{
      const access=tags.access==='private'||tags.access==='no'?'private':tags.access==='yes'||tags.access==='public'?'public':'unknown';
      const address=[tags['addr:housenumber'],tags['addr:street'],tags['addr:city']].filter(Boolean).join(', ');
      const serviceType=['shop','amenity','leisure','landuse'].filter(k=>tags[k]).map(k=>`${k}=${tags[k]}`).join(';');
      record=commonRecordSchema.parse({...base,kind:'service',category:row.category,geometryMeaning:'recorded_location',attributes:{access,serviceType,...(address?{address}:{}),...(tags['addr:postcode']?{eircode:tags['addr:postcode']}: {})}});
    }
    return{record};
  }catch(error){return{quarantineReason:error instanceof Error?error.message:'Invalid OSM geometry or classification',locator};}
}
export const osmAdapters: ExtendedAdapter[] = [{
  id:'osm-public-services-and-strategic-networks',rawFolder:'osm-geofabrik',sourceId:'osm-geofabrik',scope:'bounded-public-pois-and-strategic-networks',publisher:'OpenStreetMap contributors / Geofabrik',geography:'Ireland and Northern Ireland original extract; jurisdiction unfiltered',observedPeriod:'2026-10-03T20:20:50Z',license:'ODbL-1.0',licenseEvidenceUrl:'https://www.openstreetmap.org/copyright',attribution:'© OpenStreetMap contributors; ODbL 1.0, extract by Geofabrik',
  limitations:['Community map completeness varies; source edits are not current opening-hours, legal access or availability verification.','Original nodes, way lines and assembled multipolygon boundaries retained; polygons are not entrances or centroids.','Overlaps with official source layers are retained with distinct source identities; no cross-source deduplication or score aggregation.','Road scope selects motorway/trunk/primary/secondary and links; excludes local roads. Cycle scope selects highway=cycleway or path/track with bicycle=designated. These are display geometries, not a journey-time routing graph.','Green areas select gardens/nature reserves and forest/recreation_ground/village_green; no universal public-access claim.','Northern Ireland records remain in original source jurisdiction. ODbL attribution and derived-database obligations apply.'],selectData:p=>p.endsWith('.osm.pbf'),
  async *rows(bytes,ctx){const folder=await mkdtemp(join(tmpdir(),'ireland-osm-raw-'));const path=join(folder,'source.osm.pbf');try{await Bun.write(path,bytes);for await(const row of readOsmExtract(path))yield normalizeOsmRow(row,ctx);}finally{await rm(folder,{recursive:true,force:true});}},
}];
