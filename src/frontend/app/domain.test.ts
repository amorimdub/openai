import { expect,test } from 'bun:test';
import { boundaryAnchor,preferences,type Criterion,type Place,type Profile } from './domain';
const place:Place={id:'place',name:'Town',geometry:{type:'Polygon',coordinates:[[[-6.2,53.3],[-6.1,53.3],[-6.1,53.4],[-6.2,53.3]]]},attributes:{geography:{code:'T1',codeSystem:'CSO'}}};
const profile:Profile={bedrooms:3,tenure:'rent',budget:'1800',ages:'3, 8',mode:'public_transport',car:false,radiusKm:10};
const definitions:Criterion[]=[{id:'health.hospital',vertical:'health',category:'hospital',method:'travel_time',label:'health / hospital',defaults:{maximumMinutes:30}},{id:'education.childcare',vertical:'education',category:'childcare',method:'distance',label:'education / childcare',defaults:{}},{id:'budget.rent',vertical:'budget',category:'rent',method:'market_context',label:'budget / rent',defaults:{}}];
test('frontend emits actual API criteria contract without false bedroom or market joins',()=>{
 const p=preferences({longitude:-6.2,latitude:53.3},place,profile,{'health.hospital':{importance:'required',requiredService:'cardiology'},'education.childcare':{importance:'preferred'},'budget.rent':{importance:'preferred'}},definitions);
 expect(p.criteria).toHaveLength(3);expect(p.criteria[0].parameters).toEqual({maximumMinutes:30,mode:'public_transport',requiredService:'cardiology'});expect(p.criteria[1].parameters).toEqual({childAge:3});expect(p.criteria[2].parameters).toEqual({maximumAmountEur:1800});expect(JSON.stringify(p)).not.toContain('bedrooms');expect(JSON.stringify(p)).not.toContain('marketGeography');
});
test('single, seven and all registry choices have no frontend count cap',()=>{for(const count of[1,7,24]){const registry=Array.from({length:count},(_,i)=>({...definitions[0],id:`criterion${i}`}));const choices=Object.fromEntries(registry.map(c=>[c.id,{importance:'preferred' as const}]));expect(preferences(boundaryAnchor(place),place,profile,choices,registry).criteria).toHaveLength(count);}});
