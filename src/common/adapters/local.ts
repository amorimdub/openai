import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { arcGisGeometry, projectPosition } from '../geometry';
import { geometrySchema } from '../../schema';
import { commonRecordId, commonRecordSchema, type CommonRecord } from '../schema';
import type { AdapterContext, AdapterRow, ExtendedAdapter } from './types';

const text=(value:unknown)=>value==null?'':String(value).trim();
const integer=(value:unknown)=>{const t=text(value).replaceAll(',','');return /^\d+$/.test(t)?Number(t):null;};
const decoder=new TextDecoder('utf-8',{fatal:true});
const licence='CC-BY-4.0' as const;
function base(plan:ExtendedAdapter,ctx:AdapterContext,id:string,name:string,locator:string,period=plan.observedPeriod) {
  return {version:2 as const,id:commonRecordId(plan.sourceId,plan.scope,id),externalId:id,sourceId:plan.sourceId,scope:plan.scope,snapshotId:ctx.snapshotId,name,raw:{path:ctx.path,locator},observedPeriod:period};
}
function geoJsonGeometry(geometry:any,wkid:number):CommonRecord['geometry'] {
  if(!geometry)return null;
  const project=(coords:any):any=>Array.isArray(coords)&&typeof coords[0]==='number'?projectPosition(coords,wkid):coords.map(project);
  return geometrySchema.parse({type:geometry.type,coordinates:project(geometry.coordinates)});
}
function crs(doc:any) {const name=doc.crs?.properties?.name??'';const match=/EPSG(?:::|:|\/0\/)(\d+)/i.exec(name);return doc.spatialReference?.latestWkid??doc.spatialReference?.wkid??(match?Number(match[1]):4326);}
function inIreland(geometry:CommonRecord['geometry']) {if(!geometry)return true;let valid=true;const walk=(p:any)=>{if(typeof p[0]==='number'){if(p[0]<-11||p[0]>-5||p[1]<51||p[1]>56)valid=false;}else p.forEach(walk);};walk(geometry.coordinates);return valid;}
const sourceId=(f:any,a:any,name:string)=>text(a.GlobalID??a.GLOBALID??a.OBJECTID??a.FID??a.PRIMARYINDEX??a.ID??f.id??a.Park_ID)||`${name}|${text(a.address??a.Address??a.Address1)}|${text(a.Address2)}`;
type FeatureOptions={name:(a:any)=>string;category:string|((a:any)=>string); kind?:'service'|'infrastructure'|'water_protection';wkid?:number;id?:(f:any,a:any,name:string)=>string;attributes?:(a:any)=>any;quarantine?:string;period?:(a:any)=>string|null};
function featurePlan(id:string,folder:string,scope:string,publisher:string,period:string|null,count:number|undefined,options:FeatureOptions,selectData=(path:string)=>/\.(geojson)$/.test(path)||/(^|\/)page[-_]\d+\.json$/.test(path),license:ExtendedAdapter['license']=licence):ExtendedAdapter {
  const plan:ExtendedAdapter={id,rawFolder:folder,sourceId:folder,scope,publisher,geography:scope,observedPeriod:period,license,licenseEvidenceUrl:`https://data.gov.ie/dataset/${folder}`,attribution:publisher,limitations:[`Dated ${scope} inventory; coverage is partial and absence does not establish unavailable services.`,...(options.kind==='infrastructure'?['Recorded assets do not establish current operation, illumination or household connection.']:[]),...(options.kind==='water_protection'?['Hydrological source protection is not a boundary of connected customer properties.']:[])],selectData,expectedCount:count,
    *rows(bytes,ctx){const doc=JSON.parse(decoder.decode(bytes));if(!Array.isArray(doc.features))throw new Error('Expected a feature collection');const wkid=options.wkid??crs(doc);
      for(let i=0;i<doc.features.length;i++){const locator=`features/${i}`;const f=doc.features[i],a=f.properties??f.attributes??{};
        if(options.quarantine){yield {quarantineReason:options.quarantine,locator};continue;}
        try {const name=options.name(a)||`${options.category} ${i}`;const id=options.id?.(f,a,name)??sourceId(f,a,name);const geometry=f.type==='Feature'?geoJsonGeometry(f.geometry,wkid):arcGisGeometry(f.geometry,wkid);
          if(!inIreland(geometry))throw new Error('Geometry falls outside Ireland bounds; original coordinates preserved without guessing corrections');
          const category=typeof options.category==='function'?options.category(a):options.category;
          const b={...base(plan,ctx,id,name,locator,options.period?.(a)??plan.observedPeriod),geometry,locationStatus:geometry?'located' as const:'unlocated' as const};
          let record:CommonRecord;
          if(options.kind==='infrastructure')record={...b,kind:'infrastructure',category,geometryMeaning:'infrastructure_asset',attributes:{assetType:category,status:'unknown',definition:'Dated recorded asset location; operating state and household connections are unknown.',...options.attributes?.(a)}};
          else if(options.kind==='water_protection'){
            if(!geometry)throw new Error('Protection area missing geometry');
            record={...b,geometry,locationStatus:'located',kind:'utility_area',category,geometryMeaning:'source_protection_boundary',attributes:{geography:{code:id,codeSystem:'GSI:source-protection',type:'source_protection_area',name,vintage:options.period?.(a)??null},status:'reported',definition:'Hydrological source protection/catchment polygon; does not indicate property connection or scheme membership.',metrics:[]}};
          }else record={...b,kind:'service',category,geometryMeaning:'recorded_location',attributes:{access:'unknown',...options.attributes?.(a)}};
          yield {record:commonRecordSchema.parse(record)};
        }catch(error){yield {quarantineReason:error instanceof Error?error.message:String(error),locator};}
      }
    }};return plan;
}
const address=(a:any)=>[a.Address??a.address??a.Address_1??a.Address1,a.Address_2??a.Address2,a.Address_3??a.Address3].map(text).filter(Boolean).join(', ');
const facilityAttrs=(a:any)=>({...(address(a)?{address:address(a)}:{}),...(text(a.Eircode??a.eircode)?{eircode:text(a.Eircode??a.eircode)}:{}),...(text(a.County)?{county:text(a.County)}:{})});
const communityName=(a:any)=>text(a.Name??a.name??a.Title??a.Organisation);
const parkName=(a:any)=>text(a.Name??a.name??a.park_name??a.RefName);
const lightingAttrs=(a:any)=>({street:text(a.Postal_Street_Name??a.PostalStreetName??a.site_name),...(text(a.LAMP??a.LAMPNAME??a.unit_type)?{assetType:text(a.LAMP??a.LAMPNAME??a.unit_type)}:{})});

