import { commonRecordId, type CommonRecord } from '../schema';
import type { AdapterRow, ExtendedAdapter } from './types';

type Cube = { id:string[]; size:number[]; value:(number|null)[]; dimension:Record<string,any>; status?:Record<string,string>|string[] };
type MarketSpec = {table:string; ids:string[]; geography:string; tenure:'rent'|'buy'; mean:string; median?:string; selection:Record<string,string>; definition:string};
const specs:MarketSpec[] = [
  {table:'RIQ02',ids:['STATISTIC','TLIST(Q1)','C02970V03592','C02969V03591','C03004V03625'],geography:'C03004V03625',tenure:'rent',mean:'RIQ02',selection:{},definition:'Published RTB average monthly rent for the original location, bedroom and property-type category and quarter. This is historical registered-tenancy market context, not advertised rent or the standardised rent index. No invented town or polygon join.'},
  {table:'HPM02',ids:['STATISTIC','TLIST(M1)','C02339V02812','C03346V04033','C03341V04028','C03344V04031','C03342V04029'],geography:'C02339V02812',tenure:'buy',mean:'HPM02C03',median:'HPM02C04',selection:{C03346V04033:'-',C03341V04028:'02',C03344V04031:'01',C03342V04029:'01'},definition:'CSO monthly household-buyer market-sale residential dwelling purchases, executions, all dwelling statuses. Published mean/median retained directly; matching published Volume of Sales supplies sampleSize. No dwelling type or bedroom classification.'},
  {table:'HPM07',ids:['STATISTIC','TLIST(M1)','C03346V04033','C03341V04028','C03348V04035','C03344V04031'],geography:'C03348V04035',tenure:'buy',mean:'HPM07C01',median:'HPM07C02',selection:{C03346V04033:'-',C03341V04028:'02',C03344V04031:'-'},definition:'CSO published moving 12-month mean/median market-based household purchases, executions, all dwelling statuses and buyer types, original RPPI region. Period is the window end month. Published rolling statistic is not an average of monthly statistics.'},
  {table:'HPM08',ids:['STATISTIC','TLIST(M1)','C03346V04033','C03349V04063','C03341V04028','C03344V04031'],geography:'C03349V04063',tenure:'buy',mean:'HPM08C01',median:'HPM08C02',selection:{C03346V04033:'-',C03341V04028:'02',C03344V04031:'-'},definition:'CSO published moving 12-month mean/median market-based household purchases, executions, all dwelling statuses and buyer types, original Eircode output region. Period is the window end month. Eircode output regions are not exact property addresses or town boundaries.'},
];
function orderedCodes(d:any):string[] {
  const index=d?.category?.index;
  if(Array.isArray(index)) {if(index.some(v=>typeof v!=='string') || new Set(index).size!==index.length)throw new Error('Invalid JSON-stat category index');return index;}
  if(index && typeof index==='object') {const entries=Object.entries(index).sort((a,b)=>Number(a[1])-Number(b[1]));if(entries.some(([,position],i)=>position!==i))throw new Error('Non-contiguous JSON-stat index');return entries.map(([code])=>code);}
  throw new Error('Missing JSON-stat category index');
}
function label(cube:Cube,id:string,code:string):string {const value=cube.dimension[id]?.category?.label?.[code];if(typeof value!=='string'||!value.trim())throw new Error(`Missing label ${id}/${code}`);return value;}
function adapterFor(spec:MarketSpec):ExtendedAdapter {
  const id=spec.table==='RIQ02'?'rtb-rent':`purchase-${spec.table.toLowerCase()}`;
  const sourceId=spec.table==='RIQ02'?'rtb-riq02':`cso-${spec.table.toLowerCase()}`;
  const scope=spec.table==='RIQ02'?'original-locations-all-published-quarterly-categories':spec.table==='HPM02'?'monthly-market-household-executions-all-statuses':'rolling-12-month-executions-all-statuses-all-buyers';
  return {id,rawFolder:spec.table==='RIQ02'?'rtb-cso':'cso-sales',sourceId,scope,publisher:spec.table==='RIQ02'?'Residential Tenancies Board; hosted by Central Statistics Office':'Central Statistics Office',geography:`Republic of Ireland; original ${spec.table} ${spec.geography} codes; no spatial join`,observedPeriod:spec.table==='RIQ02'?'2007Q4/2025Q4':spec.table==='HPM02'?'2010-01/2026-07':'2010-12/2026-07',license:'CC-BY-4.0',licenseEvidenceUrl:spec.table==='RIQ02'?'https://data.gov.ie/api/3/action/package_show?id=riq02-rtb-average-monthly-rent-report':'https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/',attribution:spec.table==='RIQ02'?'Residential Tenancies Board, CSO PxStat RIQ02; CC BY 4.0':'Central Statistics Office; CC BY 4.0',limitations:[spec.definition,'Missing source cells are explicitly excluded as source_missing_no_published_observation; absence is unknown, never zero. Raw cube remains complete.','Other buyer/status/event/sale breakdowns are explicitly excluded from the selected purchase scope.','Published amounts do not imply available homes, rental availability, mortgage eligibility or affordability.'],selectData:path=>path===`${spec.table}.json`,rows(bytes,ctx){return normalizeMarketCube(JSON.parse(new TextDecoder().decode(bytes)),spec,{...ctx,sourceId,scope});}};
}
export const marketAdapters:ExtendedAdapter[] = specs.map(adapterFor);

