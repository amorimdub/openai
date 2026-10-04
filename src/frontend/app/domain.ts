export type Criterion={id:string;vertical:string;category:string;method:string;label:string;defaults:Record<string,unknown>};
export type Geometry={type:string;coordinates:any};
export type Place={id:string;name:string;geometry:Geometry;attributes:{county?:string;geography:{code:string;codeSystem:string}}};
export type Choice={importance:'preferred'|'required';maximumMinutes?:number;maximumDistanceM?:number;mode?:string;minimumDownloadMbps?:number;requiredService?:string};
export type Profile={bedrooms:number;tenure:'buy'|'rent';budget:string;ages:string;mode:'driving'|'walking'|'cycling'|'public_transport';car:boolean;radiusKm:number};
export function boundaryAnchor(place:Place):{longitude:number;latitude:number}{let coordinates=place.geometry.coordinates;while(Array.isArray(coordinates[0]))coordinates=coordinates[0];return {longitude:coordinates[0],latitude:coordinates[1]};}
export const label=(criterion:Criterion)=>criterion.label.split(' / ').at(-1)!;
export const pillarLabels:Record<string,string>={health:'Health',transportation:'Transportation',quality_of_life:'Quality of life',education:'Education',utilities:'Utilities',budget:'Housing budget',housing:'Housing information'};
export function preferences(origin:{longitude:number;latitude:number},place:Place,profile:Profile,choices:Record<string,Choice>,registry:Criterion[]){
  return {version:1,location:{...origin,placeId:place.id},radiusKm:profile.radiusKm,criteria:Object.entries(choices).map(([id,choice])=>{
    const definition=registry.find(c=>c.id===id)!;const parameters:Record<string,unknown>={};
    if(definition.method==='travel_time'){parameters.maximumMinutes=choice.maximumMinutes??Number(definition.defaults.maximumMinutes??30);parameters.mode=choice.mode??profile.mode;}
    if(definition.method==='distance'&&choice.maximumDistanceM)parameters.maximumDistanceM=choice.maximumDistanceM;
    if(definition.category==='broadband'&&choice.minimumDownloadMbps)parameters.minimumDownloadMbps=choice.minimumDownloadMbps;
    if(id==='education.childcare'){const age=Number(profile.ages.split(',')[0].trim());if(profile.ages.trim()&&Number.isFinite(age)&&age>=0&&age<=18)parameters.childAge=age;}
    if(choice.requiredService?.trim()&&['travel_time','distance'].includes(definition.method))parameters.requiredService=choice.requiredService.trim();
    if(definition.method==='market_context'){if(Number(profile.budget)>0)parameters.maximumAmountEur=Number(profile.budget);}
    // Bedroom preferences belong to a household; selecting an area observation with
    // unknown bedrooms would fabricate a match, so never append bedrooms here.
    return {id,importance:choice.importance,parameters};
  })};
}
export async function api(path:string,body?:unknown,signal?:AbortSignal){const response=await fetch(`/api${path}`,{signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.message??`Data service returned ${response.status}. Please retry.`);}return response.json();}