export function parseLocalCsv(bytes:Uint8Array):string[][] {
  const csv=new TextDecoder('windows-1252').decode(bytes);const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else throw new Error('Malformed CSV quote');}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }if(quoted)throw new Error('Unterminated quoted CSV field');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
const housing:ExtendedAdapter={id:'housing-construction',rawFolder:'housing-construction-q1-2026',sourceId:'housing-construction-q1-2026',scope:'national-projects',publisher:'Department of Housing, Local Government and Heritage',geography:'31 local authorities; individual projects are unlocated',observedPeriod:'2026-Q1',license:'CC-BY-SA-4.0',licenseEvidenceUrl:'https://opendata.housing.gov.ie/dataset/social-housing-construction-status-report-q1-2026',attribution:'Department of Housing, Local Government and Heritage, Q1 2026 Construction Status Report; CC BY-SA 4.0',limitations:['Quarterly historical project delivery stages are informational, not available homes, eligibility or vacancies.','No coordinates or bedroom counts are provided; do not geocode project names by guessing.','CC BY-SA 4.0 attribution and share-alike obligations apply.'],selectData:p=>p.endsWith('/csr-q1-2026.csv')||p==='csr-q1-2026.csv',
  *rows(bytes,ctx){const rows=parseLocalCsv(bytes);for(let index=0;index<rows.length;index++){const row=rows[index];const locator=`csv/${index}`;if(index<3||!/^\d+$/.test(text(row[0]))){yield {excludedReason:index<3?'summary_or_header':'blank_footer_or_note',locator};continue;}
    const id=text(row[0]),la=text(row[2]),name=text(row[3]);if(!la||!name){yield {quarantineReason:'Missing project name or local authority',locator};continue;}
    const stages=['capital_appraisal','pre_planning','pre_tender_design','tender_report_or_final_approval','on_site','completed'];const entries=stages.map((stage,i)=>({stage,value:text(row[i+6])})).filter(s=>s.value);const stage=entries.at(-1);const units=integer(row[4]);
    if(text(row[4])&&units===null){yield {quarantineReason:'Invalid units count',locator};continue;}
    yield {record:commonRecordSchema.parse({...base(housing,ctx,id,name,locator),kind:'housing_information',category:'government_projects',geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',attributes:{geography:{code:la,codeSystem:'Housing:local-authority-name',type:'local_authority',name:la,vintage:'2026-Q1'},localAuthority:la,schemeName:name,units,status:stage?`${stage.stage}: ${stage.value}`:'not_reported',period:'2026-Q1',definition:'Q1 2026 project delivery report. Stage/date text is historical information and does not establish availability or entitlement.',fundingProgramme:text(row[1])}})};
  }} };
const waterDirectory:ExtendedAdapter={id:'uisce-water-zones',rawFolder:'uisce-water-zones',sourceId:'uisce-water-zones',scope:'national-supply-directory',publisher:'Uisce Éireann',geography:'Water service areas; directory has no geometry',observedPeriod:'2026-Q1',license:licence,licenseEvidenceUrl:'https://www.water.ie/open-data',attribution:'Uisce Éireann, Public Water Supply Zone Information Q1 2026',limitations:['Supply-zone directory is not a map of served premises or mains pipes.','Population is dated 27 March 2026 and is not a current connection count.'],selectData:p=>p.endsWith('.xlsx'),
  *rows(bytes,ctx){const wb=XLSX.read(bytes,{type:'array',cellDates:false});const sheetName='WSZ 2026';const sheet=wb.Sheets[sheetName];if(!sheet)throw new Error('Expected WSZ 2026 sheet');const rows=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1,defval:'',raw:true});
    if(text(rows[0]?.[0])!=='Water Services Area'||text(rows[0]?.[2])!=='EDEN Water Supply Zone Code')throw new Error('Unexpected water directory header');
    for(let i=0;i<rows.length;i++){const locator=`XLSXsheet:${sheetName}/row:${i+1}`;const r=rows[i];if(i===0||r.every(v=>!text(v))){yield {excludedReason:i===0?'header':'blank_row',locator};continue;}
      const la=text(r[0]),name=text(r[1]),id=text(r[2]);if(!la||!name||!id){yield {quarantineReason:'Missing directory supply identity',locator};continue;}const population=integer(r[6]);if(text(r[6])&&population===null){yield {quarantineReason:'Invalid supply population',locator};continue;}
      yield {record:commonRecordSchema.parse({...base(waterDirectory,ctx,id,name,locator),kind:'utility_observation',category:'water_supply_directory',geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',attributes:{geography:{code:la,codeSystem:'Uisce:water-service-area-name',type:'water_service_area',name:la,vintage:'2026-Q1'},supplyCode:id,supplyName:name,localAuthority:la,population,definition:'Named water supply zone directory; no customer-service boundaries and no household connection inference.',status:'reported'}})};
    }
  }};
export function geoPackagePoint(bytes:Uint8Array) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes[0]!==71||bytes[1]!==80)throw new Error('Invalid GeoPackage geometry header');const flags=bytes[3],little=(flags&1)===1;const envelope=(flags>>1)&7;const lengths=[0,32,48,48,64];if(envelope>4||(flags&16)!==0)throw new Error('Unsupported empty or envelope GeoPackage geometry');const sr=view.getInt32(4,little);const offset=8+lengths[envelope];const wkbLittle=view.getUint8(offset)===1;if(view.getUint32(offset+1,wkbLittle)!==1)throw new Error('Only known Cork POINT geometry is supported');return projectPosition([view.getFloat64(offset+5,wkbLittle),view.getFloat64(offset+13,wkbLittle)],sr);
}
const cork:ExtendedAdapter={id:'cork-parks',rawFolder:'cork-city-parks',sourceId:'cork-city-parks',scope:'cork-city',publisher:'Cork City Council',geography:'Cork City Council parks subset',observedPeriod:null,license:licence,licenseEvidenceUrl:'https://data.gov.ie/dataset/cork-city-parks',attribution:'Cork City Council, parks inventory',limitations:['Recorded park locations are a local inventory, not park boundaries or opening status.'],expectedCount:101,selectData:p=>p.endsWith('/parks.gpkg')||p==='parks.gpkg',
 async *rows(bytes,ctx){const dir=await mkdtemp(join(tmpdir(),'ireland-cork-parks-'));const file=join(dir,'parks.gpkg');await Bun.write(file,bytes);const db=new Database(file,{readonly:true});
  try{const columns=db.query('SELECT geometry_type_name,srs_id FROM gpkg_geometry_columns WHERE table_name=?').all('Parks') as any[];if(columns[0]?.geometry_type_name!=='POINT'||columns[0]?.srs_id!==2157)throw new Error('Unexpected Cork geometry schema');const rows=db.query('SELECT OBJECTID,SHAPE,Name,Type FROM Parks ORDER BY OBJECTID').all() as any[];
   for(const row of rows){const id=text(row.OBJECTID),locator=`gpkg:Parks/OBJECTID:${id}`;try{const geometry={type:'Point' as const,coordinates:geoPackagePoint(row.SHAPE)};if(!inIreland(geometry))throw new Error('Cork location outside Ireland');yield {record:commonRecordSchema.parse({...base(cork,ctx,id,text(row.Name)||`Park ${id}`,locator),kind:'service',category:'parks',geometry,locationStatus:'located',geometryMeaning:'recorded_location',attributes:{access:'unknown',serviceType:text(row.Type)}})};}catch(error){yield {quarantineReason:String(error),locator};}}
  }finally{db.close();await rm(dir,{recursive:true});}
 }};

export const localAdapters:ExtendedAdapter[]=[
 featurePlan('community-dcc','community-centres-dcc','dublin-city','Dublin City Council','2019/2023',99,{name:communityName,category:'community_centres',attributes:facilityAttrs}),
 featurePlan('community-dlr','community-facilities-dlr','dun-laoghaire-rathdown','Dún Laoghaire-Rathdown County Council',null,53,{name:communityName,category:a=>({Community:'community_centres',Library:'libraries',Culture:'cultural_facilities',Heritage:'heritage_sites'}[text(a.category)]??'community_facilities'),attributes:a=>({...facilityAttrs(a),serviceType:text(a.category)})}),
 featurePlan('community-fcc','community-centres-2025-fcc','fingal','Fingal County Council',null,41,{name:communityName,category:'community_centres',quarantine:'Publisher geometry and Lat/Long fields are transposed/corrupt; no correction inferred. Original research identified this exact source defect.'}),
 featurePlan('community-sdcc','multi-use-community-centres1','south-dublin','South Dublin County Council',null,32,{name:communityName,category:'community_centres',attributes:facilityAttrs},undefined,'CC0-1.0'),
 featurePlan('community-galway','galway-city-community-centre-locations2','galway-city','Galway City Council',null,4,{name:communityName,category:'community_centres',attributes:a=>({address:text(a.Location)})}),
 featurePlan('community-roscommon','community-centres6','roscommon','Roscommon County Council',null,41,{name:communityName,category:'community_centres',attributes:facilityAttrs}),
 featurePlan('parks-dcc-boundaries','parks-and-open-spaces-dcc','dublin-city-2016','Dublin City Council','2016',566,{name:parkName,category:'parks',attributes:a=>({serviceType:text(a.Typology)})}),
 featurePlan('parks-dlr','main-parks-dlr','dun-laoghaire-rathdown','Dún Laoghaire-Rathdown County Council',null,15,{name:parkName,category:'parks',attributes:a=>({serviceType:text(a.type)})}),
 featurePlan('playgrounds-fcc','local-national-parks-and-play-grounds-fcc-20232','fingal','Fingal County Council',null,52,{name:parkName,category:'playgrounds',attributes:a=>({...facilityAttrs(a),serviceType:text(a.Type)})}),
 featurePlan('parks-sdcc','parks-sdcc1','south-dublin','South Dublin County Council',null,84,{name:parkName,category:'parks',attributes:a=>({serviceType:text(a.Hierarchy)})}),
 featurePlan('activities','sport-ireland-activities','island-wide-source','Sport Ireland',null,5507,{name:a=>text(a.Name),category:'activities',attributes:a=>({...facilityAttrs(a),activity:text(a.Activity),access:text(a.OpenToPublic)==='Yes'?'public':'unknown'})}),
 featurePlan('lighting-dcc','street-lighting-dublin-city','dublin-city','Dublin City Council','2021',45017,{name:a=>`Light ${text(a.ID)} ${text(a.site_name)}`,category:'street_lighting',kind:'infrastructure',attributes:lightingAttrs}),
 featurePlan('lighting-dlr','dlr-public-lighting','dun-laoghaire-rathdown','Dún Laoghaire-Rathdown County Council','2021-04-19',23530,{name:a=>`Light ${text(a.OBJECTID)} ${text(a.PostalStreetName)}`,category:'street_lighting',kind:'infrastructure',attributes:lightingAttrs}),
 featurePlan('lighting-fcc','public-lighting-fcc1','fingal','Fingal County Council','2024-03',35170,{name:a=>`Light ${text(a.OBJECTID)} ${text(a.Postal_Street_Name)}`,category:'street_lighting',kind:'infrastructure',attributes:lightingAttrs}),
 featurePlan('lighting-sdcc','public-lighting-sdcc1','south-dublin','South Dublin County Council','2023-10-04',35280,{name:a=>`Light ${text(a.OBJECTID)} ${text(a.Postal_Street_Name)}`,category:'street_lighting',kind:'infrastructure',attributes:lightingAttrs}),
 featurePlan('water-ral','epa-remedial-action-list','national-remedial-list','Environmental Protection Agency',null,35,{name:a=>text(a.Water_Supply_Name),category:'water_supply_remediation',kind:'infrastructure',id:(_f,a)=>text(a.Scheme_Code),attributes:a=>({assetType:'listed_water_supply',county:text(a.County),sourceCode:text(a.Scheme_Code),definition:'EPA-listed supply location and remediation context; not customer supply boundaries or a current boil-water notice.',issues:Object.entries(a).filter(([key,value])=>value==='True'&&!['County','Scheme_Code'].includes(key)).map(([key])=>key)})}),
 featurePlan('water-gsi-public','gsi-water-source-protection','public-source-protection','Geological Survey Ireland',null,357,{name:a=>text(a.SPA_NAME),category:'water_source_protection',kind:'water_protection',period:a=>typeof a.REPORTDATE==='number'?new Date(a.REPORTDATE).toISOString().slice(0,10):text(a.REPORT_DATE)||null},p=>/public-source-protection\/page[-_]\d+\.json$/.test(p)),
 featurePlan('water-gsi-group','gsi-water-source-protection','group-scheme-contribution','Geological Survey Ireland',null,254,{name:a=>text(a.GWS_NAME),category:'group_water_source_protection',kind:'water_protection',period:a=>text(a.YEAR)||null},p=>/group-scheme-contribution\/page[-_]\d+\.json$/.test(p)),
 housing,waterDirectory,cork,
];

// Dataset-specific URLs verified in the preserved raw licence evidence; do not infer licence from a publisher.
const licenceEvidence:Record<string,string>={
  "parks-sdcc1": "https://data.smartdublin.ie/dataset/parks-sdcc1",
  "multi-use-community-centres1": "https://data.smartdublin.ie/dataset/multi-use-community-centres1",
  "sport-ireland-activities": "https://data.gov.ie/dataset/getirelandactive_activitylocations",
  "public-lighting-fcc1": "https://data.smartdublin.ie/dataset/public-lighting-fcc1",
  "community-facilities-dlr": "https://data.smartdublin.ie/dataset/community-facilities-dlr",
  "community-centres6": "https://data.gov.ie/dataset/community-centres6",
  "parks-and-open-spaces-dcc": "https://data.smartdublin.ie/dataset/parks-and-open-spaces-dcc",
  "community-centres-2025-fcc": "https://data.smartdublin.ie/dataset/community-centres-2025-fcc",
  "dlr-public-lighting": "https://data.smartdublin.ie/dataset/dlr-public-lighting",
  "public-lighting-sdcc1": "https://data.smartdublin.ie/dataset/public-lighting-sdcc1",
  "epa-remedial-action-list": "https://data.gov.ie/dataset/environmental-protection-agency-remedial-action-list",
  "housing-construction-q1-2026": "https://opendata.housing.gov.ie/dataset/social-housing-construction-status-report-q1-2026",
  "community-centres-dcc": "https://data.smartdublin.ie/dataset/community-centres-dcc",
  "street-lighting-dublin-city": "https://data.smartdublin.ie/dataset/street-lighting-dublin-city",
  "local-national-parks-and-play-grounds-fcc-20232": "https://data.smartdublin.ie/dataset/local-national-parks-and-play-grounds-fcc-20232",
  "cork-city-parks": "https://data.corkcity.ie/dataset/cork-city-parks",
  "uisce-water-zones": "https://www.water.ie/open-data",
  "main-parks-dlr": "https://data.smartdublin.ie/dataset/main-parks-dlr",
  "gsi-water-source-protection": "https://data.gov.ie/dataset/group-scheme-preliminary-source-protection-areas-ireland-roi-itm",
  "galway-city-community-centre-locations2": "https://data.gov.ie/dataset/galway-city-community-centre-locations2"
};
for(const adapter of localAdapters)adapter.licenseEvidenceUrl=licenceEvidence[adapter.rawFolder];
