import { expect, test } from 'bun:test';
import { normalizeOsmRow } from '../src/common/adapters/osm';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const ctx={path:'osm-geofabrik/2026-10-04/fixture.osm.pbf',snapshotId:'test'};
const row={primitive:'node',id:'123',version:4,timestamp:'2026-10-01T12:00:00Z',category:'shops',locator:'osm/node/123@4',tags:{name:'Shop',shop:'convenience',phone:'secret',email:'secret@example.test'},geometry:{type:'Point',coordinates:[-6.2,53.3]}};
test('OSM stable primitive identity, edit metadata and safe public tag projection',()=>{
  const result=normalizeOsmRow(row,ctx);expect('record'in result).toBe(true);if('record'in result){expect(result.record.externalId).toBe('node/123');expect(result.record.sourceVersion).toBe(4);expect(result.record.sourceModifiedAt).toBe('2026-10-01T12:00:00.000Z');expect(result.record.observedPeriod).toBe('2026-10-03T20:20:50Z');expect(JSON.stringify(result)).not.toContain('secret');}
  expect('quarantineReason'in normalizeOsmRow({...row,locator:'osm/way/123@4'},ctx)).toBe(true);
});
test('OSM area holes remain polygons, cycleways remain lines, missing assembly stays quarantined',()=>{
  const rings: [number,number][][]=[[[-6.3,53.3],[-6.1,53.3],[-6.1,53.5],[-6.3,53.5],[-6.3,53.3]],[[-6.25,53.35],[-6.25,53.4],[-6.2,53.4],[-6.2,53.35],[-6.25,53.35]]];
  const area=normalizeOsmRow({...row,primitive:'relation',id:'222',locator:'osm/relation/222@4',category:'parks',tags:{leisure:'park'},geometry:{type:'MultiPolygon',coordinates:[rings]}},ctx);expect('record'in area).toBe(true);if('record'in area)expect(area.record.geometry).toEqual({type:'MultiPolygon',coordinates:[rings]});
  const line=normalizeOsmRow({...row,primitive:'way',locator:'osm/way/123@4',category:'cycle_network',tags:{highway:'cycleway'},geometry:{type:'LineString',coordinates:[[-6.2,53.3],[-6.1,53.4]]}},ctx);expect('record'in line).toBe(true);if('record'in line){expect(line.record.kind).toBe('infrastructure');expect(line.record.geometry?.type).toBe('LineString');}
  expect(normalizeOsmRow({...row,error:'Missing ring member'},ctx)).toEqual({quarantineReason:'Missing ring member',locator:row.locator});
});
test('actual libosmium assembly preserves polygon holes and independently checks ID/version',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'osm-geometry-test-'));
  try {
    const path=join(folder,'fixture.osm');
    await Bun.write(path,'<osm version="0.6"><node id="1" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.3" lon="-6.3"/><node id="2" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.3" lon="-6.1"/><node id="3" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.5" lon="-6.1"/><node id="4" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.5" lon="-6.3"/><node id="5" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.35" lon="-6.25"/><node id="6" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.35" lon="-6.2"/><node id="7" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.4" lon="-6.2"/><node id="8" version="1" timestamp="2026-10-01T00:00:00Z" lat="53.4" lon="-6.25"/><way id="10" version="1" timestamp="2026-10-01T00:00:00Z"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/></way><way id="11" version="1" timestamp="2026-10-01T00:00:00Z"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/></way><relation id="20" version="2" timestamp="2026-10-01T00:00:00Z"><member type="way" ref="10" role="outer"/><member type="way" ref="11" role="inner"/><tag k="type" v="multipolygon"/><tag k="leisure" v="park"/></relation></osm>');
    const proc=Bun.spawn(['/private/tmp/ireland-osm-venv/bin/python','scripts/extract-osm.py',path],{stdout:'pipe',stderr:'pipe'});const output=await new Response(proc.stdout).text();expect(await proc.exited).toBe(0);const records=output.trim().split('\n').map(s=>JSON.parse(s));expect(records).toHaveLength(1);expect(records[0].locator).toBe('osm/relation/20@2');expect(records[0].geometry.type).toBe('MultiPolygon');expect(records[0].geometry.coordinates[0]).toHaveLength(2);
    const required=join(folder,'wanted.ndjson');await Bun.write(required,JSON.stringify({raw:{locator:'osm/relation/20@3'}})+'\n');const verify=Bun.spawn(['/private/tmp/ireland-osm-venv/bin/python','scripts/extract-osm.py',path,'--verify-locators',required],{stdout:'pipe',stderr:'pipe'});const result=JSON.parse(await new Response(verify.stdout).text());expect(await verify.exited).toBe(1);expect(result.missing).toBe(1);
  }finally{await rm(folder,{recursive:true,force:true});}
});
