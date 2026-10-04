CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS common_snapshots (
 snapshot_id text PRIMARY KEY,
 source_id text NOT NULL,
 scope text NOT NULL,
 manifest jsonb NOT NULL,
 data_hash text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id, scope, snapshot_id)
);
CREATE TABLE IF NOT EXISTS common_active (
 source_id text NOT NULL,
 scope text NOT NULL,
 snapshot_id text NOT NULL REFERENCES common_snapshots(snapshot_id),
 PRIMARY KEY(source_id,scope)
);
CREATE TABLE IF NOT EXISTS common_records (
 snapshot_id text NOT NULL REFERENCES common_snapshots(snapshot_id),
 id text NOT NULL,
 source_id text NOT NULL,
 scope text NOT NULL,
 kind text NOT NULL,
 category text NOT NULL,
 name_normalized text NOT NULL,
 geometry geometry(Geometry,4326),
 record jsonb NOT NULL,
 PRIMARY KEY(snapshot_id,id),
 CHECK(geometry IS NULL OR (ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry)))
);
CREATE INDEX IF NOT EXISTS common_records_geometry_gist ON common_records USING gist(geometry);
CREATE INDEX IF NOT EXISTS common_records_geography_gist ON common_records USING gist((geometry::geography));
CREATE INDEX IF NOT EXISTS common_records_filter_idx ON common_records(snapshot_id,kind,category,id);
CREATE INDEX IF NOT EXISTS common_records_source_idx ON common_records(source_id,scope,snapshot_id);
CREATE INDEX IF NOT EXISTS common_records_name_trgm ON common_records USING gin(name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS common_records_market_idx ON common_records ((record->'attributes'->'geography'->>'codeSystem'),(record->'attributes'->'geography'->>'code'),category) WHERE kind='market_context';

CREATE INDEX IF NOT EXISTS common_records_context_idx ON common_records ((record->'attributes'->'geography'->>'codeSystem'),(record->'attributes'->'geography'->>'code'),category,id) WHERE geometry IS NULL AND kind IN ('utility_observation','housing_information','property_transaction','service','infrastructure');
-- Categories must be selective before costly exact geography operations.
CREATE INDEX IF NOT EXISTS common_records_category_located_idx ON common_records(category,kind,snapshot_id,id) WHERE geometry IS NOT NULL;
