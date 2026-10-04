import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { CommonRecord } from './schema';
const hashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const ruleSchema=z.object({
  id:z.string().min(1),reason:z.string().min(1),
  match:z.object({sourceId:z.string().min(1),scope:z.string().min(1),rawPath:z.string().min(1),rawSha256:hashSchema,
    externalId:z.string().min(1).optional(),rawLocator:z.string().min(1).optional(),canonicalGeometrySha256:hashSchema,
  }).strict().refine(m=>Boolean(m.externalId||m.rawLocator),'Quarantine rules require an external ID or raw locator'),
  validator:z.object({engine:z.literal('PostGIS'),query:z.string().min(1),evidence:z.string().min(1),version:z.string().optional()}).strict(),
}).strict();
export const geometryQuarantineConfigSchema=z.object({version:z.literal(1),rules:z.array(ruleSchema)}).strict();
export type GeometryQuarantineRule=z.infer<typeof ruleSchema>;
export function geometryHash(geometry:CommonRecord['geometry']):string {return createHash('sha256').update(JSON.stringify(geometry)).digest('hex');}
export function ruleHash(rule:GeometryQuarantineRule):string {return createHash('sha256').update(JSON.stringify(rule)).digest('hex');}
export function matchingGeometryQuarantine(record:CommonRecord,rawSha256:string,rules:GeometryQuarantineRule[]):GeometryQuarantineRule|undefined {
  return rules.find(rule=>{
    const m=rule.match;
    return record.sourceId===m.sourceId && record.scope===m.scope && record.raw.path===m.rawPath && rawSha256===m.rawSha256 &&
      (!m.externalId||record.externalId===m.externalId) && (!m.rawLocator||record.raw.locator===m.rawLocator) &&
      geometryHash(record.geometry)===m.canonicalGeometrySha256;
  });
}
