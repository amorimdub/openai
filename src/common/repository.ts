import type { Bbox, CommonManifest, CommonRecord } from './schema';

export type Origin = { longitude: number; latitude: number };
export type Page<T> = { records: T[]; nextCursor: string | null; snapshotIds: string[] };
export type FeatureQuery = {
  bbox?: Bbox; near?: Origin & { radiusM: number }; categories?: string[];
  kinds?: CommonRecord['kind'][]; limit: number; cursor?: string;
};
export type FeatureMatch = { record: CommonRecord; distanceM?: number };
export type MarketQuery = {
  geographyCode: string; geographyCodeSystem: string; tenure?: 'buy'|'rent'; period?: string;
  propertyType?: string; bedroomClass?: string; bedrooms?: number; limit: number; cursor?: string;
};
export type ContextQuery = {categories?:string[];geographyCode?:string;geographyCodeSystem?:string;limit:number;cursor?:string};
export interface CommonRepository {
  initialize(): Promise<void>;
  importFile(filePath: string): Promise<{snapshotId:string; sourceId:string; scope:string; imported:number; unchanged:boolean}>;
  status(): Promise<{recordCount:number; sources:CommonManifest[]}>;
  searchPlaces(q: string, limit: number, cursor?: string): Promise<Page<CommonRecord>>;
  features(query: FeatureQuery): Promise<Page<FeatureMatch>>;
  areasAtPoint(point: Origin, categories: string[] | undefined, limit: number, cursor?: string): Promise<Page<FeatureMatch>>;
  marketContext(query: MarketQuery): Promise<Page<CommonRecord>>;
  placeAnchor?(placeId:string):Promise<{place:CommonRecord;longitude:number;latitude:number}|null>;
  contextRecords(query:ContextQuery):Promise<Page<CommonRecord>>;
  close(): Promise<void>;
}
export class QueryError extends Error {
  constructor(message: string, readonly status: 400|409 = 400) { super(message); }
}
