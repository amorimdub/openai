import proj4 from 'proj4';
import { geometrySchema, type Geometry } from '../schema';

proj4.defs('EPSG:2157', '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=0.99982 +x_0=600000 +y_0=750000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:29902', '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +a=6377340.189 +rf=299.3249646 +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs');
type Position = [number, number];
type Ring = Position[];
export function projectPosition(value: unknown, wkid: number): Position {
  if (!Array.isArray(value) || value.length < 2 || !value.slice(0,2).every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Non-finite or malformed coordinate');
  const xy: Position = [value[0], value[1]];
  if (wkid === 4326) return xy;
  if (![2157,3857,102100,29902].includes(wkid)) throw new Error(`Unsupported source CRS EPSG:${wkid}`);
  const result = proj4(`EPSG:${wkid === 102100 ? 3857 : wkid}`, 'EPSG:4326', xy);
  if (!result.every(Number.isFinite)) throw new Error('Projection produced a non-finite coordinate');
  return [result[0],result[1]];
}
function area(ring: Ring): number {
  // Translate before summation: large projected coordinates otherwise cause cancellation.
  const [x,y] = ring[0];
  let sum = 0;
  for (let i=0;i<ring.length-1;i++) sum += (ring[i][0]-x)*(ring[i+1][1]-y) - (ring[i+1][0]-x)*(ring[i][1]-y);
  return sum/2;
}
function inRing(p: Position, ring: Ring): -1 | 0 | 1 {
  let inside=false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[j], b=ring[i];
    const cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);
    if (Math.abs(cross)<1e-8 && p[0]>=Math.min(a[0],b[0]) && p[0]<=Math.max(a[0],b[0]) && p[1]>=Math.min(a[1],b[1]) && p[1]<=Math.max(a[1],b[1])) return 0;
    if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside ? 1 : -1;
}
function contained(inner: Ring, outer: Ring): boolean {
  // Use first non-boundary vertex (or midpoint) for shared-touch vertices.
  for (let i=0;i<inner.length-1;i++) {
    const result=inRing(inner[i],outer);
    if (result !== 0) return result === 1;
    const mid: Position=[(inner[i][0]+inner[i+1][0])/2,(inner[i][1]+inner[i+1][1])/2];
    const m=inRing(mid,outer); if (m!==0) return m===1;
  }
  throw new Error('Coincident rings cannot be grouped safely');
}
/** Parent containment, rather than publisher winding, preserves holes, islands and multipart geometry. */
export function groupArcGisRings(value: unknown): Ring[][] {
  if (!Array.isArray(value) || !value.length) throw new Error('Polygon has no rings');
  const rings=value.map((r: unknown) => {
    if (!Array.isArray(r) || r.length < 4) throw new Error('Polygon ring has fewer than four positions');
    const ring=r.map(p=>projectPosition(p,4326));
    if (ring[0][0]!==ring.at(-1)![0] || ring[0][1]!==ring.at(-1)![1]) throw new Error('Polygon ring is not closed');
    if (area(ring)===0) throw new Error('Polygon ring has zero area');
    return ring;
  });
  const bounds=rings.map(r=>r.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]));
  const sizes=rings.map(r=>Math.abs(area(r))), parents=rings.map(()=>-1);
  for (let i=0;i<rings.length;i++) for (let j=0;j<rings.length;j++) {
    if (i===j || sizes[j]<=sizes[i] || (parents[i]>=0 && sizes[j]>=sizes[parents[i]])) continue;
    const b=bounds[i],o=bounds[j];
    if (b[0]>=o[0] && b[1]>=o[1] && b[2]<=o[2] && b[3]<=o[3] && contained(rings[i],rings[j])) parents[i]=j;
  }
  const depth=(i:number):number=>parents[i]===-1 ? 0 : depth(parents[i])+1;
  const polygons: Ring[][]=[]; const mapping=new Map<number,number>();
  for (let i=0;i<rings.length;i++) if (depth(i)%2===0) { mapping.set(i,polygons.length);polygons.push([rings[i]]); }
  for (let i=0;i<rings.length;i++) if (depth(i)%2===1) polygons[mapping.get(parents[i])!].push(rings[i]);
  return polygons;
}
export function arcGisGeometry(value: any, wkid: number): Geometry | null {
  if (value == null) return null;
  const sr=value.spatialReference?.latestWkid ?? value.spatialReference?.wkid ?? wkid;
  if ('x' in value || 'y' in value) return geometrySchema.parse({type:'Point',coordinates:projectPosition([value.x,value.y],sr)});
  if (value.points) return geometrySchema.parse({type:'MultiPoint',coordinates:value.points.map((p:unknown)=>projectPosition(p,sr))});
  if (value.paths) {
    const paths=value.paths.map((path:unknown)=>{if(!Array.isArray(path)||path.length<2)throw new Error('Malformed line path');return path.map(p=>projectPosition(p,sr));});
    return geometrySchema.parse(paths.length===1?{type:'LineString',coordinates:paths[0]}:{type:'MultiLineString',coordinates:paths});
  }
  if (value.rings) {
    const polygons=groupArcGisRings(value.rings).map(polygon=>polygon.map((ring,index)=> {
      let transformed=ring.map(p=>projectPosition(p,sr));
      // RFC 7946 exterior counter-clockwise / holes clockwise.
      if ((area(transformed)>0)!==(index===0)) transformed=transformed.reverse();
      return transformed;
    }));
    return geometrySchema.parse(polygons.length===1 ? {type:'Polygon',coordinates:polygons[0]} : {type:'MultiPolygon',coordinates:polygons});
  }
  throw new Error('Unsupported ArcGIS geometry');
}
