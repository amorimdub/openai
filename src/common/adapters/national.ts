import { arcGisGeometry, projectPosition } from '../geometry';
import { geometrySchema, type Geometry } from '../../schema';
import { commonRecordId, commonRecordSchema, type CommonRecord } from '../schema';
import type { AdapterRow, ExtendedAdapter } from './types';
import { parseCsv } from './csv';

const text = (v: unknown): string | undefined => typeof v === 'string' && v.trim() && v.trim() !== '<Null>' ? v.trim() : undefined;
const required = (v: unknown, label: string): string => {
  const result = text(v) ?? (typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);
  if (!result) throw new Error(`Missing ${label}`);
  return result;
};
const optional = (fields: Record<string, unknown>): Record<string, string> => Object.fromEntries(Object.entries(fields).flatMap(([k,v]) => text(v) ? [[k,text(v)!]] : []));
const address = (...parts: unknown[]): string | undefined => parts.map(text).filter(Boolean).join(', ') || undefined;

export function nationalPoint(value: any, wkid: number): Geometry | null {
  if (value == null) return null;
  if (wkid !== 29902 && wkid !== 29900) return arcGisGeometry(value, wkid);
  return geometrySchema.parse({type:'Point',coordinates:projectPosition([value.x,value.y],29902)});
}

