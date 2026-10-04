import { z } from 'zod';
import { geometrySchema } from '../schema';

const identifier = z.string().min(1).max(1000);
const nullableText = z.string().nullable();
export const geographyReferenceSchema = z.object({
  code: identifier, codeSystem: identifier, type: identifier, name: identifier,
  vintage: nullableText,
}).strict();
export const rawAssetSchema = z.object({
  path: z.string().min(1).refine(p => !p.startsWith('/') && !p.split(/[\\/]/).includes('..'), 'Raw asset paths must be relative'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative(),
}).strict();
const base = {
  version: z.literal(2), id: identifier, externalId: identifier, sourceId: identifier,
  scope: identifier, snapshotId: identifier, name: z.string().min(1),
  raw: z.object({ path: rawAssetSchema.shape.path, locator: identifier }).strict(),
  observedPeriod: nullableText, sourceModifiedAt: z.iso.datetime({offset:true}).optional(), sourceVersion: z.number().int().positive().optional(),
};
const located = {
  geometry: geometrySchema.nullable(), locationStatus: z.enum(['located', 'unlocated']),
};
export const commonRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, ...located, kind: z.literal('service'), category: identifier,
    geometryMeaning: z.literal('recorded_location'),
    attributes: z.object({
      address: z.string().optional(), county: z.string().optional(), eircode: z.string().optional(),
      access: z.enum(['public','private','unknown']), serviceType: z.string().optional(),
      schoolLevel: z.string().optional(), programmes: z.array(z.string()).optional(),
      activity: z.string().optional(), affiliation: z.string().optional(),
    }).strict(),
  }).strict(),
  z.object({ ...base, kind: z.literal('place'), category: identifier,
    geometry: geometrySchema, locationStatus: z.literal('located'), geometryMeaning: z.literal('statistical_boundary'),
    attributes: z.object({ geography: geographyReferenceSchema, county: z.string().optional(), aliases: z.array(z.string()) }).strict(),
  }).strict(),
  z.object({ ...base, kind: z.literal('utility_area'), category: identifier,
    geometry: geometrySchema, locationStatus: z.literal('located'), geometryMeaning: z.enum(['statistical_boundary','source_protection_boundary','reported_area']),
    attributes: z.object({ geography: geographyReferenceSchema, status: z.enum(['reported','planned','unknown']),
      definition: z.string().min(1), metrics: z.array(z.object({
        key: identifier, value: z.number().finite().nullable(), unit: identifier,
        status: z.enum(['reported','planned','unknown']), sourceValue: z.union([z.string(),z.number(),z.null()]),
        definition: z.string().min(1),
      }).strict()),
    }).strict(),
  }).strict(),
  z.object({ ...base, ...located, kind: z.literal('infrastructure'), category: identifier,
    geometryMeaning: z.literal('infrastructure_asset'),
    attributes: z.object({ assetType: identifier, status: z.literal('unknown'), definition: identifier,
      street: z.string().optional(), county: z.string().optional(), operator: z.string().optional(),
      issues: z.array(z.string()).optional(), sourceCode: z.string().optional(),
    }).strict(),
  }).strict(),
  z.object({ ...base, kind: z.literal('utility_observation'), category: identifier,
    geometry: z.null(), locationStatus: z.literal('unlocated'), geometryMeaning: z.literal('nonspatial_observation'),
    attributes: z.object({ geography: geographyReferenceSchema, supplyCode: identifier, supplyName: identifier,
      localAuthority: identifier, population: z.number().int().nonnegative().nullable(),
      definition: identifier, status: z.literal('reported'),
    }).strict(),
  }).strict(),
  z.object({ ...base, ...located, kind: z.literal('housing_information'), category: z.literal('government_projects'),
    geometryMeaning: z.enum(['recorded_location','nonspatial_observation']),
    attributes: z.object({ geography: geographyReferenceSchema, localAuthority: identifier, schemeName: identifier,
      units: z.number().int().nonnegative().nullable(), status: identifier, period: identifier, definition: identifier,
      fundingProgramme: z.string().optional(), deliveryMethod: z.string().optional(),
    }).strict(),
  }).strict(),
  z.object({ ...base, kind: z.literal('property_transaction'), category: z.literal('property_transactions'),
    geometry: z.null(), locationStatus: z.literal('unlocated'), geometryMeaning: z.literal('nonspatial_observation'),
    attributes: z.object({ geography: geographyReferenceSchema, saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amountEur: z.number().finite().nonnegative(), address: identifier, eircode: z.string().optional(), county: identifier,
      nonMarketPrice: z.boolean().nullable(), vatExcluded: z.boolean().nullable(), dwellingDescription: z.string(),
      sizeDescription: z.string().optional(), definition: identifier,
    }).strict(),
  }).strict(),
  z.object({ ...base, kind: z.literal('market_context'), category: z.enum(['buy','rent']),
    geometry: z.null(), locationStatus: z.literal('unlocated'), geometryMeaning: z.literal('nonspatial_observation'),
    attributes: z.object({ geography: geographyReferenceSchema, tenure: z.enum(['buy','rent']),
      statistic: z.enum(['mean','median','standardised_mean']), amountEur: z.number().finite().nonnegative().nullable(),
      unit: z.enum(['EUR','EUR/month']), period: identifier,
      propertyType: z.enum(['house','apartment','all','unknown']), propertyTypeLabel: z.string(),
      bedroomClass: z.string().nullable(), bedrooms: z.number().int().nonnegative().nullable(),
      sampleSize: z.number().int().nonnegative().nullable(),
      observationStatus: z.enum(['reported','missing','suppressed','source_zero_unverified']),
      sourceValue: z.number().finite().nullable(), definition: z.string().min(1),
      dimensions: z.record(z.string(), z.string()),
    }).strict(),
  }).strict(),
]).superRefine((r, c) => {
  if ((r.geometry !== null) !== (r.locationStatus === 'located')) c.addIssue({code:'custom',message:'Geometry and location status disagree'});
  if (r.id !== commonRecordId(r.sourceId, r.scope, r.externalId)) c.addIssue({code:'custom',message:'Record ID must include source, scope and encoded external ID'});
  if (r.kind === 'market_context') {
    if (r.category !== r.attributes.tenure) c.addIssue({code:'custom',message:'Market category and tenure disagree'});
    if (r.attributes.observationStatus !== 'reported' && r.attributes.amountEur !== null) c.addIssue({code:'custom',message:'Unreported observations must have null amounts'});
    if (r.attributes.unit !== (r.attributes.tenure === 'buy' ? 'EUR' : 'EUR/month')) c.addIssue({code:'custom',message:'Market units must match tenure'});
  }
});

