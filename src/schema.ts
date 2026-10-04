import { z } from 'zod';

// Republic-of-Ireland data extent; not a jurisdiction-membership test.
const longitude = z.number().finite().min(-11).max(-5);
const latitude = z.number().finite().min(51).max(56);
const position = z.tuple([longitude, latitude]);
const ring = z.array(position).min(4).refine(v => v[0][0] === v.at(-1)![0] && v[0][1] === v.at(-1)![1], 'Polygon rings must close');
export const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: position }).strict(),
  z.object({ type: z.literal('MultiPoint'), coordinates: z.array(position).min(1) }).strict(),
  z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2) }).strict(),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(position).min(2)).min(1) }).strict(),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }).strict(),
]);
const base = {
  version: z.literal(1), id: z.string().min(1), externalId: z.string().min(1),
  sourceId: z.string().min(1), scope: z.string().min(1), name: z.string().min(1),
};
export const recordSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('service'), category: z.string().min(1), geometry: geometrySchema.nullable(), locationStatus: z.enum(['located','unlocated']).default('located'),
    attributes: z.object({ address: z.string().optional(), county: z.string().optional(), eircode: z.string().optional(), schoolLevel: z.string().optional(), access: z.enum(['public','private','unknown']).optional(), serviceType: z.string().optional(), programmes: z.array(z.string()).optional(), verifiedAgeMinimum: z.number().optional(), verifiedAgeMaximum: z.number().optional() }).strict() }).strict().refine(r => (r.geometry !== null) === (r.locationStatus === 'located'), 'Service location status must agree with geometry'),
  z.object({ ...base, kind: z.literal('place'), geometry: geometrySchema, attributes: z.object({ county: z.string().optional(), code: z.string().optional(), geographicType: z.string() }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('market_context'), geometry: geometrySchema.nullable(), attributes: z.object({ placeId: z.string(), tenure: z.enum(['buy','rent']), statistic: z.enum(['mean','median','standardised_mean']), amountEur: z.number().nonnegative().nullable(), period: z.string(), propertyType: z.enum(['house','apartment','all','unknown']), bedrooms: z.number().int().nonnegative().nullable(), sampleSize: z.number().int().nonnegative().nullable(), definition: z.string(), suppressed: z.boolean() }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('housing_information'), geometry: geometrySchema.nullable(), attributes: z.object({ placeId: z.string().optional(), stage: z.string(), period: z.string(), units: z.number().int().nonnegative().nullable() }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('utility_area'), category: z.string(), geometry: geometrySchema, attributes: z.object({ status: z.enum(['reported','planned','available_area','unknown']), period: z.string().nullable(), definition: z.string() }).strict() }).strict(),
]);
export const manifestSchema = z.object({
  version: z.literal(1), snapshotId: z.string().min(1), sourceId: z.string().min(1), scope: z.string().min(1),
  publisher: z.string().min(1), sourceUrl: z.url(), license: z.enum(['CC-BY-4.0','CC0-1.0','CC-BY-SA-4.0','ODbL-1.0','public-domain','custom-reuse']), licenseEvidenceUrl: z.url(), attribution: z.string().min(1),
  fetchedAt: z.iso.datetime(), sourceModifiedAt: z.iso.datetime().nullable(), observedPeriod: z.string().nullable(),
  geography: z.string().min(1), coverage: z.enum(['partial','accepted','unknown']), limitations: z.array(z.string()),
  dataQuality: z.object({recordsWithGeometry:z.number().int().nonnegative(),recordsWithoutGeometry:z.number().int().nonnegative()}).strict().optional(),
  recordCount: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/), format: z.literal('ndjson'),
}).strict();
export const preferencesSchema = z.object({
  version: z.literal(1), location: z.object({ longitude, latitude, placeId: z.string().optional() }).strict(),
  criteria: z.array(z.object({ id: z.string().min(1), importance: z.enum(['required','preferred']), weight: z.number().positive().max(100).optional(),
    parameters: z.object({ maximumMinutes: z.number().positive().optional(), mode: z.enum(['driving','walking','cycling','public_transport']).optional(), maximumDistanceM: z.number().positive().optional(), childAge: z.number().min(0).max(18).optional(), facilityId: z.string().optional(), requiredService: z.string().optional(), maximumAmountEur: z.number().positive().optional(), bedrooms: z.number().int().positive().optional(), minimumDownloadMbps: z.number().positive().optional() }).strict().default({}),
  }).strict()).min(1).refine(v => new Set(v.map(x => x.id)).size === v.length, 'Duplicate criterion IDs'),
  radiusKm: z.number().positive().max(50).default(10),
}).strict();
export type DataRecord = z.infer<typeof recordSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
