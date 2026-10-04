# Local PostGIS storage

The current common-schema backend uses native Bun SQL and PostgreSQL/PostGIS. It stores immutable canonical records and manifests, then publishes a source/scope snapshot by atomically updating an active pointer. Older snapshots remain available for audit; queries only join active snapshots. Reimporting an identical snapshot is a no-op and does not reactivate an older release. Reusing a snapshot ID for different content or metadata is rejected.

## Native macOS containers

Apple's `container` runtime is the supported local setup for this machine. Start with:

```sh
scripts/postgis-container-start.sh
export DATABASE_URL=postgres://ireland@127.0.0.1:55439/ireland
bun run src/common/import-cli.ts data/canonical/<source>/<snapshot>/records.ndjson
```

The database container is named `ireland-map-postgis`; its managed Linux volume is `ireland-map-postgis-data`. The official `postgis/postgis:17-3.5` image is amd64 and runs using Apple's Rosetta support. The image downloaded on 2026-10-04 has digest `sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`, PostgreSQL 17.5 and PostGIS 3.5.2. The dedicated volume uses a PGDATA subdirectory to avoid the ext4 mount's `lost+found` directory. No existing containers or volumes are modified.

The host port is bound to 127.0.0.1:55439. Local development uses trust authentication and must not be published externally. Another native container can reach PostgreSQL at the database container's private address on port5432; inspect its address after recreation rather than hardcoding it. No raw-data mount is needed for API queries.

To stop and resume while preserving data:

```sh
container stop ireland-map-postgis
container start ireland-map-postgis
```

`compose.yaml` is an optional Docker-compatible alternative, not the runtime used for this delivery. Do not run both against the same host port.

## Import safeguards

The importer reads `<file>.manifest.json`, accepts only approved reuse, verifies canonical SHA-256, verifies every referenced original asset's size/hash under `data/raw` (override with `RAW_ROOT`), validates every record against the version2 schema, checks source/scope/snapshot identity, referenced raw asset path and existing native feature/cube/NaPTAN/CSV/XLSX/GeoPackage/ZIP/OSM locator, unique stable IDs, record totals and unlocated totals. These checks happen before the publication transaction.

It stages inserts in batches of100 records, validates geometry topology and non-empty geometry with database constraints, checks staged totals and rechecks the canonical hash before publishing. A failed insert or validation rolls back the snapshot and its records; the previous active release remains available. A source/scope advisory lock serializes concurrent publications. Null locations remain stored without appearing in spatial results.

Queries use GiST indexes on geometry and geography, typed source/category indexes, pg_trgm normalized-name indexes and an exact market geography index. Radius results use `ST_DWithin` and `ST_Distance` on geography in metres. Area membership uses boundary-inclusive `ST_Covers`, including multipart polygons and holes; a statistical broadband polygon remains an area observation, not a household service guarantee.

Pagination uses distance/id ordering for radius searches and stable ID ordering otherwise. A cursor binds its query parameters and the active snapshot set. A changed query returns400; changed data returns409 so clients restart pagination. A repeatable-read transaction makes snapshot metadata and returned records consistent. Repository query limits are 1–1000; the public API limits pages to 250. Compact version-2 cursors bind a hash of the active snapshot set, keeping tokens bounded across 41 scopes. Nonspatial context uses an exact geography index. This phase has no travel-time routing engine or approved overall ranking.

## Verification

Actual database tests create a unique disposable database, then remove only that test database. They never alter the imported application dataset:

```sh
POSTGIS_TEST_URL=postgres://ireland@127.0.0.1:55439/ireland bun test src/common/postgis.test.ts
```

The integration suite verifies import idempotency, replacement/history, collision and licence/hash/duplicate guards, topology rollback, radius units and ordering, cursor binding and staleness, polygon boundaries/holes, accent-normalized place searches, and exact market geography/period/property/bedroom filters. Tests are explicitly skipped when POSTGIS_TEST_URL is absent.

References: [Bun SQL](https://bun.sh/docs/runtime/sql), [official PostGIS image](https://hub.docker.com/r/postgis/postgis/), [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html), [PostGIS ST_Covers](https://postgis.net/docs/ST_Covers.html).

Expanded release: [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md), [independent database acceptance](research/expanded-postgis-verification.json).