export function commonRecordId(sourceId: string, scope: string, externalId: string): string {
  return [sourceId, scope, externalId].map(encodeURIComponent).join(':');
}
export const commonManifestSchema = z.object({
  version: z.literal(2), snapshotId: identifier, sourceId: identifier, scope: identifier,
  publisher: z.string().min(1), sourceUrl: z.url(),
  license: z.enum(['CC-BY-4.0','CC0-1.0','CC-BY-SA-4.0','ODbL-1.0','public-domain','custom-reuse','unverified']),
  licenseEvidenceUrl: z.url(), attribution: z.string().min(1),
  reuseStatus: z.enum(['approved','unverified','restricted']),
  fetchedAt: z.iso.datetime({offset:true}), observedPeriod: nullableText,
  geography: z.string().min(1), coverage: z.enum(['partial','unknown']), limitations: z.array(z.string()),
  adapter: z.object({ id: identifier, version: identifier }).strict(),
  rawAssets: z.array(rawAssetSchema).min(1),
  recordCount: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/), format: z.literal('ndjson'),
  quality: z.object({ inputRecords: z.number().int().nonnegative(), acceptedRecords: z.number().int().nonnegative(),
    quarantinedRecords: z.number().int().nonnegative(), unlocatedRecords: z.number().int().nonnegative(),
    excludedRecords: z.number().int().nonnegative(), exclusions: z.record(z.string(),z.number().int().nonnegative()),
  }).strict(),
}).superRefine((m,c) => {
  if (m.recordCount !== m.quality.acceptedRecords) c.addIssue({code:'custom',message:'Manifest accepted count differs from record count'});
  if (m.quality.unlocatedRecords > m.recordCount) c.addIssue({code:'custom',message:'Unlocated count exceeds records'});
  if (m.quality.inputRecords !== m.quality.acceptedRecords + m.quality.quarantinedRecords + m.quality.excludedRecords) c.addIssue({code:'custom',message:'Input records must be fully accounted for'});
  if (m.reuseStatus === 'approved' && m.license === 'unverified') c.addIssue({code:'custom',message:'Unverified licence cannot be approved'});
  if (new Set(m.rawAssets.map(a=>a.path)).size !== m.rawAssets.length) c.addIssue({code:'custom',message:'Duplicate raw assets'});
});
export type CommonRecord = z.infer<typeof commonRecordSchema>;
export type CommonManifest = z.infer<typeof commonManifestSchema>;

export const bboxSchema = z.tuple([z.number().min(-11).max(-5),z.number().min(51).max(56),z.number().min(-11).max(-5),z.number().min(51).max(56)])
  .refine(b=>b[0]<b[2] && b[1]<b[3], 'bbox must be west,south,east,north with positive area');
export type Bbox = z.infer<typeof bboxSchema>;
