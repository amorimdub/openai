import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { manifestSchema, recordSchema, type DataRecord, type Manifest } from './schema';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class Store {
  readonly db: Database;
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS snapshots(source_id TEXT NOT NULL, scope TEXT NOT NULL, manifest TEXT NOT NULL, PRIMARY KEY(source_id,scope));
      CREATE TABLE IF NOT EXISTS records(source_id TEXT NOT NULL, scope TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, category TEXT, document TEXT NOT NULL, PRIMARY KEY(source_id,scope,id), FOREIGN KEY(source_id,scope) REFERENCES snapshots(source_id,scope));
      CREATE INDEX IF NOT EXISTS records_kind_category ON records(kind,category);`);
  }
  // All validation finishes before mutation; source/scope replacement commits as one transaction.
  import(text: string, input: unknown) {
    const manifest = manifestSchema.parse(input);
    if (sha256(text) !== manifest.sha256) throw new Error('Snapshot checksum mismatch');
    const records = text.split('\n').filter(line => line.trim()).map(line => recordSchema.parse(JSON.parse(line)));
    if (records.length !== manifest.recordCount) throw new Error('Snapshot record count mismatch');
    if(manifest.dataQuality && (manifest.dataQuality.recordsWithGeometry!==records.filter(r=>r.geometry!==null).length || manifest.dataQuality.recordsWithoutGeometry!==records.filter(r=>r.geometry===null).length)) throw new Error('Snapshot geometry quality counts mismatch');
    const ids = new Set<string>();
    for (const record of records) {
      if (record.sourceId !== manifest.sourceId || record.scope !== manifest.scope) throw new Error('Record source/scope differs from manifest');
      if (record.id !== `${record.sourceId}:${record.externalId}`) throw new Error('Record ID must namespace external ID by source');
      if (ids.has(record.id)) throw new Error('Duplicate record ID');
      ids.add(record.id);
    }
    this.db.transaction(() => {
      this.db.query('DELETE FROM records WHERE source_id=? AND scope=?').run(manifest.sourceId, manifest.scope);
      this.db.query('INSERT INTO snapshots VALUES (?,?,?) ON CONFLICT(source_id,scope) DO UPDATE SET manifest=excluded.manifest').run(manifest.sourceId, manifest.scope, JSON.stringify(manifest));
      const insert = this.db.query('INSERT INTO records VALUES (?,?,?,?,?,?)');
      for (const record of records) insert.run(record.sourceId, record.scope, record.id, record.kind, 'category' in record ? record.category : null, JSON.stringify(record));
    })();
    return { snapshotId: manifest.snapshotId, imported: records.length, sourceId: manifest.sourceId, scope: manifest.scope };
  }
  records(kind?: DataRecord['kind'], category?: string): DataRecord[] {
    const query = 'SELECT document FROM records WHERE (? IS NULL OR kind=?) AND (? IS NULL OR category=?) ORDER BY source_id,scope,id';
    return (this.db.query(query).all(kind ?? null,kind ?? null,category ?? null,category ?? null) as {document:string}[]).map(row => JSON.parse(row.document));
  }
  manifests(): Manifest[] {
    return (this.db.query('SELECT manifest FROM snapshots ORDER BY source_id,scope').all() as {manifest:string}[]).map(row => JSON.parse(row.manifest));
  }
  close() { this.db.close(); }
}
