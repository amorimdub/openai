import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { commonRecordId, commonRecordSchema, commonManifestSchema, type CommonRecord, type CommonManifest } from './schema';
import { arcGisGeometry } from './geometry';
import { geometrySchema } from '../schema';
import { geometryQuarantineConfigSchema, matchingGeometryQuarantine, ruleHash } from './normalize-quarantine';

export const PARSER_VERSION='2.0.0';
export const SOURCE_NAMES=['towns','childcare','clubs','parks','broadband-counties','broadband-small-areas','purchase'] as const;
export type SourceName=typeof SOURCE_NAMES[number];
type Asset={path:string;bytes:number;sha256:string};
type RawEntry={path:string;bytes:number;sha256:string;url:string;fetchedAt:string};
type Plan={rawFolder:string;sourceId:string;scope:string;publisher:string;geography:string;period:string|null;limitations:string[];expectedCount?:number;dataFiles:(p:string)=>boolean;licenseUrl?:string};
const planBySource:Record<SourceName,Plan>={
  towns:{rawFolder:'cso-urban-areas-2022',sourceId:'cso-urban-areas-2022',scope:'national-urban-areas',publisher:'Central Statistics Office / Tailte Éireann',geography:'Republic of Ireland Census 2022 urban statistical areas',period:'2022',expectedCount:867,dataFiles:p=>/^layer-5-records-\d+\.json$/.test(p),limitations:['Census 2022 generalised 20m boundaries; not every rural locality.']},
  childcare:{rawFolder:'pobal-childcare',sourceId:'pobal-childcare',scope:'national-childcare',publisher:'Pobal',geography:'Republic of Ireland publisher childcare directory',period:null,expectedCount:5075,dataFiles:p=>/^layer-2-records-\d+\.json$/.test(p),limitations:['Underlying observation period unknown; layer edit 2026-09-15 does not prove current service availability.','No verified vacancies, age suitability or admissions. Null locations retained.']},
  clubs:{rawFolder:'sport-ireland-clubs',sourceId:'sport-ireland-clubs',scope:'island-wide-source',publisher:'Sport Ireland / Get Ireland Active',geography:'Original island-wide publisher clubs source; jurisdiction unfiltered',period:null,expectedCount:8496,dataFiles:p=>/^page-\d+\.json$/.test(p),limitations:['Northern Ireland records may be present; jurisdiction filtering not applied.','Directory entries do not establish live opening times, membership vacancies or accessibility.'],licenseUrl:'https://data.gov.ie/dataset/7d00a4bd-74e1-406c-8901-aa2969f6b481/resource/4c31ba9e-b55a-44f0-8c70-65b9edfa1f3d'},
  parks:{rawFolder:'parks-gardens-and-public-spaces-dcc',sourceId:'parks-gardens-and-public-spaces-dcc',scope:'dublin-city',publisher:'Dublin City Council',geography:'Dublin City Council selected park/garden/public-space points',period:'2024-01',expectedCount:90,dataFiles:p=>p.endsWith('.geojson'),limitations:['Selected cultural points; not all park entrances or boundaries.','Local council coverage only; absence elsewhere is unknown.'],licenseUrl:'https://data.smartdublin.ie/dataset/parks-gardens-and-public-spaces-dcc'},
  'broadband-counties':{rawFolder:'comreg-broadband',sourceId:'comreg-broadband',scope:'counties',publisher:'ComReg',geography:'Republic of Ireland county statistical boundaries',period:null,expectedCount:26,dataFiles:p=>/^counties\/page-\d+\.json$/.test(p),limitations:['Area-level aggregate percentages do not establish individual premises availability or speed.','Public API has no verified quarter field; catalogue describes Q2 2026 but technical edits do not confirm an observation date.','Gigabit NBI passed including planned differs from reported passed.'],licenseUrl:'https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson'},
  'broadband-small-areas':{rawFolder:'comreg-broadband',sourceId:'comreg-broadband',scope:'small-areas',publisher:'ComReg',geography:'Republic of Ireland Census 2022 small-area statistical boundaries',period:null,expectedCount:18919,dataFiles:p=>/^small-areas\/page-\d+\.json$/.test(p),limitations:['Area-level aggregate percentages do not establish individual premises availability or speed.','Public API has no verified quarter field; catalogue describes Q2 2026 but technical edits do not confirm an observation date.','Premises counts may be suppressed as <200; preserve original value with numeric null.','Gigabit NBI passed including planned differs from reported passed.'],licenseUrl:'https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson'},
  purchase:{rawFolder:'cso-sales',sourceId:'cso-hpm05',scope:'national-regional-monthly-executions-all-statuses',publisher:'Central Statistics Office',geography:'Original CSO HPM05 C03348V04035 regions, local authorities and national total; no town joins',period:'2010-01/2026-07',dataFiles:p=>p==='HPM05.json',limitations:['Historical monthly mean/median purchases are market context, not available properties or affordability guarantees.','Mean/median retain house, apartment and all-type breakdown; no bedroom information.','Only All Dwelling Statuses and Executions selected; other cells explicitly excluded.','Some property-type classification is imputed by the source.'],licenseUrl:'https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/'},
};
export function rawEntries(manifest:any):RawEntry[] {
  const entries=manifest.resources ?? manifest.responses;
  if (!Array.isArray(entries)) throw new Error('Unsupported raw manifest: resources/responses absent');
  return entries.filter((e:any)=>e.sha256 && (e.http_status===200 || e.status==='downloaded')).map((e:any)=>({
    path:e.path??e.file,bytes:e.bytes??e.byte_size,sha256:e.sha256,url:e.requested_url??e.request_url??e.url,
    fetchedAt:e.fetch_completed_utc??e.fetched_at_utc??e.fetch_finished_utc,
  }));
}
function safeAssetPath(root:string,path:string):string {
  if (!path || path.startsWith('/') || path.split(/[\\/]/).includes('..')) throw new Error('Unsafe raw asset path');
  return join(root,path);
}
export async function verifyRawAsset(root:string,asset:Asset):Promise<void> {
  const path=safeAssetPath(root,asset.path);
  const info=await stat(path); if(info.size!==asset.bytes) throw new Error(`Raw size mismatch: ${asset.path}`);
  const hash=createHash('sha256'); for await(const chunk of createReadStream(path)) hash.update(chunk);
  if(hash.digest('hex')!==asset.sha256) throw new Error(`Raw hash mismatch: ${asset.path}`);
}
function digest(value:string|Buffer):string { return createHash('sha256').update(value).digest('hex'); }
const text=(value:any):string|undefined=> typeof value==='string' && value.trim() ? value.trim() : undefined;
const required=(value:any,label:string):string=> {const v=text(value)??(typeof value==='number' && Number.isFinite(value)?String(value):undefined);if(!v)throw new Error(`Missing ${label}`);return v;};
function optional(fields:Record<string,any>):Record<string,string> { return Object.fromEntries(Object.entries(fields).flatMap(([k,v])=>text(v)?[[k,text(v)!]]:[])); }
const metricDefinition:Record<string,string>={
  Premise_Count_Public_View:'Publisher premises count; text bins such as <200 preserve suppression.',
  FTTP_Passed_PCT_Public_View:'Percentage of premises passed by FTTP networks; area aggregate.',
  FTTP_Active_PCT_Public_View:'Percentage of premises with active FTTP connections; area aggregate.',
  Gigabit_Passed_PCT_Public_View:'Percentage of premises passed by gigabit networks; area aggregate.',
  Gigabit_NBI_Passed_PCT_Public_View:'Percentage of premises passed by gigabit networks including planned NBI; not current premises availability.',
  Gigabit_Active_PCT_Public_View:'Percentage of premises with active gigabit connections; area aggregate.',
};
export function normalizeFeature(source:SourceName,feature:any,wkid:number,context:{snapshotId:string;path:string;index:number}):CommonRecord {
  const plan=planBySource[source],a=feature.attributes??feature.properties;
  if(!a || typeof a!=='object')throw new Error('Missing source attributes');
  const geometry=source==='parks' ? (feature.geometry==null ? null : geometrySchema.parse(feature.geometry)) : arcGisGeometry(feature.geometry,wkid);
  let externalId:string,name:string;
  if(source==='towns') {externalId=required(a.URBAN_AREA_GUID,'urban-area GUID');name=required(a.URBAN_AREA_NAME,'urban-area name');}
  else if(source==='childcare') {externalId=required(a.service_ref,'service reference');name=required(a.service_name,'service name');}
  else if(source==='clubs') {externalId=required(a.GlobalID,'club GlobalID');name=required(a.Name,'club name');}
  else if(source==='parks') {name=required(a.Name,'park name');externalId=`name-address:${digest(JSON.stringify([a.Name,a.Address1??null,a.Address2??null]))}`;}
  else {externalId=required(source==='broadband-counties'?a.GlobalID:a.SA_GUID_2022,'geography stable ID');name=source==='broadband-counties'?required(a.COUNTY,'county'): `Small area ${required(a.SA_PUB2022,'small-area code')}`;}
  const base={version:2 as const,id:commonRecordId(plan.sourceId,plan.scope,externalId),externalId,sourceId:plan.sourceId,scope:plan.scope,snapshotId:context.snapshotId,name,
    raw:{path:context.path,locator:`features/${context.index}`},observedPeriod:plan.period,geometry,locationStatus:geometry?'located' as const:'unlocated' as const};
  let record:any;
  if(source==='towns') record={...base,kind:'place',category:'urban_area',geometryMeaning:'statistical_boundary',attributes:{geography:{code:required(a.URBAN_AREA_CODE,'urban-area code'),codeSystem:'CSO_URBAN_AREA_CODE_2022',type:'urban_area',name,vintage:'2022'},...optional({county:a.COUNTY}),aliases:[]}};
  else if(source==='childcare') record={...base,kind:'service',category:'childcare',geometryMeaning:'recorded_location',attributes:{...optional({eircode:a.eircode,serviceType:a.organisation_type}),access:'unknown',programmes:['ecce','ccsp','ncs'].filter(k=>a[k]===true || String(a[k]).toUpperCase()==='TRUE')}};
  else if(source==='clubs') record={...base,kind:'service',category:'clubs',geometryMeaning:'recorded_location',attributes:{...optional({address:a.Address,county:a.County,eircode:a.EircodePostcode,activity:a.Activity,affiliation:a.ClubAffiliation,serviceType:a.RecordType}),access:'unknown'}};
  else if(source==='parks') record={...base,kind:'service',category:'parks',geometryMeaning:'recorded_location',attributes:{address:[text(a.Address1),text(a.Address2)].filter(Boolean).join(', '),access:'unknown',county:'Dublin'}};
  else record={...base,kind:'utility_area',category:'broadband',geometryMeaning:'statistical_boundary',attributes:{
    geography:source==='broadband-counties'?{code:required(a.LOGAINM_ID,'county Logainm ID'),codeSystem:'LOGAINM_ID',type:'county',name,vintage:null}:{code:required(a.SA_PUB2022,'small-area code'),codeSystem:'CSO_SA_PUB2022',type:'small_area',name,vintage:'2022'},
    status:'reported',definition:'ComReg public area aggregate percentages. Current passed, active and planned-NBI metrics remain separate; no premises-level availability assertion.',
    metrics:Object.entries(metricDefinition).filter(([k])=>Object.hasOwn(a,k)).map(([key,definition])=>{
      const original=a[key];if(original!==null && typeof original!=='string' && typeof original!=='number')throw new Error(`Invalid metric type ${key}`);
      const numeric=typeof original==='number'? original : typeof original==='string' && /^\d+(\.\d+)?$/.test(original.trim())?Number(original):null;
      if(numeric!==null && (!Number.isFinite(numeric)||numeric<0||(key!=='Premise_Count_Public_View'&&numeric>100)))throw new Error(`Invalid metric range ${key}`);
      return {key,value:numeric,sourceValue:original,unit:key==='Premise_Count_Public_View'?'premises':'percent',status: key==='Gigabit_NBI_Passed_PCT_Public_View'?'planned': numeric===null?'unknown':'reported',definition};
    }),
  }};
  return commonRecordSchema.parse(record);
}

