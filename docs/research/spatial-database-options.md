# SQLite and PostgreSQL/PostGIS for the Ireland map

Research date: 2026-10-04. Research and design proposal only: no source data was parsed, no persistent database was modified, and no PostgreSQL service was provisioned for this investigation.

## Recommendation

For the **shared nationwide backend**, choose **PostgreSQL with PostGIS** when the schema is approved. The decisive requirement is reliable spatial querying across points, cycle-route lines and utility/administrative polygons, with explicit source versions and a public API. PostGIS supplies index-aware radius, intersection and containment operations; implementing equivalent semantics around plain JSON storage would create additional application work. This is an architectural judgement based on the required queries, not a benchmark result. [PostGIS spatial query documentation](https://postgis.net/docs/using_postgis_query.html)

For a **single-machine hackathon demo**, the existing Bun SQLite foundation is a sensible shortcut: add RTree bounding boxes and FTS5 town-name search, and initially serve selected point layers with clearly bounded queries. SQLite is not disqualified by national coverage or the raw download size. Its tradeoff is the spatial logic and deployment model, not a claim that it cannot hold these records. SQLite's own guidance supports an application server using local SQLite, while identifying multiple-server and high-write-concurrency cases as reasons to prefer a client/server database. [SQLite appropriate uses](https://sqlite.org/whentouse.html)

Do not use SpatiaLite as the default middle step merely to delay choosing PostGIS. It is a legitimate spatial SQLite option, but introduces native extension packaging into the Bun/macOS workflow. Choose it only if one portable spatial database file and offline SQL are product requirements, and validate the exact runtime/container first.

## What exists now

Observed in this repository, rather than inferred from vendor documentation:

- `src/store.ts` uses `bun:sqlite`. The default file is `data/ireland.prototype.sqlite` through `DB_PATH`, as documented in `docs/BACKEND.md`.
- Two tables hold canonical JSON documents and the current manifest per `(source_id, scope)`. The only declared record index is `(kind, category)`; the primary keys add ordinary indexes. There is no RTree, FTS5, PostGIS geometry column, historical snapshot archive or database-side spatial search.
- `Store.records()` loads and parses every matching JSON document. The existing API performs subsequent filtering in application code. Changing only the connection string to PostgreSQL would retain that full-scan design.
- The importer validates an entire canonical NDJSON snapshot before atomically replacing one source/scope. This is a useful seam to retain; loading 1.12 GB of untouched raw files directly through it is not supported or desirable.
- The version-1 record contract already separates `service`, `place`, `market_context`, `housing_information` and `utility_area`. It permits point, multipoint, line and polygon variants, and preserves unlocated facilities with null geometry. It does **not** represent all raw records: GTFS schedules and PPR transaction rows require dedicated models, or a reviewed derivation into narrower map/context records.
- The schema checks coordinate extent, ring closure and shape structure. These checks do not establish polygon topological validity, jurisdiction membership, genuine utility connection or a facility entrance.

An **in-memory-only capability probe** on the installed runtime observed Bun `1.4.0`, SQLite `3.54.0`, compile options `ENABLE_RTREE` and `ENABLE_FTS5`, and successful creation of an RTree virtual table and FTS5 virtual table. This confirms those two modules on this machine; it does not verify a future hosting runtime, SpatiaLite, realistic query performance or the complete production data.

## Comparison for this application

| Requirement | Bun SQLite + RTree/FTS5 | SQLite + SpatiaLite | PostgreSQL + PostGIS |
|---|---|---|---|
| Start from current prototype | Lowest setup cost | Native extension and spatial schema setup | Database service, extension and storage adapter |
| Town/name search | FTS5 prefix/token search | Same FTS5 option | Indexed text search; `pg_trgm` for substring/fuzzy matching |
| Viewport layer selection | RTree rectangle candidates, exact geometry filtering separately | Spatial functions plus spatial index | GiST geometry index and `ST_Intersects` |
| Point-radius/nearest | Rectangle candidates, then accurate distance in application code | Spatial distance functions; explicitly check CRS/units | Geography metres via `ST_DWithin`; indexed nearest-neighbour option |
| Exact point-in-polygon | Geometry engine/library must refine candidates | Spatial predicates | `ST_Covers` / `ST_Intersects`, including holes and multipart geometry |
| Boundary/statistic joins | Relational geography codes work well | Same | Same; spatial joins available where appropriate |
| Source provenance/history | Ordinary relational tables; requires new design | Same | Same; database does not create provenance automatically |
| Concurrency/hosting | Local durable disk, one writer at a time | Same, plus native dependencies | Network database service; multiple API processes can share it |
| Offline handover | Convenient local database artifact | Convenient if recipient has compatible extension | Raw/canonical snapshots remain portable; server required for queries |

Underlying capabilities: [SQLite RTree](https://sqlite.org/rtree.html), [FTS5](https://sqlite.org/fts5.html), [SQLite WAL](https://sqlite.org/wal.html), [SpatiaLite functions](https://gaia-gis.it/gaia-sins/spatialite-sql-latest.html), [PostGIS spatial indexing](https://postgis.net/documentation/faq/spatial-indexes/), [PostgreSQL trigram search](https://www.postgresql.org/docs/current/pgtrgm.html).

## Shared schema: a portable contract and queryable storage

The map renderer should consume **GeoJSON FeatureCollections**, regardless of database choice. GeoJSON uses WGS84 longitude/latitude coordinates, in that order; the source's original coordinate system belongs in provenance rather than a custom GeoJSON CRS. [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)

Proposed common model, to review before parsing:

| Entity | Fields that matter | Purpose |
|---|---|---|
| `source` | ID, publisher, source URL, licence identity/evidence, attribution, redistribution status | Identify a source and its permitted use; unknown terms remain explicit |
| `raw_asset` | Asset ID, source ID, original path/URL, SHA-256, bytes, fetched time, original CRS/encoding where known | Immutable evidence already collected; keep bulk bytes outside query tables |
| `snapshot` | Snapshot ID, source/scope, raw asset IDs, observed period, parser/schema versions, quality counts, validation result | Reproduce a normalized release and distinguish source date from fetch date |
| `feature_revision` | Snapshot ID, stable source record key, kind, category, name, nullable geometry, typed attributes, raw record locator, location status | Mappable point/line/polygon or explicitly unlocated service |
| `geography` | Boundary ID, publisher code, geographic type, name, boundary vintage, geometry | County, urban area, small area and supported market regions; preserve distinct systems |
| `market_observation` | Geography ID, period, buy/rent, statistic/definition, property type, bedroom class, EUR value, sample size, suppression, snapshot ID | Historical price/rent context; no manufactured house pin or listing availability |
| `housing_observation` | Project/source key, reporting period, stage, units, optional location/geography, snapshot ID | Government housing information, separate from eligibility and active inventory |
| `utility_observation` | Asset/area key, metric, reported/planned status, period, value/unit/definition, spatial/geography link, snapshot ID | Coverage percentages, supply zones, assets and plans without asserting household connection |
| `transit_feed` and child tables | Feed/snapshot ID; stops, routes, trips, stop times, calendars/exceptions, feed-local IDs | Preserve timetable relations for future transit queries; a map stop is a derived service feature, not the full timetable |
| `property_transaction` | Source row identity/locator, sale date, EUR consideration, recorded address/region, full-market/VAT/type flags, snapshot ID | Optional analytical staging for reviewed PPR statistics; absent coordinates stay absent, and transactions are not listings |
| `source_release` | Source/scope → accepted active snapshot | Publish a complete validated release atomically while keeping history |

The current discriminated JSON records remain useful **wire/export envelopes**. Relational child tables or typed indexed columns should represent fields used for filtering; category-specific details can remain validated JSON. In PostgreSQL, `jsonb` supports indexed querying but does not preserve original whitespace or object-key ordering. Original raw bytes and their hashes therefore remain the evidence archive. [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html)

The transit and property rows above are proposed domain extensions based on the collected source structures documented in this repo's transport and budget research. Do not force every GTFS stop-time or sale row into the existing five-kind record union. Import a reviewed stop layer separately from preserving the complete feed, and keep sale transactions separate from published area statistics. Raw archives can remain unparsed until those analytical capabilities are selected.

Use an internal integer feature key for SQLite RTree joins, and retain source identity separately. Define uniqueness as `(source_id, scope, external_id, snapshot_id)` for revisions; logical identity omits snapshot. Before preserving the current client ID `sourceId:externalId` globally, check that upstream IDs are unique across scopes. If not, introduce scope into the public identity with an explicit schema migration. Never silently deduplicate two sources merely because their coordinates/names are similar.

Budget joins should first use publisher geography codes plus boundary vintage. Rent regions, Eircode areas and towns are not interchangeable. A geographic crosswalk needs its own provenance and method; intersecting a region with a town does not make the region's price a town price. Unknown or suppressed values remain null. Polygon overlays belong to the source's reported statistical geography.

## Spatial indexes and query contracts

### SQLite option

Add scalar filter columns and an RTree keyed to a feature row, not just an unindexed geometry JSON property:

```sql
CREATE VIRTUAL TABLE feature_bbox
USING rtree(feature_rowid, min_lon, max_lon, min_lat, max_lat);

CREATE VIRTUAL TABLE place_search
USING fts5(name, aliases, county, prefix='2 3');
```

Maintain both indexes in the same import transaction, or use a tested external-content/triggers design. RTree finds bounding-box candidates; it does not by itself prove polygon containment or distance. Its default coordinate representation is 32-bit floating point with outward-rounded bounds, so use an overlap candidate query and exact refinement. Do not treat bounding-box matches as property-level utility coverage. [SQLite RTree](https://sqlite.org/rtree.html)

For radius queries, derive a conservative WGS84 candidate rectangle, then measure candidate point distances with a specified geodesic/spherical method. For polygon layers, perform an exact geometry intersection/containment step with a tested geometry implementation. For nearest queries, expand the search region until the distance to its boundary establishes that unseen points cannot be closer, or exhaust the dataset; returning the nearest point from an arbitrary fixed candidate count is insufficient. These are proposed application algorithms, not features supplied automatically by RTree.

FTS5 provides token and prefix matching, not arbitrary typo tolerance. Escape/construct the intended FTS expression from user text and parameterize SQL; do not expose the whole query language accidentally. Establish Irish/English aliases, accent behaviour and ordering as application rules. [SQLite FTS5](https://sqlite.org/fts5.html)

### Recommended PostGIS option

Illustrative storage, not a migration executed in this task:

```sql
CREATE EXTENSION postgis;
-- Geometry is nullable to preserve legitimate unlocated source records.
-- A feature_revision table additionally carries source/snapshot/kind fields.
ALTER TABLE feature_revision ADD COLUMN geom geometry(Geometry, 4326);
CREATE INDEX feature_geom_gist ON feature_revision USING gist (geom);
CREATE INDEX feature_geog_gist ON feature_revision USING gist ((geom::geography));
CREATE INDEX feature_filter ON feature_revision (snapshot_id, kind, category);
```

Limit the geography expression to accepted GeoJSON-compatible geometries; the proposed canonical schema has no curves. Separate point/polygon tables or partial indexes can be added after query-plan measurements justify them. GiST is the spatial access method; an ordinary B-tree geometry index does not substitute for it. [PostGIS spatial indexes](https://postgis.net/documentation/faq/spatial-indexes/)

Required query semantics:

| Operation | Proposed predicate/behaviour |
|---|---|
| Viewport | `ST_Intersects(geom, ST_MakeEnvelope(west,south,east,north,4326))`; return stable IDs, accepted snapshot and bounded/paged features |
| Radius in metres | `ST_DWithin(geom::geography, point4326::geography, radius_m)`; use the geography-expression index |
| Nearest recorded facility | Radius filter first, then `ORDER BY ST_Distance(geom::geography, point4326::geography), stable_id LIMIT n` for exact spheroidal ordering within the specified radius |
| Polygon area at a point | `ST_Covers(area.geom, point4326)`; boundary-inclusive, allow multiple overlapping areas and report ambiguity |
| Region context | Exact geography code/vintage joins to observation tables; resolve a point to a boundary only when its semantics match the requested statistic |
| Service-name search | Optional `pg_trgm` GIN/GiST index over an intentionally normalized search field; deterministic fallback for short queries |

`ST_DWithin` geography distances are metres and default to spheroid measurement. Geometry distances use the CRS units; raw EPSG:4326 geometry distance is angular, so `1000` is not one kilometre. EPSG:3857 display metres should not be treated as undistorted ground metres for scoring. If a local projected CRS is introduced, document its area of use and distortion and validate source transformations. `ST_Transform` changes coordinates; `ST_SetSRID` only labels the coordinates. [ST_DWithin](https://postgis.net/docs/ST_DWithin.html), [ST_Transform](https://postgis.net/docs/ST_Transform.html)

For an unbounded nearest query, PostGIS `<->` can use GiST in `ORDER BY`, but geography KNN measures a sphere whereas ordinary geography `ST_Distance` defaults to a spheroid. Declare which distance contract is used. Reranking a fixed KNN shortlist does not by itself guarantee globally exact spheroidal ordering. The bounded radius query above gives a clear exact contract without that shortcut. [PostGIS KNN operator](https://postgis.net/docs/geometry_distance_knn.html)

Use `ST_IsValid` in staging and quarantine invalid geometry with reasons; valid coordinate ranges and closed rings alone are insufficient. `ST_Covers` includes polygon boundaries and uses an available spatial index; do not run it on invalid geometry. A boundary point can belong to several neighbouring administrative polygons, so the API needs an explicit disambiguation rule rather than selecting the first row. [ST_IsValid](https://postgis.net/docs/ST_IsValid.html), [ST_Covers](https://postgis.net/docs/ST_Covers.html)

These operations measure geometry. A hospital distance is not a driving time; a water-source protection polygon is not a customer service area; a broadband statistic is not an address connection guarantee. Routing, clinical capability and actual household availability require separate evidence.

## Deployment and extension constraints

SQLite remains local storage behind Hono; users can access it through HTTP without accessing its file. With WAL, readers and a writer can operate concurrently, but there is still one writer, and WAL does not support a network filesystem shared between hosts. Use durable local storage and a deliberate snapshot/backup procedure; do not copy an active `.sqlite` file while omitting an uncheckpointed WAL. [SQLite WAL](https://sqlite.org/wal.html)

Bun exposes `Database.loadExtension`. On macOS its default Apple SQLite build disables extension loading; Bun documents selecting a custom SQLite dynamic library with `Database.setCustomSQLite` before opening databases. RTree and FTS5 on this machine worked without loading an external extension, but that does not establish SpatiaLite availability. [Bun SQLite](https://bun.com/docs/runtime/sqlite), [Bun loadExtension reference](https://bun.com/reference/bun/sqlite/Database/loadExtension)

SpatiaLite supplies geometry metadata, spatial SQL and `CreateSpatialIndex`; `mod_spatialite` must be packaged together with compatible native dependencies including GEOS and PROJ. Its documentation distinguishes the loadable module from the library and calls out dependency resolution. A deployment must prove successful loading, CRS transformation, predicates and spatial-index use on its actual architecture. No such validation was performed here. [SpatiaLite module deployment](https://gaia-gis.it/fossil/libspatialite/wiki?name=Lodable+Modules+in+5.0), [SpatiaLite SQL reference](https://gaia-gis.it/gaia-sins/spatialite-sql-latest.html)

PostgreSQL hosting must specifically provide PostGIS binaries and permission to enable the extension; a generic PostgreSQL connection does not establish that. Verify `pg_available_extensions`, enable only the needed extension, and record `PostGIS_Full_Version()`. Bun's native SQL client supports PostgreSQL, pooling, parameterized queries and transactions, so Hono/Bun need not change. PostGIS-dependent spatial SQL will be a separate storage adapter. [PostGIS getting started](https://postgis.net/documentation/getting_started/), [Bun SQL](https://bun.com/docs/runtime/sql)

PostgreSQL uses MVCC snapshots to allow concurrent access; imports should stage and validate new rows before a short transaction changes the source-release pointer. Neither engine removes the need for a consistent multi-source release definition or careful transaction boundaries. [PostgreSQL MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html)

## Next bounded implementation task after the decision

1. Approve the canonical envelope, typed observations, geography identities and provenance/quality fields; keep map output GeoJSON and display-only simplified geometry distinct from analytical geometry.
2. Implement parsers against frozen raw assets for a thin first slice: towns, schools/childcare, hospitals and parks; preserve unlocated/quarantined records and source counts. Add transport, utilities and budget using their correct observation shapes rather than forcing every row into a point.
3. Replace `Store.records()` as the query seam with `searchPlaces`, `featuresInViewport`, `featuresWithinRadius`, `nearestFacilities`, `areasAtPoint`, `marketContext` and `sourceStatus`. Both storage adapters return the same contract and stable snapshot identifiers. The assessment engine should use this seam rather than load the entire corpus.
4. Implement indexed Hono search/layer routes with limit/cursor, selected categories/criteria, evidence coverage and snapshot IDs. A `truncated` layer is not an exhaustive nearest/assessment result.
5. Validate boundary holes, multipart shapes, edge points, unlocated services, metre thresholds, source replacement/rollback and suppressed market data; inspect query plans and measure representative nationwide queries. No database performance threshold is claimed before that work.

Preserving versioned canonical NDJSON plus the immutable raw archive makes a later SQLite-to-PostGIS migration reproducible. Engine-specific indexes and queries will still require implementation; portable JSON alone does not make that migration zero-effort. Basemap tiles, map rendering and routing are separate choices from this database decision.