type Context = {path:string;snapshotId:string};
function service(adapter: Pick<ExtendedAdapter,'sourceId'|'scope'|'observedPeriod'>, externalId: string, name: string, geometry: Geometry | null, category: string, attrs: Record<string,unknown>, ctx: Context, locator: string): CommonRecord {
  return commonRecordSchema.parse({version:2,id:commonRecordId(adapter.sourceId,adapter.scope,externalId),externalId,sourceId:adapter.sourceId,scope:adapter.scope,snapshotId:ctx.snapshotId,name,raw:{path:ctx.path,locator},observedPeriod:adapter.observedPeriod,kind:'service',category,geometry,locationStatus:geometry?'located':'unlocated',geometryMeaning:'recorded_location',attributes:{access:'unknown',...attrs}});
}
function* arcRows(adapter: ExtendedAdapter, bytes: Uint8Array, ctx: Context, category: string, fields: (a:any) => {id:string;name:string;attrs:Record<string,unknown>}): Iterable<AdapterRow> {
  const doc=JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(doc.features) || doc.exceededTransferLimit === true) throw new Error('Incomplete/malformed ArcGIS response');
  const wkid=doc.spatialReference?.latestWkid ?? doc.spatialReference?.wkid;
  if (![2157,29900,29902,4326,3857,102100].includes(wkid)) throw new Error(`Unknown source CRS: ${wkid}`);
  for (let index=0;index<doc.features.length;index++) {
    const locator=`features/${index}`;
    try {
      const feature=doc.features[index], a=feature.attributes;
      const {id,name,attrs}=fields(a);
      yield {record:service(adapter,id,name,nationalPoint(feature.geometry,wkid),category,attrs,ctx,locator)};
    } catch(error) {yield {quarantineReason:error instanceof Error?error.message:'Malformed source row',locator};}
  }
}
const arcSelect=(layer:number)=>(p:string)=>new RegExp(`^layer-${layer}-records-\\d+\\.json$`).test(p);
const hospital: ExtendedAdapter = {
  id:'hospitals',rawFolder:'hse-hospitals-2020',sourceId:'hse-hospitals-2020',scope:'national-hospital-directory-2020',publisher:'HSE / GeoHive',geography:'Republic of Ireland historical hospital directory',observedPeriod:'2020-03',license:'CC-BY-4.0',licenseEvidenceUrl:'https://www.arcgis.com/sharing/rest/content/items/feb34881088341bbbf80d86af6a4f333?f=pjson',attribution:'HSE Health Atlas, GeoHive, CC BY 4.0',expectedCount:132,
  limitations:['Health Atlas supplied March 2020; not a current hospital register.','Includes community and specialist hospitals; no emergency, clinical-condition, capacity, opening-hours or travel-time suitability established.'],selectData:arcSelect(0),
  rows(bytes,ctx){return arcRows(this,bytes,ctx,'hospital',a=>({id:required(a.OBJECTID,'object ID'),name:required(a.name,'hospital name'),attrs:{...optional({address:address(a.address1,a.address2,a.address3,a.address4),eircode:a.Eircode,serviceType:a.subcategory})}}));},
};
const gp: ExtendedAdapter = {
  id:'gp',rawFolder:'hse-gp-2020',sourceId:'hse-gp-2020',scope:'national-gp-directory-2020',publisher:'HSE / GeoHive',geography:'Republic of Ireland historical GP directory entries; not unique practices',observedPeriod:'2020-03',license:'CC-BY-4.0',licenseEvidenceUrl:'https://www.arcgis.com/sharing/rest/content/items/01cb04a1fab34c72a746dc660622fe73?f=pjson',attribution:'HSE Health Atlas, GeoHive, CC BY 4.0',expectedCount:6608,
  limitations:['March 2020 directory includes individual GP rows; co-located records are not deduplicated practice counts.','GP person names, contacts and URLs are omitted; unnamed practice rows retain anonymous directory labels.','No current new-patient acceptance, specialist treatment or travel-time suitability established. Source lat/lon column names are reversed; native EPSG:2157 geometry is authoritative.'],selectData:arcSelect(0),
  rows(bytes,ctx){return arcRows(this,bytes,ctx,'gp',a=>{const id=required(a.OBJECTID,'object ID');return {id,name:text(a.ServiceName)??`General practitioner directory entry ${id}`,attrs:{...optional({address:address(a.Address,a.Address1,a.Town_City,a.County),county:a.County,eircode:a.Eircode,serviceType:a.Service})}};});},
};
function school(layer:number,category:string,level:string,count:number): ExtendedAdapter {
  return {id:`schools-${level}`,rawFolder:'schools-historical',sourceId:'schools-historical',scope:`national-${level}-schools-2014-15`,publisher:'Government of Ireland / historical GeoHive mirror',geography:'Republic of Ireland historical provisional school register',observedPeriod:'2014/15',license:'CC-BY-4.0',licenseEvidenceUrl:'https://www.arcgis.com/sharing/rest/content/items/df226b216e69428d8647ff8101d627a4?f=pjson',attribution:'Government of Ireland, Department of Education and Department of Arts, Heritage and the Gaeltacht, CC BY 4.0',expectedCount:count,
    limitations:['Historical 2014/15 provisional register; current operations, admissions, catchments, child-age suitability and vacancies unknown.','Historical mirror provenance is not independently authenticated; licence explicitly asserted in item metadata. Enrolment and class-size fields omitted.'],selectData:arcSelect(layer),
    rows(bytes,ctx){return arcRows(this,bytes,ctx,category,a=>({id:required(a.RollNo??a.ROLL_NO??a.ROLL_NO__,'school roll number'),name:required(text(a.SchoolName)??text(a.School_Nam)??text(a.OFFICIAL_N),'school name'),attrs:{...optional({address:address(a.Address1??a.Address_1,a.Address2??a.Address_2,a.Address3??a.Address_3),county:a.Contae}),schoolLevel:level}}));},
  };
}

/** CSV parser handles quoted commas, escaped quotes, CRLF and embedded newlines. */
export function parseNationalCsv(input: string): Record<string,string>[] {
  return parseCsv(input).rows;
}