export type MarketCell={record?:CommonRecord;excludedReason?:string;index:number};
function orderedCodes(dimension:any):string[] {
  const index=dimension?.category?.index;
  if(Array.isArray(index))return index;
  if(index && typeof index==='object')return Object.entries(index).sort((a,b)=>Number(a[1])-Number(b[1])).map(([k])=>k);
  throw new Error('JSON-stat dimension has no category index');
}
export function* normalizePurchase(cube:any,context:{snapshotId:string;path:string}):Generator<MarketCell> {
  const ids=cube.id as string[],sizes=cube.size as number[];
  const expectedIds=['STATISTIC','TLIST(M1)','C03347V04034','C03346V04033','C03341V04028','C03348V04035'];
  if(JSON.stringify(ids)!==JSON.stringify(expectedIds))throw new Error('Unexpected HPM05 dimension order');
  const codes=ids.map(id=>orderedCodes(cube.dimension[id]));
  if(!sizes.every((n,i)=>n===codes[i].length))throw new Error('JSON-stat dimension cardinality mismatch');
  const total=sizes.reduce((a,b)=>a*b,1);
  if(!Array.isArray(cube.value)||cube.value.length!==total)throw new Error('JSON-stat cell cardinality mismatch');
  const stride=sizes.map((_,i)=>sizes.slice(i+1).reduce((a,b)=>a*b,1));
  const volumeStatistic=codes[0].indexOf('HPM05C01');if(volumeStatistic<0)throw new Error('Volume of Sales statistic absent');
  for(let index=0;index<total;index++) {
    const positions=sizes.map((n,i)=>Math.floor(index/stride[i])%n);
    const values=positions.map((p,i)=>codes[i][p]);
    const [statistic,month,type,status,event,region]=values;
    let reason:string|undefined;
    if(status!=='-')reason='dwelling_status_not_all';
    else if(event!=='02')reason='stamp_duty_event_not_executions';
    else if(!['HPM05C03','HPM05C04'].includes(statistic))reason=statistic==='HPM05C01'?'volume_used_as_sample_size_only':'value_of_sales_not_price';
    if(reason){yield {index,excludedReason:reason};continue;}
    if(!['-','01','02'].includes(type))throw new Error(`Unknown dwelling type ${type}`);
    if(!/^\d{6}$/.test(month))throw new Error('Unexpected HPM05 month');
    const sourceValue=cube.value[index];
    if(sourceValue!==null && (typeof sourceValue!=='number'||!Number.isFinite(sourceValue)||sourceValue<0))throw new Error(`Malformed HPM05 value at ${index}`);
    const sample=cube.value[index+(volumeStatistic-positions[0])*stride[0]];
    if(sample!==null && (typeof sample!=='number'||!Number.isInteger(sample)||sample<0))throw new Error(`Malformed HPM05 sample size at ${index}`);
    const period=`${month.slice(0,4)}-${month.slice(4,6)}`, plan=planBySource.purchase;
    const externalId=values.join('|'),regionLabel=required(cube.dimension[ids[5]].category.label[region],'region label');
    const dimensions:Record<string,string>={table:'HPM05'};
    for(let i=0;i<ids.length;i++) {dimensions[ids[i]]=values[i];dimensions[`${ids[i]}:label`]=required(cube.dimension[ids[i]].category.label[values[i]],`${ids[i]} label`);}
    const unit=cube.dimension.STATISTIC.category.unit[statistic]?.label;if(unit!=='Euro')throw new Error('HPM05 price unit is not Euro');
    const observationStatus=sourceValue===null?'missing':sourceValue===0?'source_zero_unverified':'reported';
    yield {index,record:commonRecordSchema.parse({version:2,id:commonRecordId(plan.sourceId,plan.scope,externalId),externalId,sourceId:plan.sourceId,scope:plan.scope,snapshotId:context.snapshotId,
      name:`${regionLabel}: ${dimensions['STATISTIC:label']} ${dimensions['C03347V04034:label']} ${period}`,
      raw:{path:context.path,locator:`value/${index}`},observedPeriod:period,kind:'market_context',category:'buy',geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',
      attributes:{geography:{code:region,codeSystem:'CSO_HPM05_C03348V04035',type:region==='-'?'country':'market_region',name:regionLabel,vintage:null},tenure:'buy',statistic:statistic==='HPM05C03'?'mean':'median',amountEur:observationStatus==='reported'?sourceValue:null,unit:'EUR',period,
        propertyType:type==='-'?'all':type==='01'?'apartment':'house',propertyTypeLabel:dimensions['C03347V04034:label'],bedroomClass:null,bedrooms:null,sampleSize:sample,observationStatus,sourceValue,
        definition:'CSO HPM05 market-based household residential dwelling purchases, monthly executions, all dwelling statuses. Original source regions; no town join. Volume of Sales with identical dimensions supplies sampleSize.',dimensions},
    })};
  }
}