export function* normalizeMarketCube(cube:Cube,spec:MarketSpec,ctx:{path:string;snapshotId:string;sourceId:string;scope:string}):Generator<AdapterRow> {
  if(JSON.stringify(cube.id)!==JSON.stringify(spec.ids))throw new Error(`Unexpected ${spec.table} dimension order`);
  const codes=cube.id.map(id=>orderedCodes(cube.dimension[id]));
  if(!Array.isArray(cube.size)||cube.size.length!==cube.id.length||cube.size.some((n,i)=>!Number.isInteger(n)||n<1||n!==codes[i].length))throw new Error('JSON-stat cardinality mismatch');
  const count=cube.size.reduce((a,b)=>a*b,1),stride=cube.size.map((_,i)=>cube.size.slice(i+1).reduce((a,b)=>a*b,1));
  if(!Array.isArray(cube.value)||cube.value.length!==count)throw new Error('JSON-stat value count mismatch');
  const statIndex=cube.id.indexOf('STATISTIC'),volumeIndex=spec.table==='HPM02'?codes[statIndex].indexOf('HPM02C01'):-1;
  if(spec.table==='HPM02'&&volumeIndex<0)throw new Error('HPM02 Volume of Sales statistic missing');
  if(!codes[statIndex].includes(spec.mean)||(spec.median&&!codes[statIndex].includes(spec.median)))throw new Error('Expected monetary statistic missing');
  for(let index=0;index<count;index++) {
    const locator=`value/${index}`;
    const positions=cube.size.map((size,i)=>Math.floor(index/stride[i])%size);
    const values=positions.map((p,i)=>codes[i][p]);
    const dims=Object.fromEntries(cube.id.map((id,i)=>[id,values[i]]));
    const selection=Object.entries(spec.selection).find(([id,value])=>dims[id]!==value);
    if(selection){yield {excludedReason:`outside_selected_scope:${selection[0]}`,locator};continue;}
    const statistic=dims.STATISTIC;
    if(statistic!==spec.mean&&statistic!==spec.median){yield {excludedReason:statistic==='HPM02C01'?'volume_used_as_sample_size_only':'value_of_sales_not_price',locator};continue;}
    const sourceValue=cube.value[index];
    if(sourceValue!==null&&(typeof sourceValue!=='number'||!Number.isFinite(sourceValue)||sourceValue<0)){yield {quarantineReason:'Invalid nonnegative monetary source value',locator};continue;}
    const flag=Array.isArray(cube.status)?cube.status[index]:cube.status?.[String(index)];
    if(flag&&!['c','s',':','..'].includes(flag)){yield {quarantineReason:`Unsupported JSON-stat observation status ${flag}`,locator};continue;}
    if(sourceValue===null&&!flag){yield {excludedReason:'source_missing_no_published_observation',locator};continue;}
    const unit=cube.dimension.STATISTIC.category.unit?.[statistic]?.label;
    if(unit!=='Euro')throw new Error(`${spec.table} monetary unit is not Euro`);
    const timeId=spec.tenure==='rent'?'TLIST(Q1)':'TLIST(M1)',time=dims[timeId];
    if(!(spec.tenure==='rent'?/^\d{4}[1-4]$/:/^\d{4}(0[1-9]|1[0-2])$/).test(time))throw new Error('Unexpected market period');
    const period=spec.tenure==='rent'?`${time.slice(0,4)}Q${time[4]}`:`${time.slice(0,4)}-${time.slice(4,6)}`;
    const dimensions:Record<string,string>={table:spec.table};
    for(const id of cube.id){dimensions[id]=dims[id];dimensions[`${id}:label`]=label(cube,id,dims[id]);}
    if(flag)dimensions['JSON-stat:status']=flag;
    const bedroom=spec.tenure==='rent'?dims.C02970V03592:null,property=spec.tenure==='rent'?dims.C02969V03591:'-';
    if(spec.tenure==='rent'&&(!['-','01','02','03','06','07','08'].includes(bedroom!)||!['-','01','02','03','04','05'].includes(property)))throw new Error('Unknown RIQ02 bedroom/property classification');
    const geo=dims[spec.geography],name=label(cube,spec.geography,geo),externalId=values.join('|');
    let sampleSize:number|null=null;
    if(volumeIndex>=0){sampleSize=cube.value[index+(volumeIndex-positions[statIndex])*stride[statIndex]];if(sampleSize!==null&&(!Number.isInteger(sampleSize)||sampleSize<0))throw new Error('Invalid matching volume sample size');}
    const observationStatus=flag?'suppressed':sourceValue===0?'source_zero_unverified':sourceValue===null?'missing':'reported';
    const record:CommonRecord={version:2,id:commonRecordId(ctx.sourceId,ctx.scope,externalId),externalId,sourceId:ctx.sourceId,scope:ctx.scope,snapshotId:ctx.snapshotId,name:`${name}: ${label(cube,'STATISTIC',statistic)} ${period}`,raw:{path:ctx.path,locator},observedPeriod:period,kind:'market_context',category:spec.tenure,geometry:null,locationStatus:'unlocated',geometryMeaning:'nonspatial_observation',attributes:{geography:{code:geo,codeSystem:`CSO_${spec.table}_${spec.geography}`,type:geo==='-'?'country':spec.table==='HPM08'?'eircode_output_region':spec.table==='HPM02'?'county':'market_region',name,vintage:null},tenure:spec.tenure,statistic:statistic===spec.mean?'mean':'median',amountEur:observationStatus==='reported'?sourceValue:null,unit:spec.tenure==='rent'?'EUR/month':'EUR',period,propertyType:property==='-'?'all':['01','02','03'].includes(property)?'house':property==='04'?'apartment':'unknown',propertyTypeLabel:spec.tenure==='rent'?label(cube,'C02969V03591',property):'All dwelling types',bedroomClass:bedroom,bedrooms:bedroom&&['01','02','03'].includes(bedroom)?Number(bedroom):null,sampleSize,observationStatus,sourceValue,definition:spec.definition,dimensions}};
    yield {record};
  }
}