const airports: ExtendedAdapter = {
  id:'airports',rawFolder:'ourairports-ireland',sourceId:'ourairports-ireland',scope:'scheduled-passenger-airports',publisher:'OurAirports community contributors',geography:'Republic of Ireland country export; scheduled-service airports only',observedPeriod:null,license:'public-domain',licenseEvidenceUrl:'https://ourairports.com/data/',attribution:'OurAirports community contributors; public domain',
  limitations:['Community directory without accuracy guarantee; not an official Irish aviation register.','Only scheduled-service airports are selected; closed, heliport and unscheduled aerodromes excluded. Scheduled-service flag does not verify a current flight schedule or passenger accessibility.','Individual source update timestamps vary; download date is not an observation period.'],selectData:p=>p==='airports.csv',
  *rows(bytes,ctx){const rows=parseNationalCsv(new TextDecoder().decode(bytes));for(let index=0;index<rows.length;index++){const a=rows[index],locator=`rows/${index}`;if(a.iso_country!=='IE'){yield{excludedReason:'not_republic_of_ireland_country_code',locator};continue;}if(a.scheduled_service!=='1'&&a.scheduled_service!=='yes'){yield{excludedReason:'no_reported_scheduled_service',locator};continue;}if(!['large_airport','medium_airport','small_airport'].includes(a.type)){yield{excludedReason:'not_open_airport_type',locator};continue;}try {yield{record:service(this,required(a.id,'airport ID'),required(a.name,'airport name'),geometrySchema.parse({type:'Point',coordinates:[Number(a.longitude_deg),Number(a.latitude_deg)]}),'airport',{...optional({county:a.region_name}),serviceType:`${a.type}; scheduled_service_reported`},ctx,locator)};}catch(error){yield{quarantineReason:error instanceof Error?error.message:'Malformed airport row',locator};}}},
};
const xmlText=(v:any):string|undefined=>text(v?.['#text'])??text(v);
const naptan: ExtendedAdapter = {
  id:'transport-stops',rawFolder:'nta',sourceId:'nta-naptan',scope:'active-directory-stops',publisher:'National Transport Authority',geography:'Publisher NaPTAN directory including cross-border Northern Ireland stops; jurisdiction unfiltered',observedPeriod:'2026-10-01',license:'CC-BY-4.0',licenseEvidenceUrl:'https://www.transportforireland.ie/transitData/PT_Data.html',attribution:'National Transport Authority, CC BY 4.0; fair-usage policy applies',expectedCount:17161,
  limitations:['Active directory status does not establish current service, frequency, routes, accessibility or operating hours.','NaPTAN includes cross-border stops; no Republic-only jurisdiction filter applied.','Stop classifications retained as source codes; all active modes are transport_stop, not inferred bus-only records. Pending/inactive entries excluded. GTFS schedule remains a separate deferred model.'],selectData:p=>p==='NaPTAN.json',
  *rows(bytes,ctx){const n=JSON.parse(new TextDecoder().decode(bytes)).NaPTAN;const rows=n?.StopPoints?.StopPoint;if(!Array.isArray(rows))throw new Error('Missing NaPTAN stop array');if(n['@FileName']!=='NaPTAN_2026_10_01.xml')throw new Error('Unexpected NaPTAN observation period');for(let index=0;index<rows.length;index++){const a=rows[index],locator=`naptan-stop/${index}`;if(a['@Status']!=='active'){yield{excludedReason:`status_${a['@Status']??'unknown'}`,locator};continue;}try{const location=a.Place?.Location?.Translation;if(location?.GridType!=='ITM')throw new Error('Unexpected NaPTAN grid type');const lon=Number(location.Longitude),lat=Number(location.Latitude);if(!text(location.Longitude)||!text(location.Latitude))throw new Error('Missing explicit NaPTAN WGS84 coordinates');yield {record:service(this,required(a.AtcoCode,'ATCO code'),required(xmlText(a.Descriptor?.CommonName),'stop name'),geometrySchema.parse({type:'Point',coordinates:[lon,lat]}),'transport_stop',{...optional({address:xmlText(a.Descriptor?.Street)}),serviceType:required(a.StopClassification?.StopType,'stop classification')},ctx,locator)};}catch(error){yield{quarantineReason:error instanceof Error?error.message:'Malformed NaPTAN row',locator};}}},
};
export const nationalAdapters: ExtendedAdapter[] = [hospital,gp,school(0,'special_school','special',116),school(1,'primary_school','primary',3147),school(2,'secondary_school','secondary',711),airports,naptan];
