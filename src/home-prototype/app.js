// Throwaway: quiet profile setup, dynamic criteria, then explainable region results.
const app = document.querySelector('#app');
const domains = [
  { id: 'health', name: 'Health', symbol: '✚', color: '#be7566', question: 'What care would you like nearby?', hint: 'Choose the services that matter to your household.', options: [['hospital','Hospital access'],['gp','GP access']] },
  { id: 'transportation', name: 'Transportation', symbol: '↗', color: '#688eac', question: 'Which connections matter to you?', hint: 'Think about the journeys you make regularly.', options: [['public_transport','Public transport'],['car_access','Road access'],['cycling','Cycling routes'],['airport','Airport access']] },
  { id: 'quality_of_life', name: 'Quality of life', symbol: '❋', color: '#6a9162', question: 'What makes a place feel like home?', hint: 'Choose the places and activities you enjoy.', options: [['parks','Parks'],['green_areas','Green spaces'],['clubs','GAA clubs'],['activities','Activities'],['community_centres','Community centres'],['shops','Shops']] },
  { id: 'education', name: 'Education', symbol: '◇', color: '#b49451', question: 'Which education needs should we consider?', hint: 'Choose what applies now or in the future.', options: [['childcare','Childcare'],['primary_school','Primary schools'],['secondary_school','Secondary schools']] },
  { id: 'utilities', name: 'Utilities', symbol: 'ϟ', color: '#997dab', question: 'Which everyday services matter?', hint: 'Choose the connections and services your home should have.', options: [['broadband','Broadband'],['mains_water','Public mains water'],['group_water_scheme','Group water scheme'],['electricity','Electricity'],['street_lighting','Street lighting']] },
];
const modes = [['public_transport','Public transport'],['driving','Car'],['cycling','Cycling'],['walking','Walking'],['mixed','A mix']];
let state = fresh();
let current = 'scope';
let answered = new Set();
let showFilters = false;
let showState = false;
let exploring = false;
let profileSaved = false;
let savedProfile = null;
let showCart = false;
let filterOpen = new Set(['health','education']);
const storageKey = 'find-your-place.prototype.profile.v1';
let error = '';
let resumeAfterPlace = null;
let geography;
let areaLayer;
let townLayer;
let activePlace;
let heatLayer;
let homeLayer;
let selectedHome = null;
let selectedRegion = new URLSearchParams(location.search).get('region');
let resultView = 'services';
let selectedPillar = new URLSearchParams(location.search).get('pillar');
let selectedCriterion = new URLSearchParams(location.search).get('criterion');
let detailMap = null;
let transitDisplay = 'bus';
function fresh() { return { scope: null, placeId: null, location: '', people: [{age:null}], bedrooms: null, tenure:'rent', budgets:{rent:null,buy:null}, mainTransport:null, carAvailable:null, verticals:[], criteria:{},access:{} }; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
const pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const cartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 3h2l3 12h11l2-8H6M9 20h1m7 0h1"/></svg>';
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
try {
  const bundle=JSON.parse(localStorage.getItem(storageKey));
  if(bundle?.version===1&&bundle.profile?.people?.length){savedProfile=bundle.profile;state={...fresh(),...bundle.defaults,...structuredClone(savedProfile)};profileSaved=true;current='done';exploring=true;answered=new Set(sequence().filter(k=>k!=='done'&&k!=='save'));}
} catch {}
// A shareable fictional scenario; it never writes or replaces a saved profile.
const demoType = new URLSearchParams(location.search).get('demo');
const demoScenario = ['drogheda','regions','services','dashboard','access'].includes(demoType);
if (demoScenario) { state={...fresh(),scope:'specific',placeId:'cso-urban-areas-2022:828',location:'Drogheda',people:[{age:35},{age:7}],bedrooms:3,mainTransport:'driving',carAvailable:true,criteria:{'education.primary_school':'preferred'},verticals:['education']};savedProfile={people:structuredClone(state.people),mainTransport:state.mainTransport,carAvailable:true};profileSaved=true;current='done';exploring=true; }
if(['regions','services','dashboard','access'].includes(demoType)){state.scope='anywhere';state.placeId=null;state.location='';state.criteria={};state.verticals=[];}
if(demoType==='dashboard')state.criteria={'health.hospital':'preferred','transportation.public_transport':'preferred','quality_of_life.parks':'preferred','education.primary_school':'preferred','utilities.broadband':'preferred'};
if(demoType==='access')state.criteria=Object.fromEntries(['health.hospital','health.gp','transportation.public_transport','transportation.cycling','transportation.airport','quality_of_life.parks','quality_of_life.green_areas','quality_of_life.clubs','quality_of_life.community_centres','education.childcare','education.primary_school','education.secondary_school','utilities.broadband','utilities.mains_water'].map(key=>[key,'preferred']));
if(demoScenario&&demoType!=='services')resultView='dashboard';
app.innerHTML = `<div id="map" aria-label="Interactive map of Ireland"></div><header class="map-header"><a class="brand" href="/prototype/home">${pin}<span>Find your place<small>IRELAND</small></span></a><div class="header-actions"><button id="filter-toggle" data-action="filter-toggle">Criteria <span id="filter-count">0</span></button><button id="cart-toggle" data-action="cart" class="cart-toggle">${cartIcon}<span>Your profile</span><small id="cart-badge">0</small></button>${window.PROTOTYPE_REVIEW ? '<button data-action="inspect" class="prototype-label">Prototype state</button>' : ''}<button data-action="reset">Start again</button></div></header><div id="map-caption" class="map-caption" aria-live="polite"></div><aside id="filters" class="filters" aria-label="Editable search filters"></aside><section id="prompt" class="prompt" aria-label="Current question" aria-live="polite"></section><main id="dashboard" class="dashboard" aria-label="Region results dashboard" hidden></main><aside id="homes" class="homes-panel" aria-label="Homes in the selected region" hidden></aside><section id="fit-legend" class="fit-legend" aria-label="Illustrative service fit scale" hidden></section><aside id="cart" class="profile-cart" aria-label="Household profile and selected criteria" hidden></aside><aside id="state-drawer" class="state-drawer" hidden><div><strong>Prototype state</strong><button data-action="inspect" aria-label="Close prototype state">×</button></div><p>Local, in-memory answers. Illustrative service scores and fictional homes only. No live home search.</p><pre id="state-json"></pre></aside><div id="map-source" class="map-source">CSO / Tailte Éireann 2022 urban areas · Natural Earth outline</div><datalist id="towns"></datalist>`;
const map = L.map('map', {zoomControl:false, minZoom:6, maxZoom:18, zoomSnap:.5, preferCanvas:true,maxBounds:[[50.5,-11.5],[56,-5]],maxBoundsViscosity:1}).setView([53.25,-8],7);
L.control.zoom({position:'topright'}).addTo(map);
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'});
function revealMap(){if(resultView!=='map'){document.body.classList.remove('map-ready');return;}if(!map.hasLayer(tiles))tiles.addTo(map);document.body.classList.add('map-ready');document.querySelector('#map').setAttribute('aria-hidden','false');requestAnimationFrame(focusMap);}
let tileErrors = 0;
tiles.on('tileerror', () => { if (++tileErrors > 3) document.querySelector('#map-source').textContent = 'Base tiles unavailable · local CSO town outlines remain visible'; });
const irelandBounds = [[51.35,-10.8],[55.45,-5.9]];
map.createPane('country-mask');map.getPane('country-mask').style.zIndex='450';map.getPane('country-mask').style.pointerEvents='none';
async function maskIreland(){const country=await(await fetch('/prototype/home/ireland.geojson')).json();const polygons=country.geometry.type==='MultiPolygon'?country.geometry.coordinates:[country.geometry.coordinates];const outside={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]],...polygons.map(p=>p[0])]}};L.geoJSON(outside,{pane:'country-mask',interactive:false,style:{color:'#edf2e8',weight:0,fillColor:'#edf2e8',fillOpacity:1,fillRule:'evenodd'}}).addTo(map);L.geoJSON(country,{pane:'country-mask',interactive:false,style:{color:'#aebaab',weight:1,fill:false}}).addTo(map);}
function shortName(name) { return name.replace(/ city and suburbs$/i,''); }
function findPlace(value) { const query = value.trim().toLowerCase(); return geography?.features.find(f => f.properties.name.toLowerCase() === query || shortName(f.properties.name).toLowerCase() === query); }
function promptHeight() { return document.querySelector('#prompt').hidden ? 0 : document.querySelector('#prompt').offsetHeight || 260; }
function focusMap() {
  if(!profileSaved||resultView!=='map')return;
  map.invalidateSize();
  const narrow = window.innerWidth < 720;
  const paddingTopLeft = [narrow ? 25 : (profileSaved ? 310 : 65), 110];
  const paddingBottomRight = [narrow ? 25 : 375, narrow ? 300 : 95];
  if (areaLayer) map.fitBounds(areaLayer.getBounds(), {paddingTopLeft,paddingBottomRight,maxZoom:12,animate:true,duration:.6});
  else map.fitBounds(irelandBounds, {paddingTopLeft,paddingBottomRight,animate:true,duration:.6});
}
function updateMap(shouldFocus = false) {
  if (areaLayer) { areaLayer.remove(); areaLayer = null; }
  const color = '#35664f';
  activePlace = selectedRegion ? geography?.features.find(f=>f.properties.id===selectedRegion) : state.scope === 'specific' ? geography?.features.find(f => f.properties.id === state.placeId) : null;
  if (activePlace) areaLayer = L.geoJSON(activePlace, {style:{color,weight:2.5,fillColor:color,fillOpacity:.13}}).addTo(map);
  if (townLayer) townLayer.setStyle({color,weight:.7,opacity:state.scope === 'specific' ? .18 : .5,fillOpacity:state.scope === 'specific' ? .015 : .045});
  document.querySelector('#map-caption').innerHTML = `<span class="area-dot" style="background:${color}"></span><div><strong>${state.scope === 'anywhere' ? 'Open to anywhere in Ireland' : activePlace ? esc(shortName(activePlace.properties.name)) : 'Where could life take you?'}</strong><small>${activePlace ? 'Selected region' : 'Explore the Republic of Ireland'}</small></div>${state.scope ? '<button data-action="focus-map" aria-label="Return to search area">⌖</button>' : ''}`;
  renderRegion();
  if (shouldFocus) requestAnimationFrame(focusMap);
}
// Deliberately synthetic spatial fixtures: these are interaction examples, not research scores.
const greens = ['#edf6e7','#d5ebc3','#aed795','#7cbe75','#49975a','#24713f','#125332'];
function demoScore(x,y) {
  const chosen=Object.entries(state.criteria);
  if(!chosen.length)return null;
  let sum=0,weights=0;
  for(const [key,importance] of chosen){
    let seed=0;for(const c of key)seed=(seed*31+c.charCodeAt(0))>>>0;
    const cx=(seed%79)/100+.1,cy=((seed>>>8)%79)/100+.1;
    const wave=Math.sin(x*5+(seed%17))*Math.cos(y*4+(seed%13));
    const value=Math.max(12,Math.min(98,98-Math.hypot(x-cx,y-cy)*83+wave*12));
    const weight=importance==='required'?2:1;sum+=value*weight;weights+=weight;
  }
  return Math.round(sum/weights);
}
function green(score){return greens[Math.min(6,Math.floor((score??0)*7/101))];}
function regionFrame(){
  const bounds=L.geoJSON(activePlace).getBounds();
  return {west:bounds.getWest(),east:bounds.getEast(),south:bounds.getSouth(),north:bounds.getNorth(),bounds};
}
function insideRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
function regionPolygons(){return activePlace.geometry.type==='MultiPolygon'?activePlace.geometry.coordinates:[activePlace.geometry.coordinates];}
function demoHomes(){
  if(!activePlace||shortName(activePlace.properties.name)!=='Drogheda')return [];
  const f=regionFrame(),polys=regionPolygons(),points=[];
  for(let y=.08;y<1;y+=.065)for(let x=.08;x<1;x+=.065){const lng=f.west+x*(f.east-f.west),lat=f.north-y*(f.north-f.south);if(polys.some(p=>insideRing(lng,lat,p[0])&&!p.slice(1).some(r=>insideRing(lng,lat,r))))points.push({x,y,latlng:[lat,lng]});}
  const anchors=[[.3,.25],[.6,.3],[.45,.5],[.75,.55],[.25,.7],[.6,.75]];
  const types=['Apartment','Terraced home','Semi-detached home','Detached home','Townhouse','Detached home'];
  return anchors.map(([x,y],i)=>{const point=points.reduce((a,b)=>Math.hypot(b.x-x,b.y-y)<Math.hypot(a.x-x,a.y-y)?b:a);return {...point,id:String(i+1),name:`Demo home ${String(i+1).padStart(2,'0')}`,type:types[i],beds:[2,3,3,4,4,5][i],rent:[1650,1800,1950,2100,2300,2450][i],buy:[260000,295000,325000,380000,420000,465000][i],score:demoScore(point.x,point.y)};});
}
function renderRegion(){
  if(heatLayer){heatLayer.remove();heatLayer=null;}if(homeLayer){homeLayer.remove();homeLayer=null;}
  const panel=document.querySelector('#homes'),legend=document.querySelector('#fit-legend');
  panel.hidden=!profileSaved||resultView!=='map';legend.hidden=panel.hidden;
  if(panel.hidden)return;
  const isDrogheda=activePlace&&shortName(activePlace.properties.name)==='Drogheda';
  const chosen=Object.keys(state.criteria),f=isDrogheda?regionFrame():null;
  if(isDrogheda&&chosen.length){
    const project=([lng,lat])=>`${((lng-f.west)/(f.east-f.west)*1000).toFixed(2)},${((f.north-lat)/(f.north-f.south)*1000).toFixed(2)}`;
    const path=regionPolygons().map(p=>p.map(r=>'M'+r.map(project).join('L')+'Z').join('')).join('');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','Illustrative green service fit overlay');
    let cells='';for(let y=0;y<24;y++)for(let x=0;x<24;x++)cells+=`<rect x="${x*1000/24}" y="${y*1000/24}" width="${1000/24+.5}" height="${1000/24+.5}" fill="${green(demoScore((x+.5)/24,(y+.5)/24))}"/>`;
    svg.innerHTML=`<defs><clipPath id="region-clip"><path d="${path}" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#region-clip)">${cells}</g>`;
    heatLayer=L.svgOverlay(svg,f.bounds,{opacity:.66,interactive:false}).addTo(map);
  }
  const homes=demoHomes().filter(h=>h.beds>=(state.bedrooms||1)&&(!state.budgets[state.tenure]||h[state.tenure]<=state.budgets[state.tenure])).sort((a,b)=>(b.score??0)-(a.score??0));
  homeLayer=L.layerGroup().addTo(map);
  for(const h of homes){const marker=L.marker(h.latlng,{icon:L.divIcon({className:`home-pin ${h.id===selectedHome?'active':''}`,html:`<span>${h.id}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(homeLayer);marker.bindTooltip(`${h.name} · fictional listing`);marker.on('click',()=>{selectedHome=h.id;renderRegion();});}
  panel.innerHTML=`<div class="homes-heading"><span><h2>${activePlace?'Homes in '+esc(shortName(activePlace.properties.name)):'Homes in your region'}</h2><small>${homes.length} examples · demo listings, not live</small></span><span class="homes-count">${homes.length}</span></div>${isDrogheda?homes.length?`<div class="home-list">${homes.map(h=>`<button class="home-card ${selectedHome===h.id?'selected':''}" data-action="home" data-value="${h.id}" aria-pressed="${selectedHome===h.id}"><span class="home-number">${h.id}</span><span class="home-info"><strong>€${h[state.tenure].toLocaleString('en-IE')}${state.tenure==='rent'?'<small> / month</small>':''}</strong><span>${h.beds} beds · ${h.type}</span><small>${h.name}</small></span>${h.score!==null?`<span class="fit-score" style="background:${green(h.score)}" data-score="${h.score}">${h.score}<small>demo fit</small></span>`:''}</button>`).join('')}</div>`:'<p class="homes-empty">No demo homes match these bedroom and budget choices.</p>':'<p class="homes-empty">Choose Drogheda to explore the demo homes and service shading.</p>'}`;
  legend.innerHTML=`<div class="legend-title"><strong>Service fit</strong><span>Illustrative · ${chosen.length} ${chosen.length===1?'service':'services'}</span></div><div class="green-scale"></div><div class="legend-labels"><span>Lower</span><span>Higher</span></div>${!chosen.length?'<p>Select a service to shade the region.</p>':!isDrogheda?'<p>The spatial demo is available for Drogheda.</p>':''}`;
}
// Thirty real region names with fictional, complete service evidence for UI exploration.
const demoRegionNames=['Drogheda','Dundalk','Navan','Dublin','Cork','Galway','Limerick','Waterford','Kilkenny','Sligo','Ennis','Tralee','Wexford','Carlow','Athlone','Mullingar','Tullamore','Portlaoise','Naas','Newbridge','Bray','Wicklow','Arklow','Greystones','Letterkenny','Clonmel','Cavan','Longford','Ballina','Castlebar'];
function fixtureSeed(region,key){let seed=0;for(const c of region.properties.id+':'+key)seed=(seed*31+c.charCodeAt(0))>>>0;return seed;}
function accessRule(key){
  const type=key.split('.')[1],saved=state.access?.[key]||{};
  if(type==='hospital')return {kind:'time',mode:saved.mode||'car',limit:saved.limit||60};
  if(type==='broadband')return {kind:'speed',limit:saved.limit||100};
  if(type==='airport')return {kind:'distance'};
  if(['cycling','mains_water','group_water_scheme','electricity','street_lighting','car_access'].includes(type))return {kind:'presence'};
  return {kind:'time',mode:saved.mode||'walk',limit:saved.limit||15};
}
function ruleLabel(key){const rule=accessRule(key);return rule.kind==='time'?`Within ${rule.limit} min · ${rule.mode==='car'?'car':'walk'}`:rule.kind==='speed'?`${rule.limit}+ Mbps`:rule.kind==='distance'?'Nearest airport':'Available in the area';}
function accessControl(key){const rule=accessRule(key),label=criterionName(key);if(rule.kind==='time')return `<label class="access-control"><span>${rule.mode==='car'?'By car':'On foot'}</span><select data-access="${key}" aria-label="Maximum access time for ${label}">${[15,30,60].map(n=>`<option value="${n}" ${rule.limit===n?'selected':''}>${n===60?'1 hour':n+' minutes'}</option>`).join('')}</select></label>`;if(rule.kind==='speed')return `<label class="access-control"><span>Minimum speed</span><select data-access="${key}" aria-label="Minimum broadband speed">${[100,500,1000].map(n=>`<option value="${n}" ${rule.limit===n?'selected':''}>${n} Mbps</option>`).join('')}</select></label>`;return `<small class="access-note">${ruleLabel(key)}</small>`;}
function demoCriterion(region,key,importance){
  const seed=fixtureSeed(region,key),base=20+seed%81,rule=accessRule(key),type=key.split('.')[1];
  const minutes=type==='hospital'?12+seed%70:3+seed%58;
  const mbps=[100,250,500,1000][seed%4],km=Math.round((10+seed%85)*10)/10;
  const present=base>=42;
  let value,matched;
  if(rule.kind==='time'){matched=minutes<=rule.limit;value=Math.max(0,Math.round(100-minutes/rule.limit*40));}
  else if(rule.kind==='speed'){matched=mbps>=rule.limit;value=Math.min(100,Math.round(mbps/rule.limit*80));}
  else if(rule.kind==='distance'){matched=true;value=Math.max(10,100-Math.round(km));}
  else{matched=present;value=present?100:0;}
  return {key,importance,value,matched,minutes,mbps,km,present,seed,rule};
}
function regionResult(region){
  const criteria=Object.entries(state.criteria).map(([key,importance])=>demoCriterion(region,key,importance));
  const required=criteria.filter(c=>c.importance==='required'),preferred=criteria.filter(c=>c.importance==='preferred');
  const weight=c=>c.importance==='required'?2:1;
  const score=criteria.length?Math.round(criteria.reduce((n,c)=>n+c.value*weight(c),0)/criteria.reduce((n,c)=>n+weight(c),0)):null;
  const pillars=domains.map(d=>{const items=criteria.filter(c=>c.key.startsWith(d.id+'.'));return {...d,items,score:items.length?Math.round(items.reduce((n,c)=>n+c.value*weight(c),0)/items.reduce((n,c)=>n+weight(c),0)):null};});
  return {region,criteria,required,preferred,pillars,eligible:required.every(c=>c.matched),matched:criteria.filter(c=>c.matched),score};
}
function resultRegions(){
  if(!geography)return [];
  const candidates=state.scope==='specific'?geography.features.filter(f=>f.properties.id===state.placeId):demoRegionNames.map(name=>name==='Ballina'?geography.features.find(f=>f.properties.name==='Ballina'&&f.properties.county==='Mayo'):findPlace(name)||geography.features.find(f=>f.properties.name.startsWith(name+'-')||f.properties.name.startsWith(name+' '))).filter(Boolean);
  return candidates.map(regionResult).filter(r=>r.eligible).sort((a,b)=>(b.score??0)-(a.score??0));
}
function criterionChips(){return Object.entries(state.criteria).map(([key,importance])=>`<button class="criteria-chip" data-action="remove-criterion" data-value="${key}" aria-label="Remove ${criterionName(key)}">${criterionName(key)} <small>${importance==='required'?'Required':'Preferred'} · ${ruleLabel(key)}</small><span aria-hidden="true">×</span></button>`).join('');}
function serviceSelection(){
  const n=Object.keys(state.criteria).length;
  return `<div class="service-intro"><h1>What matters to you?</h1><p>Pick your services, access times and essentials.</p></div><div class="service-grid">${domains.map(d=>`<section class="service-pillar"><div class="service-pillar-heading"><span>${d.symbol}</span><h2>${d.name}</h2></div>${d.options.map(([id,label])=>{const key=d.id+'.'+id;return `<div class="service-option ${state.criteria[key]?'picked':''}"><label><input type="checkbox" data-criterion="${key}" ${state.criteria[key]?'checked':''}>${label}</label>${state.criteria[key]?`<select data-importance="${key}" aria-label="Importance of ${label}"><option value="preferred" ${state.criteria[key]==='preferred'?'selected':''}>Preferred</option><option value="required" ${state.criteria[key]==='required'?'selected':''}>Required</option></select>${accessControl(key)}`:''}</div>`;}).join('')}</section>`).join('')}</div><div class="service-continue"><span><strong>${n} ${n===1?'service':'services'} selected</strong><small>Required: must match · Preferred: helps rank</small></span><button class="primary" data-action="find-regions">Find regions ${arrow}</button></div><p class="results-footnote">Prototype: region scores and service evidence are illustrative.</p>`;
}
function demoMetric(c){
  const type=c.key.split('.')[1];
  if(c.rule.kind==='speed')return {value:c.mbps+' Mbps',label:'Example download speed'};
  if(c.rule.kind==='distance')return {value:c.km+' km',label:'To the nearest example airport'};
  if(c.rule.kind==='presence')return {value:c.present?'Yes':'No',label:type==='mains_water'?'Example public mains connection':type==='cycling'?'Example cycle routes':'Example service availability'};
  return {value:c.minutes+' min',label:`Example ${c.rule.mode==='car'?'drive':'walk'} to nearest service`};
}
function serviceVisual(c){
  const type=c.key.split('.')[1];
  const title=(text)=>`<h3>${text}</h3>`;
  if(type==='hospital')return `<div class="service-visual hospital-bands">${title('Hospital access by car')}<div class="access-bands">${[15,30,60].map(n=>{const count=[c.minutes,c.minutes+17,c.minutes+36].filter(t=>t<=n).length;return `<span class="${n===c.rule.limit?'chosen':''}"><strong>${count}</strong><small>${n===60?'1 hour':n+' min'}</small></span>`;}).join('')}</div><p>Example hospitals within each drive time.</p></div>`;
  if(type==='gp')return `<div class="service-visual gp-distance">${title('Nearest GPs')}<div class="distance-bars">${[0,1,2].map(i=>`<div><span>GP ${i+1}</span><i style="width:${Math.min(100,(c.minutes+i*9)/70*100)}%"></i><strong>${c.minutes+i*9} min</strong></div>`).join('')}</div><p>Example walking time · points on the map.</p></div>`;
  if(type==='public_transport')return `<div class="service-visual">${title('Public transport nearby')}<div class="visual-tabs"><button data-action="transit-display" data-value="bus" aria-pressed="${transitDisplay==='bus'}">Bus stops</button><button data-action="transit-display" data-value="train" aria-pressed="${transitDisplay==='train'}">Train stations</button></div><div class="transport-fact"><strong>${transitDisplay==='bus'?4:2}</strong><span>example ${transitDisplay==='bus'?'stops':'stations'}<small>Nearest: ${transitDisplay==='bus'?c.minutes:c.minutes+12} min walk</small></span></div><p>Scoring uses the nearest bus or rail access.</p></div>`;
  if(type==='cycling')return `<div class="service-visual">${title('Cycle routes')}<div class="transport-fact"><strong>${c.present?2:0}</strong><span>example mapped routes<small>${c.present?'Routes highlighted on the map':'No routes in this fixture'}</small></span></div></div>`;
  if(type==='airport')return `<div class="service-visual nearest-airport">${title('Nearest airport')}<div class="transport-fact"><span class="airport-symbol">↗</span><span>Example airport<small>${c.km} km from the region centre</small></span></div></div>`;
  if(c.key.startsWith('education.'))return `<div class="service-visual">${title('Education nearby')}<div class="visual-tabs education-tabs">${[['childcare','Childcare'],['primary_school','Primary'],['secondary_school','Secondary']].map(([id,label])=>`<button data-action="education-display" data-value="education.${id}" aria-pressed="${type===id}">${label}</button>`).join('')}</div><p>Example service locations · nearest ${c.minutes} min walk.</p></div>`;
  if(type==='broadband')return `<div class="service-visual broadband-visual">${title('Broadband')}<div class="speed-scale"><span style="width:${Math.min(100,c.mbps/1000*100)}%"></span><i style="left:${Math.min(99,c.rule.limit/1000*100)}%"></i></div><div class="legend-labels"><span>0</span><span>1000 Mbps</span></div><p>Your minimum: ${c.rule.limit} Mbps · demo coverage.</p></div>`;
  if(type==='mains_water')return `<div class="service-visual water-visual">${title('Public water mains')}<span class="water-status ${c.present?'yes':'no'}">${c.present?'✓ Example connection shown':'Example connection not shown'}</span><p>A connection check, independent of walking distance.</p></div>`;
  return `<div class="service-visual walking-visual">${title(type==='clubs'?'Nearest GAA club':type==='community_centres'?'Nearest community centre':type==='parks'?'Nearest park':type==='green_areas'?'Nearest green space':'Nearby access')}<div class="access-bands">${[15,30,60].map(n=>`<span class="${n===c.rule.limit?'chosen':''}"><strong>${c.minutes<=n?'✓':'—'}</strong><small>${n===60?'1 hour':n+' min'} walk</small></span>`).join('')}</div></div>`;
}
function renderDetailMap(region,c){
  const node=document.querySelector('#detail-map');if(!node)return;
  const bounds=L.geoJSON(region).getBounds(),center=bounds.getCenter();
  detailMap=L.map(node,{zoomControl:false,scrollWheelZoom:false,attributionControl:true,dragging:true}).fitBounds(bounds,{padding:[25,25],maxZoom:13});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(detailMap);
  L.geoJSON(region,{style:{color:'#35664f',weight:1.5,fillOpacity:.08}}).addTo(detailMap);
  L.circleMarker(center,{radius:6,color:'#fff',weight:2,fillColor:'#35664f',fillOpacity:1}).bindTooltip('Region centre · example journey origin').addTo(detailMap);
  if(!c)return;
  const type=c.key.split('.')[1],polys=region.geometry.type==='MultiPolygon'?region.geometry.coordinates:[region.geometry.coordinates],outer=polys[0][0];
  const point=i=>{const p=outer[Math.floor(outer.length*((i*.19+.21)%1))];return [(center.lat+p[1])/2,(center.lng+p[0])/2];};
  if(type==='cycling'){if(c.present)for(let i=0;i<2;i++)L.polyline([point(i),point(i+1),point(i+2)],{color:i?'#6ba554':'#35664f',weight:4}).bindTooltip('Example cycle route '+(i+1)).addTo(detailMap);return;}
  if(c.rule.kind==='presence'||c.rule.kind==='speed'||type==='airport')return;
  const count=type==='gp'?3:type==='public_transport'?(transitDisplay==='bus'?4:2):type==='hospital'?3:c.key.startsWith('education.')?4:1;
  for(let i=0;i<count;i++){
    const symbol=type==='public_transport'?(transitDisplay==='bus'?'B':'T'):type==='gp'?'GP':type==='airport'?'↗':domains.find(d=>c.key.startsWith(d.id+'.'))?.symbol||'•';
    const label=type==='public_transport'?(transitDisplay==='bus'?'Bus stop':'Train station'):criterionName(c.key);
    L.marker(point(i),{icon:L.divIcon({className:'service-map-pin',html:symbol,iconSize:[27,27],iconAnchor:[13,13]})}).bindTooltip('Demo '+label+' '+(i+1),{permanent:count===1,direction:'top',className:'demo-service-tooltip'}).addTo(detailMap);
  }
}
function renderDashboard(){
  if(detailMap){detailMap.remove();detailMap=null;}
  const dashboard=document.querySelector('#dashboard');dashboard.hidden=!profileSaved||resultView==='map';dashboard.classList.toggle('region-detail',Boolean(selectedRegion)&&resultView==='dashboard');
  document.body.classList.toggle('dashboard-mode',profileSaved&&resultView!=='map');
  document.querySelector('#map-caption').hidden=profileSaved&&resultView!=='map';document.querySelector('#map-source').hidden=profileSaved&&resultView!=='map';
  if(!profileSaved)return;
  if(resultView==='services'){dashboard.innerHTML=serviceSelection();return;}
  if(dashboard.hidden)return;
  const results=resultRegions(),required=Object.entries(state.criteria).filter(([,v])=>v==='required'),preferred=Object.entries(state.criteria).filter(([,v])=>v==='preferred');
  const region=geography?.features.find(f=>f.properties.id===selectedRegion);
  const scope=state.scope==='anywhere'?'Anywhere in Ireland':esc(state.location||'Choose a region');
  const header=`<div class="results-context"><span>${scope}</span><small>Illustrative scores · demo service data</small></div>`;
  const chips=`<div class="criteria-chips" aria-label="Current search criteria">${criterionChips()}</div>`;
  const empty=state.scope==='specific'&&!state.placeId?'<div class="empty-results"><h2>Choose a region</h2><p>Enter a town or city in the search area filter.</p></div>':`<div class="empty-results"><span class="empty-symbol">⌕</span><h2>No regions match your requirements</h2><p>Remove a required criterion to broaden your search.</p><div class="empty-actions">${required.map(([key])=>`<button data-action="remove-criterion" data-value="${key}">Remove ${criterionName(key)}</button>`).join('')}</div>${required.length>1?'<button class="text-button" data-action="clear-required">Clear all requirements</button>':''}</div>`;
  if(region){
    const r=regionResult(region),name=esc(shortName(region.properties.name)),shown=selectedPillar?r.criteria.filter(c=>c.key.startsWith(selectedPillar+'.')):r.criteria;
    const c=r.criteria.find(c=>c.key===selectedCriterion)||(selectedCriterion?.startsWith('education.')?demoCriterion(region,selectedCriterion,null):shown[0]);
    const metric=c?demoMetric(c):null;
    dashboard.innerHTML=`<button class="text-button back-results" data-action="regions">← All ${results.length} matching regions</button>${header}<div class="results-title"><div><h1>${name}</h1><p>See what fits your everyday life.</p></div><button class="secondary" data-action="services">Edit service priorities</button></div><div class="region-summary"><button class="total-score" data-action="pillar" data-value=""><span>Total score</span><strong>${r.score??'—'}<small>${r.score===null?'':' / 100'}</small></strong><small>Illustrative</small></button><div><strong>${r.matched.length} of ${r.criteria.length} criteria match</strong><p>${r.required.length?r.required.filter(c=>c.matched).length+' of '+r.required.length+' requirements met':'No required criteria'} · ${r.preferred.filter(c=>c.matched).length} of ${r.preferred.length} preferences match</p><span>Select a pillar or criterion to explore the detail.</span></div></div><div class="pillar-scores" aria-label="Scores across five pillars">${r.pillars.map(d=>`<button class="pillar-score ${selectedPillar===d.id?'active':''}" data-action="pillar" data-value="${d.id}"><span>${d.name}</span><strong>${d.score??'—'}</strong><div class="pillar-bar"><i style="width:${d.score??0}%;background:${green(d.score)}"></i></div><small>${d.items.length?d.items.filter(c=>c.matched).length+' of '+d.items.length+' match':'Not selected'}</small></button>`).join('')}</div>${!r.eligible?'<div class="region-warning">This region no longer meets every requirement. Remove a requirement or return to the matching regions.</div>':''}<div class="detail-content"><section class="reason-panel"><div><h2>${selectedPillar?domains.find(d=>d.id===selectedPillar).name:'Your criteria'}</h2><button class="text-button" data-action="pillar" data-value="">Show all</button></div>${shown.length?`<div class="criterion-rows">${shown.map(item=>{const m=demoMetric(item);return `<button class="criterion-row ${c?.key===item.key?'active':''}" data-action="criterion-detail" data-value="${item.key}"><span><strong>${criterionName(item.key)}</strong><small>${item.importance==='required'?'Required':'Preferred'} · ${m.value} · ${ruleLabel(item.key)}</small></span><span><strong>${item.value}<small> / 100</small></strong><small class="${item.matched?'match-yes':'match-no'}">${item.matched?'✓ Matches':'Does not match'}</small></span><span aria-hidden="true">›</span></button>`;}).join('')}</div>`:'<p class="no-criteria">No services selected for this pillar. Add services to explore its score.</p>'}</section><section class="criterion-detail" aria-label="Selected criterion details"><div class="criterion-detail-heading"><span>${c?criterionName(c.key):'Explore the region'}</span><small>Demo evidence</small></div>${c?serviceVisual(c):''}<div id="detail-map" class="detail-map" aria-label="Small map of ${name} and example service points"></div>${c?`<div class="criterion-facts"><strong>${metric.value}</strong><small>${metric.label}</small><p>${c.importance?(c.matched?'Meets':'Outside')+' your selection: '+ruleLabel(c.key)+'.':'Explore this service. Add it to priorities to include it in your score.'}</p><div><span>${c.importance==='required'?'Required':c.importance?'Preferred':'Not selected'}</span><span>${c.importance?c.value:'—'} / 100</span></div></div>`:'<p class="no-criteria">Select a service to see its example point and data.</p>'}<small class="map-demo-note">Example point and journey; not a verified service location.</small></section></div>${name==='Drogheda'?`<section class="demo-homes-summary"><h2>Homes in Drogheda <small>Demo listings · not live availability</small></h2><div>${demoHomesForDetail(region).map(h=>`<span><strong>€${h[state.tenure].toLocaleString('en-IE')}${state.tenure==='rent'?' / month':''}</strong><small>${h.beds} beds · ${h.name}</small></span>`).join('')||'<p>No demo homes match your bedroom and budget choices.</p>'}</div></section>`:''}<details class="scoring-explainer"><summary>How the demo scores work</summary><p>Only selected services contribute. Required services must meet the demo rule to include a region. Local services match within your selected 15, 30 or 60 minute walk. Hospitals use car access (one hour by default). Broadband matches your minimum speed; water/cycling use example availability. Airport score reflects its example distance. All measures are fictional fixtures; no routed journey or coverage proof is connected. Required services have twice the weight of preferences in the pillar and total averages. Unselected pillars show no score. These are interaction fixtures, not a validated assessment model.</p></details>`;
    renderDetailMap(region,c);return;
  }
  dashboard.innerHTML=`${header}<div class="results-title"><div><h1>Places that fit your life</h1><p>Compare regions, then explore the reasons.</p></div><button class="secondary" data-action="services">Edit service priorities</button></div><div class="kpi-strip"><div><strong id="result-count">${results.length}</strong><span>${results.length===1?'Matching region':'Matching regions'}</span></div><div><strong>${required.length}</strong><span>Required criteria</span></div><div><strong>${preferred.length}</strong><span>Preferences</span></div></div>${chips}<div class="results-list-heading"><h2>${results.length} ${results.length===1?'region':'regions'}</h2><small>${Object.keys(state.criteria).length?'Ordered by total score':'Select priorities to compare scores'}</small></div>${results.length?`<div class="region-grid">${results.map(r=>`<button class="region-card" data-action="region" data-value="${r.region.properties.id}"><div class="region-card-top"><span><strong>${esc(shortName(r.region.properties.name))}</strong><small>${esc(r.region.properties.county)}</small></span><span class="region-score">${r.score??'—'}<small>${r.score===null?'No score':'total / 100'}</small></span></div><div class="region-score-bar"><span style="width:${r.score??0}%;background:${green(r.score)}"></span></div><div class="mini-pillars">${r.pillars.map(d=>`<span title="${d.name}"><small>${d.name}</small><strong>${d.score??'—'}</strong></span>`).join('')}</div><div class="region-reasons">${r.criteria.length?`<strong>${r.matched.length} of ${r.criteria.length} criteria match</strong><span>${r.required.length?'✓ All '+r.required.length+' requirements met':'No required criteria'}</span><p>${r.matched.slice(0,3).map(c=>criterionName(c.key)).join(' · ')||'No preferences match yet'}</p>`:'<p>Add services to see the reasons for each region.</p>'}</div><span class="region-link">See scores & reasons <span>↗</span></span></button>`).join('')}</div>`:empty}<p class="results-footnote">30 sample regions · illustrative scores and service evidence. Live suitability and property availability are not connected.</p>`;
}
function demoHomesForDetail(region){const before=activePlace;activePlace=region;const homes=demoHomes().filter(h=>h.beds>=(state.bedrooms||1)&&(!state.budgets[state.tenure]||h[state.tenure]<=state.budgets[state.tenure])).slice(0,3);activePlace=before;return homes;}
async function loadGeography() {
  try {
    geography = await (await fetch('/prototype/home/places.geojson')).json();
    townLayer = L.geoJSON(geography, {style:{color:'#35664f',weight:.7,fillOpacity:.045,opacity:.5},onEachFeature(feature,layer) {
      layer.bindTooltip(esc(feature.properties.name), {sticky:true,className:'town-tooltip'});
      layer.on('click', () => { choosePlace(feature); if (current === 'scope') state.scope = 'specific'; render(); updateMap(true); });
    }}).addTo(map);
    document.querySelector('#towns').innerHTML = geography.features.map(f=>`<option value="${esc(shortName(f.properties.name))}">${esc(f.properties.county)}</option>`).join('');
    await maskIreland();
    render();if(profileSaved)revealMap();updateMap(true);
  } catch {
    document.querySelector('#map-source').textContent = 'Town outlines unavailable. Reload the local prototype.';
  }
}
function choosePlace(feature) { state.scope='specific';state.placeId=feature.properties.id;state.location=shortName(feature.properties.name); }
function sequence() {
  return ['scope',...(state.scope === 'specific' ? ['place'] : []),'people',...state.people.map((_,i)=>`age.${i}`),'bedrooms','tenure','budget','transport',...(state.mainTransport === 'driving' ? [] : ['car']),'save','done'];
}
function choice(label, field, value, selected, extra = '') { return `<button type="button" class="choice ${selected ? 'selected' : ''}" data-action="choose" data-field="${field}" data-value="${value}" aria-pressed="${selected}" ${extra}>${label}${selected ? '<span class="choice-check" aria-hidden="true">✓</span>' : ''}</button>`; }
function numberField(label,field,value,attrs='') { return `<label class="input-label"><span>${label}</span><input data-field="${field}" type="number" value="${esc(value)}" ${attrs}></label>`; }
function locationInput() {
  return `<label class="input-label"><span>Town or city</span><div class="place-input"><input type="text" data-field="location" value="${esc(state.location)}" list="towns" autocomplete="off" placeholder="Search a town or city…">${pin}</div></label>`;
}
function educationHint() {
  const ages=state.people.filter(p=>p.age!==null).map(p=>p.age);
  const names=[];
  if(ages.some(a=>a<5)) names.push('childcare');
  if(ages.some(a=>a>=5&&a<12)) names.push('primary schools');
  if(ages.some(a=>a>=12&&a<=18)) names.push('secondary schools');
  return names.length ? `The ages you entered suggest considering ${names.join(' and ')}. You decide what applies.` : 'Choose what applies now or in the future.';
}
function question() {
  if(current === 'scope') return {eyebrow:'Start with possibility',title:'Where would you like to live?',hint:'Have somewhere in mind, or let your needs lead the way.',body:`<div class="scope-options">${choice('<span class="scope-symbol">✳</span><span>Anywhere that fits</span>','scope','anywhere',state.scope==='anywhere')}${choice(`${pin}<span>A specific region</span>`,'scope','specific',state.scope==='specific')}</div>`};
  if(current === 'place') return {eyebrow:'Your starting place',title:'Where do you have in mind?',hint:profileSaved?'Search for a town or city, or select its outline on the map.':'Choose a town or city. The map opens after you save your profile.',body:locationInput()};
  if(current === 'people') return {eyebrow:'Your household',title:'How many people in your household?',hint:'Include yourself. We’ll ask about each person’s age next.',body:`<div class="count-row"><button data-action="count-down" aria-label="One fewer person" ${state.people.length===1?'disabled':''}>−</button><span>${state.people.length}<small>${state.people.length===1?'person':'people'}</small></span><button data-action="count-up" aria-label="One more person">+</button></div>`};
  if(current.startsWith('age.')) { const i=Number(current.split('.')[1]);return {eyebrow:`Your household · person ${i+1} of ${state.people.length}`,title:`How old is person ${i+1}?`,hint:'This helps suggest education needs. You can leave it blank.',body:numberField('Age in years',`age.${i}`,state.people[i].age,'min="0" max="120" placeholder="Optional"')}; }
  if(current === 'bedrooms') return {eyebrow:'Space to live',title:'How many bedrooms do you need?',hint:'Choose your minimum. It doesn’t have to match your household size.',body:`<div class="choices">${[1,2,3,4,5].map(n=>choice(n===5?'5+':n,'bedrooms',n,state.bedrooms===n)).join('')}</div>`};
  if(current === 'tenure') return {eyebrow:'Your home',title:'Are you looking to rent or buy?',hint:'This sets the kind of budget we’ll ask about.',body:`<div class="choices">${choice('Rent','tenure','rent',state.tenure==='rent')}${choice('Buy','tenure','buy',state.tenure==='buy')}</div>`};
  if(current === 'budget') return {eyebrow:'Your housing budget',title:state.tenure==='rent'?'What’s your monthly rent budget?':'What’s your purchase budget?',hint:'Optional. A useful benchmark alongside service access.',body:numberField(state.tenure==='rent'?'€ per month':'Total purchase price (€)',`budget.${state.tenure}`,state.budgets[state.tenure],`min="1" step="${state.tenure==='rent'?50:1000}" placeholder="Optional"`)};
  if(current === 'transport') return {eyebrow:'Everyday journeys',title:'How will you mainly get around?',hint:'Choose your main way of travelling.',body:`<div class="choices">${modes.map(([id,name])=>choice(name,'mainTransport',id,state.mainTransport===id)).join('')}</div>`};
  if(current === 'car') return {eyebrow:'Getting around',title:'Will your household have access to a car?',hint:'You can rely on public transport and still have a car available.',body:`<div class="choices">${choice('Yes','carAvailable','yes',state.carAvailable===true)}${choice('No','carAvailable','no',state.carAvailable===false)}</div>`};
  if(current==='save')return {eyebrow:'Your household profile',title:'Ready to save your profile?',hint:'Your people, ages and everyday transport become your defaults. Service priorities can change at any time.',body:`<div class="save-summary"><span><strong>${state.people.length} ${state.people.length===1?'person':'people'}</strong><small>Ages: ${state.people.map(p=>p.age===null?'not specified':p.age).join(', ')}</small></span><span><strong>${modes.find(([id])=>id===state.mainTransport)?.[1]}</strong><small>${state.carAvailable?'Car available':'No car available'}</small></span></div><p class="save-note">Saved in this browser when you choose “Save profile”.</p>`};
  return {eyebrow:'Change your search',title:'Where do you have in mind?',hint:'Choose a town or city. Your saved household profile stays the same.',body:locationInput()};

}
function renderPrompt() {
  const prompt=document.querySelector('#prompt');
  prompt.hidden=current==='done'&&profileSaved;
  const q=question();
  const idx=sequence().indexOf(current);
  document.querySelector('#prompt').innerHTML=`<h1>${q.title}</h1><div class="answer">${q.body}</div>${error?`<p class="error" role="alert">${error}</p>`:''}<div class="question-actions">${idx>0?'<button class="back" data-action="back">← Back</button>':'<span></span>'}${current==='done'?'<button class="primary" data-action="focus-map">Explore the map '+arrow+'</button>':'<button class="primary" data-action="next">'+(current==='save'?'Save profile':'Continue')+arrow+'</button>'}</div>`;
}
function section(title,body,open=true) { return `<details class="filter-section" ${open?'open':''}><summary>${title}<span>⌄</span></summary><div>${body}</div></details>`; }
function inputSmall(label,field,value,type='number',attrs='') { return `<label class="small-input"><span>${label}</span><input type="${type}" data-field="${field}" value="${esc(value)}" ${attrs}></label>`; }
function renderFilters() {
  const visible=profileSaved&&resultView!=='services';
  document.body.classList.toggle('has-filters',visible);
  document.body.classList.toggle('profile-setup',!profileSaved);
  document.body.classList.toggle('service-selection',profileSaved&&resultView==='services');
  document.querySelector('#map').setAttribute('aria-hidden',String(!profileSaved));
  const filters=document.querySelector('#filters');
  filters.classList.toggle('visible',visible);filters.classList.toggle('mobile-open',showFilters);
  document.querySelector('#filter-toggle').hidden=!visible;
  if(!visible){filters.innerHTML='';return;}
  let content=section('Search area',`<label class="radio-filter"><input name="filter-scope" type="radio" data-scope="anywhere" ${state.scope==='anywhere'?'checked':''}>Anywhere that fits</label><label class="radio-filter"><input name="filter-scope" type="radio" data-scope="specific" ${state.scope==='specific'?'checked':''}>Specific location</label>${state.scope==='specific'?inputSmall('Town or city','location',state.location,'text','list="towns" placeholder="Search…"'):'<small class="filter-note">Republic of Ireland only</small>'}`);
  content+=section('Home & budget',`<label class="small-input"><span>Minimum bedrooms</span><select data-field="bedrooms">${[1,2,3,4,5].map(n=>`<option value="${n}" ${state.bedrooms===n?'selected':''}>${n===5?'5+':n}</option>`).join('')}</select></label><label class="small-input"><span>Rent or buy</span><select data-field="tenure"><option value="rent" ${state.tenure==='rent'?'selected':''}>Rent</option><option value="buy" ${state.tenure==='buy'?'selected':''}>Buy</option></select></label>${inputSmall(state.tenure==='rent'?'Monthly rent budget (€)':'Purchase budget (€)',`budget.${state.tenure}`,state.budgets[state.tenure],'number','min="1" placeholder="Optional"')}`,false);
  content+='<div class="filter-divider">Service priorities <small>Pick and remove them anytime</small></div>';
  content+=domains.map(d=>section(`<i style="color:${d.color}">${d.symbol}</i>${d.name}`,`${d.id==='education'?`<p class="education-note">${educationHint()}</p>`:''}${d.options.map(([id,label])=>{const key=`${d.id}.${id}`;return `<div class="criterion-filter"><label class="radio-filter"><input type="checkbox" data-criterion="${key}" ${state.criteria[key]?'checked':''}>${label}</label>${state.criteria[key]?`<select data-importance="${key}" aria-label="Importance of ${label}"><option value="preferred" ${state.criteria[key]==='preferred'?'selected':''}>Preferred</option><option value="required" ${state.criteria[key]==='required'?'selected':''}>Required</option></select>${accessControl(key)}`:''}</div>`;}).join('')}`,filterOpen.has(d.id))).join('');
  filters.innerHTML=`<div class="filters-heading"><div><h2>Service priorities</h2><p>Shape your search</p></div><button data-action="filter-toggle" class="close-filters" aria-label="Close criteria">×</button></div>${content}<p class="filter-footnote">Required services determine eligibility. Preferences help rank regions. Your profile stays saved.</p>`;
  document.querySelector('#filter-count').textContent=Object.keys(state.criteria).length;
}
function criterionName(key){const d=domains.find(d=>d.id===key.split('.')[0]);return d?.options.find(([id])=>id===key.split('.')[1])?.[1]||key;}
function renderCart(){
  const selected=Object.entries(state.criteria);
  const profile=savedProfile||{people:state.people,mainTransport:state.mainTransport,carAvailable:state.carAvailable};
  const mode=modes.find(([id])=>id===profile.mainTransport)?.[1]||'Not chosen';
  document.querySelector('#cart-badge').textContent=profile.people.length;
  document.querySelector('#cart-toggle').setAttribute('aria-expanded',String(showCart));
  const cart=document.querySelector('#cart');cart.hidden=!showCart;
  cart.innerHTML=`<div class="cart-heading"><div><h2>${profileSaved?'Your saved profile':'Your household profile'}</h2><p>${profileSaved?'Saved in this browser':'Selections you’re building'}</p></div><button data-action="cart" aria-label="Close profile">×</button></div><div class="cart-profile"><span class="cart-lock">${profileSaved?'✓ Saved defaults':'Profile in progress'}</span><strong>${profile.people.length} ${profile.people.length===1?'person':'people'} in your household</strong><small>Ages: ${profile.people.map(p=>p.age===null?'not specified':p.age).join(', ')}</small><dl><div><dt>Main transport</dt><dd>${mode}</dd></div><div><dt>Car available</dt><dd>${profile.carAvailable===null?'Not chosen':profile.carAvailable?'Yes':'No'}</dd></div></dl></div>${profileSaved?'<button class="edit-profile" data-action="edit-profile">Edit saved profile</button>':''}<div class="cart-criteria"><h3>Current selections <span>${selected.length}</span></h3><div class="cart-search-context"><span>${state.scope==='anywhere'?'Anywhere in Ireland':esc(state.location||'Location not chosen')}</span><small>${state.bedrooms?state.bedrooms+'+ bedrooms · ':''}${state.tenure==='rent'?'Renting':'Buying'}${state.budgets[state.tenure]?' · €'+Number(state.budgets[state.tenure]).toLocaleString('en-IE')+(state.tenure==='rent'?' / month':''):''}</small></div>${selected.length?selected.map(([key,importance])=>`<div class="cart-item"><span>${criterionName(key)}<small>${importance} · ${ruleLabel(key)}</small></span><button data-action="remove-criterion" data-value="${key}" aria-label="Remove ${criterionName(key)}">×</button></div>`).join(''):'<p>Choose service priorities on the left. Your household profile stays the same.</p>'}</div>`;
}
function saveProfile(){
  const profile={people:structuredClone(state.people),mainTransport:state.mainTransport,carAvailable:state.carAvailable};
  const defaults={scope:state.scope,placeId:state.placeId,location:state.location,bedrooms:state.bedrooms,tenure:state.tenure,budgets:{...state.budgets}};
  try{localStorage.setItem(storageKey,JSON.stringify({version:1,profile,defaults}));}catch{error='This browser could not save your profile. Please allow local storage and try again.';renderPrompt();return;}
  savedProfile=profile;profileSaved=true;resultView='services';selectedRegion=null;current='done';exploring=true;showCart=false;render();revealMap();
}
function updateState() { document.querySelector('#state-json').textContent=JSON.stringify({currentQuestion:current,resultView,selectedRegion,mapExploration:exploring,profileSaved,savedProfile,answered:[...answered],...state},null,2); }
function render() { renderPrompt();renderFilters();renderCart();updateState();document.querySelector('#state-drawer').hidden=!showState;renderDashboard();updateMap(false); }
function validate() {
  if(current==='scope'&&!state.scope)return 'Choose a specific location or stay open to anywhere.';
  if(current==='place'&&!state.placeId)return 'Choose a town or city from the suggestions or its outline on the map.';
  if(current==='bedrooms'&&!state.bedrooms)return 'Choose the minimum number of bedrooms.';
  if(current==='transport'&&!state.mainTransport)return 'Choose your main way of travelling.';
  if(current==='car'&&state.carAvailable===null)return 'Choose whether a car will be available.';
  if(current.startsWith('age.')){const age=state.people[Number(current.split('.')[1])].age;if(age!==null&&(age<0||age>120))return 'Enter an age from 0 to 120 or leave it blank.';}
  if(current==='budget'){const budget=state.budgets[state.tenure];if(budget!==null&&budget<=0)return 'Use a positive budget or leave it blank.';}
  return '';
}
function reconcileCurrent() { if(!sequence().includes(current))current=sequence().find(key=>!answered.has(key))||'done'; }
function changePeople(count) { const n=Math.max(1,Math.min(30,Number(count)||1));while(state.people.length<n)state.people.push({age:null});state.people=state.people.slice(0,n);reconcileCurrent(); }
function selectCriterion(key,selected) {
  const domain=key.split('.')[0];
  if(selected){state.criteria[key]='preferred';if(!state.verticals.includes(domain))state.verticals.push(domain);}
  else delete state.criteria[key];
}
function applyField(target) {
  const field=target.dataset.field;
  let value=target.type==='checkbox'?target.checked:target.type==='number'?(target.value===''?null:Number(target.value)):target.value;
  if(field==='location') {state.location=value;const place=findPlace(value);state.placeId=place?.properties.id||null;updateMap(Boolean(place));}
  else if(field==='people')changePeople(value);
  else if(field.startsWith('age.'))state.people[Number(field.split('.')[1])].age=value;
  else if(field.startsWith('budget.'))state.budgets[field.split('.')[1]]=value;
  else if(field==='bedrooms')state.bedrooms=Number(value);
  else state[field]=value;
  if(field==='mainTransport'&&value==='driving')state.carAvailable=true;
  document.querySelectorAll('[data-field]').forEach(node => { if(node !== target && node.dataset.field === field && node.tagName !== 'BUTTON') { if(node.type === 'checkbox')node.checked=Boolean(value);else node.value=value ?? ''; } });
  renderCart();updateState();renderDashboard();updateMap();
}
app.addEventListener('input',event=>{if(event.target.dataset.field)applyField(event.target);});
app.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.scope){state.scope=target.dataset.scope;if(state.scope==='specific'&&!state.placeId&&!profileSaved){resumeAfterPlace=current;current='place';}reconcileCurrent();render();updateMap(true);return;}
  if(target.dataset.criterion){selectCriterion(target.dataset.criterion,target.checked);render();return;}
  if(target.dataset.access){state.access[target.dataset.access]={...accessRule(target.dataset.access),limit:Number(target.value)};render();return;}
  if(target.dataset.importance){state.criteria[target.dataset.importance]=target.value;renderCart();updateState();renderDashboard();updateMap();return;}
  if(target.dataset.field){applyField(target);if(['people','tenure','mainTransport'].includes(target.dataset.field)){reconcileCurrent();render();}else if(!target.closest('#prompt'))renderPrompt();}
});
app.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(action==='choose'){
    const field=target.dataset.field,value=target.dataset.value;
    if(field==='verticals'){
      if(state.verticals.includes(value)){state.verticals=state.verticals.filter(v=>v!==value);for(const key of Object.keys(state.criteria))if(key.startsWith(value+'.'))delete state.criteria[key];}
      else state.verticals.push(value);
    }else if(field==='criterion')selectCriterion(value,!state.criteria[value]);
    else if(field==='required')state.criteria[value]=state.criteria[value]==='required'?'preferred':'required';
    else if(field==='bedrooms')state.bedrooms=Number(value);
    else if(field==='carAvailable')state.carAvailable=value==='yes';
    else{state[field]=value;if(field==='mainTransport'&&value==='driving')state.carAvailable=true;}
    error='';render();if(field==='scope')updateMap(true);return;
  }
  if(action==='next'){if(current==='save'){saveProfile();return;}error=validate();if(error){renderPrompt();return;}answered.add(current);const keys=sequence();if(current==='place'&&resumeAfterPlace){current=resumeAfterPlace;resumeAfterPlace=null;reconcileCurrent();}else current=keys[keys.indexOf(current)+1]||'done';render();if(current==='place'||current==='people')updateMap(true);return;}
  if(action==='back'){const keys=sequence();current=keys[Math.max(0,keys.indexOf(current)-1)];error='';render();return;}
  if(action==='count-up'||action==='count-down'){changePeople(state.people.length+(action==='count-up'?1:-1));render();return;}
  if(action==='region'){selectedRegion=target.dataset.value;selectedPillar=null;selectedCriterion=null;resultView='dashboard';const url=new URL(location.href);url.searchParams.set('region',selectedRegion);history.pushState({},'',url);render();document.querySelector('#dashboard').scrollTop=0;return;}
  if(action==='services'){resultView='services';selectedRegion=null;render();return;}
  if(action==='find-regions'){resultView='dashboard';selectedRegion=null;render();return;}
  if(action==='pillar'){selectedPillar=target.dataset.value||null;selectedCriterion=null;renderDashboard();return;}
  if(action==='transit-display'){transitDisplay=target.dataset.value;renderDashboard();return;}
  if(action==='education-display'){selectedCriterion=target.dataset.value;renderDashboard();return;}
  if(action==='criterion-detail'){selectedCriterion=target.dataset.value;renderDashboard();return;}
  if(action==='regions'){selectedRegion=null;resultView='dashboard';const url=new URL(location.href);url.searchParams.delete('region');history.pushState({},'',url);render();return;}
  if(action==='region-map'){resultView=resultView==='map'?'dashboard':'map';render();revealMap();return;}
  if(action==='clear-required'){for(const key of Object.keys(state.criteria))if(state.criteria[key]==='required')delete state.criteria[key];render();return;}
  if(action==='home'){selectedHome=target.dataset.value;renderRegion();const home=demoHomes().find(h=>h.id===selectedHome);if(home)map.panTo(home.latlng,{animate:true});return;}
  if(action==='cart'){showCart=!showCart;if(showCart&&window.innerWidth<720){showFilters=false;renderFilters();}renderCart();return;}
  if(action==='remove-criterion'){delete state.criteria[target.dataset.value];render();return;}
  if(action==='edit-profile'){profileSaved=false;current='people';exploring=false;showCart=false;document.body.classList.remove('map-ready');tiles.remove();render();return;}
  if(action==='filter-toggle'){showFilters=!showFilters;if(showFilters&&window.innerWidth<720){showCart=false;renderCart();}renderFilters();return;}
  if(action==='inspect'){showState=!showState;document.querySelector('#state-drawer').hidden=!showState;updateState();return;}
  if(action==='focus-map'){if(current==='done'){exploring=true;renderPrompt();updateState();}focusMap();return;}
  if(action==='reset'){selectedRegion=null;resultView='dashboard';profileSaved=false;savedProfile=null;showCart=false;document.body.classList.remove('map-ready');tiles.remove();state=fresh();answered=new Set();current='scope';resumeAfterPlace=null;exploring=false;showFilters=false;error='';render();updateMap(true);}
});
app.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.closest('#prompt')&&event.target.matches('input'))document.querySelector('[data-action="next"]').click();});
document.addEventListener('toggle',event=>{if(event.target.matches('#filters .filter-section')){const name=event.target.querySelector('summary').textContent;const domain=domains.find(d=>name.includes(d.name));if(domain){if(event.target.open)filterOpen.add(domain.id);else filterOpen.delete(domain.id);}}},true);
window.addEventListener('popstate',()=>{selectedRegion=new URLSearchParams(location.search).get('region');resultView='dashboard';render();});
window.addEventListener('resize',()=>{map.invalidateSize();});
render();loadGeography();
