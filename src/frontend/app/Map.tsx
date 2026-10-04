import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type {Place} from './domain';
export function MapView({place,origin,features,onPick}:{place:Place;origin:{longitude:number;latitude:number};features:any[];onPick:(point:{longitude:number;latitude:number})=>void}){
  const element=useRef<HTMLDivElement>(null);const map=useRef<L.Map|null>(null);const onPickRef=useRef(onPick);onPickRef.current=onPick;
  useEffect(()=>{if(!element.current)return;const instance=L.map(element.current,{preferCanvas:true}).setView([origin.latitude,origin.longitude],12);map.current=instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(instance);
    instance.on('click',(event:L.LeafletMouseEvent)=>onPickRef.current({longitude:event.latlng.lng,latitude:event.latlng.lat}));
    return()=>{instance.remove();map.current=null;};
  },[]);
  useEffect(()=>{const instance=map.current;if(!instance)return;const group=L.featureGroup().addTo(instance);const boundary=L.geoJSON({type:'Feature',geometry:place.geometry,properties:{}} as any,{style:{color:'#35664f',weight:2,fillOpacity:.06}}).addTo(group);
    L.circleMarker([origin.latitude,origin.longitude],{radius:7,color:'#fff',weight:2,fillColor:'#263e32',fillOpacity:1}).bindTooltip('Search anchor').addTo(group);
    for(const feature of features){if(!feature.geometry)continue;L.geoJSON(feature,{style:{color:'#7a9470',weight:2,fillOpacity:.1},pointToLayer:(_f,latlng)=>L.circleMarker(latlng,{radius:5,color:'#35664f',weight:1,fillColor:'#8faf76',fillOpacity:.85}),onEachFeature:(f,layer)=>{const node=document.createElement('div');node.textContent=f.properties.name??'Recorded source feature';layer.bindTooltip(node);}}).addTo(group);}
    instance.fitBounds(boundary.getBounds(),{padding:[22,22],maxZoom:13});instance.invalidateSize();return()=>{group.remove();};
  },[place,origin,features]);
  return <div ref={element} className="live-map" aria-label={`Interactive map of recorded services around ${place.name}`}/>;
}
