# Implement common records and indexed searches from the frozen Ireland sources

Type: task
Labels: wayfinder:task
Status: resolved
Assignee: root
Parent: ../map.md
Blocked by:

## Question

The user's “next” advances the recommended common-schema and indexed-search slice. Implement versioned raw-to-canonical parsers, a PostgreSQL/PostGIS loader and query adapter, and Hono town/viewport/radius/area/context/layer endpoints. Representative sources: towns, childcare, clubs, council parks, ComReg polygons and CSO price context. Preserve original downloads and the legacy SQLite prototype. Account for other sources explicitly as deferred/reuse-gated. Verify real source transformations and real PostGIS query/import behavior. Frontend and travel-time/availability ranking remain outside this slice.

## Resolution — 4 October 2026

Implemented and verified the representative slice in native Apple macOS containers. Version-2 shared NDJSON/JSON Schemas retain source identity, raw locators, periods, units and unknown values. Normalization atomically maintains the run index; PostGIS verifies hashes and publishes immutable source/scope snapshots transactionally.

Published **83,620 records across seven scopes**: towns 867; childcare 5,075; clubs 8,496; DCC parks 90; ComReg counties 25 and small areas 18,919; CSO HPM05 purchase-price observations 50,148. One Meath county polygon is explicitly quarantined for verified self-intersection, bound to the frozen source/geometry hashes; raw data was not repaired. All 39 raw groups are represented in the adapter registry.

Hono API runs at http://127.0.0.1:3080; native containers are `ireland-map-api` and `ireland-map-postgis`, with persistent database volume and loopback ports. Indexed town/viewport/radius/area/market searches and flexible preference layers are implemented. Scores remain null and rankingReady false; remaining source parsers, routing, scoring, frontend map and public deployment are outside this completed slice.

Verification: **35 tests passed, 203 assertions**, including isolated real PostGIS tests; typecheck passed. Ten real HTTP checks passed. CRS crosschecks matched independent PostGIS transforms; spatial EXPLAIN used GiST indexes; all active geometries are valid. All 518 raw files/1,119,838,617 bytes matched the acquisition baseline unchanged.

Evidence: [live API](../../../docs/research/common-api-live-verification.json), [PostGIS](../../../docs/research/common-postgis-verification.json), [raw preservation](../../../docs/research/raw-post-normalization-integrity.json). [Run instructions](../../../README.md), [common schema](../../../docs/COMMON-SCHEMA.md), [API contract](../../../docs/COMMON-API.md).
