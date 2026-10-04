# Should the common Ireland dataset use SQLite or PostgreSQL/PostGIS?

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: spatial_database_research
Parent: ../map.md
Blocked by:

## Question

Compare existing Bun native SQLite JSON storage with SQLite RTree/FTS/SpatiaLite and PostgreSQL/PostGIS for nationwide points, lines, polygons, viewport/radius search, nearest facilities, point-in-polygon utilities, budget geography joins and source-version imports. Verify runtime/extension deployment support and spatial units/index semantics using official sources. Recommend hackathon and expansion choices with concrete schema/index/query contracts, migration seam and limits. Research only; do not change storage or import raw records.

## Answer

Recommend PostgreSQL + PostGIS for the full stated nationwide multi-vertical backend. It supplies exact, indexed polygon area-context operations and metre radius queries while retaining Hono/Bun. Existing Bun SQLite is useful for a quick point/viewport demo; RTree + FTS5 are confirmed available on this machine, but application geometry predicates would still be needed. SpatiaLite is viable for an offline spatial file product, with native extension packaging and runtime checks, rather than the default next step.

Current source audit found canonical JSON storage with ordinary kind/category indexes, source/scope atomic replacement and no spatial/text index/history. Proposed common schema keeps source/snapshot provenance, geometries, geography identities and typed budget/utility observations separate; GTFS schedules and PPR transactions need explicit domain extensions. No persistent storage edits, parsing or imports were performed.

Report: [spatial-database-options.md](../../../docs/research/spatial-database-options.md). The report includes primary documentation links, local in-memory capability evidence, index/query contracts and migration/deployment limits.
