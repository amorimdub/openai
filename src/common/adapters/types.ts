import type { CommonManifest, CommonRecord } from '../schema';

export type AdapterContext = { path: string; snapshotId: string };
export type AdapterRow =
  | { record: CommonRecord }
  | { excludedReason: string; locator: string }
  | { quarantineReason: string; locator: string };
export type ExtendedAdapter = {
  id: string; rawFolder: string; sourceId: string; scope: string;
  publisher: string; geography: string; observedPeriod: string | null;
  license: CommonManifest['license']; licenseEvidenceUrl: string; attribution: string;
  limitations: string[]; selectData(path: string): boolean; expectedCount?: number;
  rows(bytes: Uint8Array, context: AdapterContext): Iterable<AdapterRow> | AsyncIterable<AdapterRow>;
};