export type NormalizeOptions={rawRoot?:string;output?:string;date?:string;sources?:SourceName[]};
export async function normalizeSource(source:SourceName,options:NormalizeOptions={}):Promise<{source:string;manifest:CommonManifest;files:{records:string;manifest:string;quarantine:string}}> {
  const plan=planBySource[source]; if(!plan)throw new Error(`Unknown adapter ${source}`);
  const date=options.date??'2026-10-04';if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Date must be YYYY-MM-DD');
  const rawRoot=resolve(options.rawRoot??'data/raw'),folder=join(rawRoot,plan.rawFolder,date);
  const originalManifest=await readFile(join(folder,'manifest.json'));
  const rawManifest=JSON.parse(originalManifest.toString('utf8'));
  const entries=rawEntries(rawManifest);
  const dataEntries=entries.filter(e=>plan.dataFiles(e.path)).sort((a,b)=>a.path.localeCompare(b.path));
  if(!dataEntries.length)throw new Error(`No saved data assets for ${source}`);
  // Consume publisher metadata/licence/schema/count/IDs; HPM05 other tables deliberately not consumed.
  const supportEntries=entries.filter(e=>!plan.dataFiles(e.path) && (
    /^(item(-metadata)?|service(-metadata)?|catalogue|layer-\d+-metadata|layer-metadata-before)\.json$/.test(e.path) ||
    e.path==='license-evidence.html' || (source.startsWith('broadband-') && e.path.startsWith(`${plan.scope}/`) && !e.path.includes('page-')) ||
    ((source==='towns'||source==='childcare') && /-(count-before|count-after|ids)\.json$/.test(e.path)) ||
    (source==='clubs' && /^count-(before|after)\.json$/.test(e.path))
  ));
  const consumed=[...dataEntries,...supportEntries].sort((a,b)=>a.path.localeCompare(b.path));
  for(const e of consumed)await verifyRawAsset(folder,e);
  const manifestAsset={path:`${plan.rawFolder}/${date}/manifest.json`,bytes:originalManifest.length,sha256:digest(originalManifest)};
  const assets=[manifestAsset,...consumed.map(e=>({path:`${plan.rawFolder}/${date}/${e.path}`,bytes:e.bytes,sha256:e.sha256}))].sort((a,b)=>a.path.localeCompare(b.path));
  const quarantineConfig=geometryQuarantineConfigSchema.parse(JSON.parse(await readFile(new URL('../../config/common-geometry-quarantine.json',import.meta.url),'utf8').catch((error:any)=> {if(error.code==='ENOENT')throw new Error('Geometry quarantine configuration missing');throw error;})));
  const applicableRules=quarantineConfig.rules.filter(rule=>rule.match.sourceId===plan.sourceId && rule.match.scope===plan.scope && assets.some(asset=>asset.path===rule.match.rawPath&&asset.sha256===rule.match.rawSha256));
  const adapterVersion=applicableRules.length?'2.0.1-geometry-quarantine':PARSER_VERSION;
  const snapshotId=digest(JSON.stringify({source:plan.sourceId,scope:plan.scope,version:adapterVersion,assets,...(applicableRules.length?{geometryQuarantineRules:applicableRules}:{})}));
  const destination=resolve(options.output??'data/canonical'),target=join(destination,source,snapshotId);await mkdir(target,{recursive:true});
  const recordsFile=join(target,'records.ndjson'),quarantineFile=join(target,'quarantine.ndjson'),manifestFile=join(target,'records.ndjson.manifest.json');
  const recordsTemp=`${recordsFile}.tmp`,quarantineTemp=`${quarantineFile}.tmp`;
  const out=createWriteStream(recordsTemp),quarantine=createWriteStream(quarantineTemp);
  const hash=createHash('sha256'),seen=new Set<string>();
  const quality:CommonManifest['quality']={inputRecords:0,acceptedRecords:0,quarantinedRecords:0,unlocatedRecords:0,excludedRecords:0,exclusions:{}};
  async function line(stream:ReturnType<typeof createWriteStream>,value:unknown):Promise<string> {const data=JSON.stringify(value)+'\n';if(!stream.write(data))await once(stream,'drain');return data;}
  async function accepted(record:CommonRecord) {
    if(seen.has(record.id))throw new Error(`Duplicate canonical identity ${record.id}`);seen.add(record.id);
    hash.update(await line(out,record));quality.acceptedRecords++;if(record.locationStatus==='unlocated')quality.unlocatedRecords++;
  }
  try {
    for(const entry of dataEntries) {
      const bytes=await readFile(safeAssetPath(folder,entry.path));
      if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error(`Raw file changed while parsing: ${entry.path}`);
      const page=JSON.parse(bytes.toString('utf8'));if(page.error)throw new Error(`Saved source API error in ${entry.path}`);
      const path=`${plan.rawFolder}/${date}/${entry.path}`;
      if(source==='purchase') {
        // Table structure errors fail the snapshot. Cell-specific errors do not silently drop rows.
        for(const cell of normalizePurchase(page,{snapshotId,path})) {
          quality.inputRecords++;
          if(cell.excludedReason) {quality.excludedRecords++;quality.exclusions[cell.excludedReason]=(quality.exclusions[cell.excludedReason]??0)+1;}
          else if(cell.record) await accepted(cell.record);
        }
      } else {
        if(!Array.isArray(page.features))throw new Error(`Missing source features in ${entry.path}`);
        const wkid=page.spatialReference?.latestWkid??page.spatialReference?.wkid??(source==='parks'?4326:undefined);
        if(wkid===undefined)throw new Error(`Unknown source CRS in ${entry.path}`);
        for(let index=0;index<page.features.length;index++) {
          quality.inputRecords++;
          try {
            const record=normalizeFeature(source,page.features[index],wkid,{snapshotId,path,index});
            const rule=matchingGeometryQuarantine(record,entry.sha256,applicableRules);
            if(rule) {
              quality.quarantinedRecords++;
              await line(quarantine,{sourceId:plan.sourceId,scope:plan.scope,externalId:record.externalId,raw:record.raw,reason:rule.reason,
                rule:{id:rule.id,sha256:ruleHash(rule),match:rule.match,validator:rule.validator}});
            } else await accepted(record);
          }
          catch(error) {quality.quarantinedRecords++;await line(quarantine,{sourceId:plan.sourceId,scope:plan.scope,raw:{path,locator:`features/${index}`},reason:error instanceof Error?error.message:String(error)});}
        }
      }
    }
    if(plan.expectedCount!==undefined && quality.inputRecords!==plan.expectedCount)throw new Error(`Source count mismatch: expected ${plan.expectedCount}, read ${quality.inputRecords}`);
    out.end();quarantine.end();await Promise.all([once(out,'finish'),once(quarantine,'finish')]);
    const licenseUrl=plan.licenseUrl??rawManifest.license_evidence?.url??rawManifest.licence_evidence_url??rawManifest.dataset?.license_url;
    const manifest=commonManifestSchema.parse({version:2,snapshotId,sourceId:plan.sourceId,scope:plan.scope,publisher:plan.publisher,sourceUrl:dataEntries[0].url,
      license:'CC-BY-4.0',licenseEvidenceUrl:licenseUrl,attribution:`${plan.publisher}; CC BY 4.0. Original source references retained in raw assets.`,reuseStatus:'approved',
      fetchedAt:dataEntries.map(e=>e.fetchedAt).sort().at(-1),observedPeriod:plan.period,geography:plan.geography,coverage:'partial',limitations:[...plan.limitations,...applicableRules.map(rule=>`Configured topology quarantine ${rule.id}: ${rule.reason}; rule SHA256 ${ruleHash(rule)}; frozen raw hash bound; no automatic geometry repair.`),...(quality.quarantinedRecords?[`${quality.quarantinedRecords} source feature(s) quarantined; incomplete spatial coverage remains explicit.`]:[])],
      adapter:{id:source,version:adapterVersion},rawAssets:assets,recordCount:quality.acceptedRecords,sha256:hash.digest('hex'),format:'ndjson',quality});
    await rename(recordsTemp,recordsFile);await rename(quarantineTemp,quarantineFile);
    await Bun.write(`${manifestFile}.tmp`,JSON.stringify(manifest,null,2)+'\n');await rename(`${manifestFile}.tmp`,manifestFile);
    return {source,manifest,files:{records:recordsFile,manifest:manifestFile,quarantine:quarantineFile}};
  } catch(error) {
    out.destroy();quarantine.destroy();await Promise.all([rm(recordsTemp,{force:true}),rm(quarantineTemp,{force:true})]);throw error;
  }
}
