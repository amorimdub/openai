import {expect, test} from 'bun:test';
import {preferences, type Place, type Criterion} from './domain';
import {freshDraft, questions, questionError, profileFromDraft, saveProfile, readProfile, profileStorageKey, type Draft} from './onboarding-model';
const place:Place={id:'town',name:'Test town',geometry:{type:'Polygon',coordinates:[[[-6,53],[-6,54],[-5,53],[-6,53]]]},attributes:{geography:{code:'T1',codeSystem:'CSO'}}};
function complete():Draft{return {...freshDraft(),scope:'anywhere',people:[{age:35},{age:3},{age:null}],bedrooms:3,mode:'public_transport',car:false,budgets:{rent:'1800',buy:'350000'}};}
function memoryStorage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
test('each household member has an age question and only specific scope asks for a town',()=>{
 const d=complete();expect(questions(d)).toEqual(['scope','people','age.0','age.1','age.2','bedrooms','tenure','budget','transport','car','save']);
 d.scope='specific';expect(questions(d)[1]).toBe('place');d.people=d.people.slice(0,1);expect(questions(d)).not.toContain('age.1');
});
test('driving skips the separate car question; switching modes asks it again',()=>{
 const d=complete();d.mode='driving';d.car=true;expect(questions(d)).not.toContain('car');expect(profileFromDraft(d).car).toBe(true);
 d.mode='walking';d.car=null;expect(questions(d)).toContain('car');expect(questionError('car',d)).toBeTruthy();
});
test('required answers validate while ages and budgets can be skipped, including age zero',()=>{
 const d=freshDraft();for(const q of ['scope','place','bedrooms','transport','car'] as const)expect(questionError(q,d)).toBeTruthy();
 expect(questionError('age.0',d)).toBe('');expect(questionError('budget',d)).toBe('');
 for(const age of [-1,121,2.5,NaN]){d.people[0].age=age;expect(questionError('age.0',d)).toBeTruthy();}
 d.people[0].age=0;expect(questionError('age.0',d)).toBe('');
 for(const budget of ['0','-50','Infinity','invalid']){d.budgets.rent=budget;expect(questionError('budget',d)).toBeTruthy();}
});
test('save restores household and search defaults; draft edits never mutate the saved snapshot',()=>{
 const storage=memoryStorage(),d=complete();d.scope='specific';d.place=place;const saved=saveProfile(d,storage);
 d.people[0].age=70;d.budgets.rent='2500';expect(saved.profile.people?.[0].age).toBe(35);expect(saved.draft.budgets.rent).toBe('1800');
 const restored=readProfile(storage)!;expect(restored).toEqual(saved);expect(restored.profile.ages).toBe('3');expect(restored.draft.budgets.buy).toBe('350000');
 expect(storage.getItem(profileStorageKey)).not.toContain('criteria');
});
test('invalid or failed saves do not replace the previous profile',()=>{
 const storage=memoryStorage();saveProfile(complete(),storage);const before=storage.getItem(profileStorageKey);
 expect(()=>saveProfile(freshDraft(),storage)).toThrow();expect(storage.getItem(profileStorageKey)).toBe(before);
 expect(()=>saveProfile(complete(),{setItem:()=>{throw new Error('Storage blocked');}})).toThrow('Storage blocked');
});
test('damaged, unsupported and incomplete stored bundles start fresh',()=>{
 for(const data of ['{','null',JSON.stringify({version:2}),JSON.stringify({version:1,draft:{...complete(),people:[null]}}),JSON.stringify({version:1,draft:{...complete(),bedrooms:0}}),JSON.stringify({version:1,draft:{...complete(),scope:'specific',place:null}})]){
  expect(readProfile({getItem:()=>data})).toBeNull();
 }
 expect(readProfile({getItem:()=>{throw new Error('Storage blocked');}})).toBeNull();
});
test('transport and every age survive persistence, while child-age API parameters use a child rather than the first adult',()=>{
 const d=complete();const p=profileFromDraft(d);
 const registry:Criterion[]=[{id:'education.childcare',vertical:'education',category:'childcare',method:'distance',label:'Childcare',defaults:{}}];
 expect(preferences({longitude:-6,latitude:53},place,p,{'education.childcare':{importance:'preferred'}},registry).criteria[0].parameters).toEqual({childAge:3});
 p.people=[{age:35},{age:0}];expect(preferences({longitude:-6,latitude:53},place,p,{'education.childcare':{importance:'preferred'}},registry).criteria[0].parameters).toEqual({childAge:0});
 p.people=[{age:35},{age:null}];expect(preferences({longitude:-6,latitude:53},place,p,{'education.childcare':{importance:'preferred'}},registry).criteria[0].parameters).toEqual({});
});

test('mixed transport is retained locally and never sent as an unsupported API journey mode',()=>{
 const d=complete();d.mode='mixed';const storage=memoryStorage();saveProfile(d,storage);expect(readProfile(storage)?.profile.mode).toBe('mixed');
 const registry:Criterion[]=[{id:'health.hospital',vertical:'health',category:'hospital',method:'travel_time',label:'Hospital',defaults:{}}];
 const result=preferences({longitude:-6,latitude:53},place,profileFromDraft(d),{'health.hospital':{importance:'preferred'}},registry);
 expect(result.criteria[0].parameters).toEqual({maximumMinutes:30});
});
