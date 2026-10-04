# Common data model, map and spatial search: next-stage proposal

Researched and inspected on **4 October 2026**. The investigation below preceded implementation. The user subsequently advanced the common-schema/PostGIS slice and requested native macOS containers: [current schema](COMMON-SCHEMA.md), [API](COMMON-API.md), [operations](POSTGIS.md). The representative slice is implemented; remaining parsers and scoring are still open.

## Recommendation

For the stated **all-Ireland, five-vertical backend**, use **Hono + Bun + PostgreSQL/PostGIS**, with **MapLibre GL JS** consuming bounded GeoJSON map layers. Keep the raw archive and versioned canonical NDJSON independent of both database and map renderer.

MapLibre offers built-in clustering and a direct transition to vector tiles. Leaflet requires less setup for a small town-and-points demo, but MapLibre is the recommended default for the nationwide application. These effort ratings are engineering judgments, not measured benchmarks. [Map comparison and primary references](research/map-renderer-options.md), [MapLibre cluster example](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/).

PostGIS provides indexed viewport, radius and polygon queries. SQLite can store the data and remains the simplest self-contained demo option; adding RTree supplies bounding-box candidates, while accurate polygon predicates still need another geometry implementation. For the full requested area-context queries, PostGIS avoids that additional application work. No claim is made that the 1.12 GB raw archive is too large for SQLite. [Database comparison and primary references](research/spatial-database-options.md), [PostGIS spatial queries](https://postgis.net/docs/using_postgis_query.html), [SQLite RTree](https://sqlite.org/rtree.html).

The renderer, basemap, database and routing engine are independent choices. A separate basemap provider/style is needed; no paid account or API key has been selected. The OSM PBF is original geographic data, not a styled basemap. Public OSM raster tiles prohibit offline/prefetch downloads. Hospital/GP travel-time checks require a routing engine later. [Map research](research/map-renderer-options.md), [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).

## What already exists

Inspected `src/schema.ts`, `src/store.ts`, `src/app.ts` and the existing local database. Read-only SQLite queries and in-process Hono HTTP requests confirmed the following. This is local implementation evidence, not a deployed-network check.

| Existing component | Verified state |
|---|---|
| Database | `data/ireland.prototype.sqlite`, Bun native SQLite; observed SQLite 3.54.0 |
| Imported records | 867 CSO urban-area/place records; no imported service, utility or market records |
| `GET /places?q=dublin` | 200; returns Dublin city and suburbs. Town-name substring search, up to 100 results; no address geocoder |
| `GET /criteria` | 200; 24 registered criteria; requests accept one or more distinct choices |
| `GET /data-status` | 200; reports the imported source and 867 records |
| `POST /layers` | 200 for a valid two-criterion request; GeoJSON containers exist, but service data is not loaded |
| `POST /assess` | 200 for a valid request; missing evidence remains unknown, ranking is not approved |
| `GET /market-context?placeId=...` | 200; empty for Dublin because no market snapshot has been imported |
| General geographic feature search | No viewport/bbox endpoint, indexed nearest-facility endpoint or tile endpoint yet |
| Storage indexes | Ordinary source/ID/kind/category indexes; no spatial or text-search index |

The local API binds to loopback when started. It has no published API, authentication or routing service. Current search/layer methods load JSON records and filter in application code. PostgreSQL adoption therefore needs a query adapter, not just a different connection string. See [existing backend contract](BACKEND.md).

## The common schema to define next

Use a **shared versioned envelope with typed data**, rather than forcing every source into a point. The current version-1 schema already covers services, places, utility areas, market context and housing information; it needs extensions before all source types can be represented faithfully.

| Model | Examples | Geometry / relationship |
|---|---|---|
| Service feature | School, childcare, hospital, GP, club, community centre, shop, stop, airport | Point/other supplied geometry, or explicitly unlocated |
| Geographic/infrastructure feature | Park, cycle line, lamp, town/county/small-area boundary | Point, line or polygon; retain what the geometry means |
| Utility observation/directory | Broadband percentage, planned rollout, named supply, source-protection catchment | Area or asset link when supplied; directories may be nonspatial |
| Market observation | Published median/mean price or monthly rent | Geography code/vintage + period + metric/units; no invented home pin |
| Housing observation | Construction project stage and unit count | Optional verified geometry/geography; no availability inference |
| Transit feed and child tables | Stops, routes, trips, stop times, calendars and exceptions | Relational feed-local IDs; a map stop is a derived service feature |
| Property transaction | Original PPR sale date, amount, address and source flags | Optional verified location/region; distinct from statistics and listings |
| Source / raw asset / snapshot / release | Publisher, licence, original file hash, parser version, active validated snapshot | Provenance for every derived record and query result |

Shared fields should include schema version, stable source-scoped record ID, kind/category, name where applicable, source/snapshot reference, raw file and record locator, location status, typed attributes and explicit unknowns. Observation period and fetch time are different fields. Numeric measures retain units, suppression and denominators; a suppressed value is not zero. Query results identify their accepted source snapshots and criterion-configuration version.

Map output is a standard **GeoJSON FeatureCollection** using WGS84 `[longitude, latitude]`. NDJSON remains the streamable canonical file format; PostgreSQL stores queryable typed columns, geometry and JSONB details. Transform source CRS coordinates during parsing, retaining native CRS in provenance. Do not merely relabel metres as degrees. [GeoJSON standard](https://www.rfc-editor.org/rfc/rfc7946), [GDAL coordinate transformation](https://gdal.org/en/stable/programs/ogr2ogr.html), [GDAL GeoJSON RFC7946 output](https://gdal.org/en/stable/drivers/vector/geojson.html).

Preserve these distinctions:

- Display geometry can be simplified; analytical geometry retains its own validity and meaning.
- A water catchment is not a customer supply boundary, and a broadband area percentage is not household orderability.
- Towns, counties, small areas and rent/Eircode regions need publisher-code/vintage crosswalks; names alone are insufficient.
- Every raw source gets a parser plan or explicit quarantine/deferred status. Unverified school/Tusla reuse and restricted ESB material cannot silently become publishable data.
- Duplicate source records retain provenance; cross-source deduplication is a reviewed operation, not a nearest-name guess.
- User criteria and weights belong to preferences/configuration, not permanent scores attached to a service record.

## Search and layer contract to implement after schema review

Keep the existing `/places`, `/criteria`, `/data-status`, `/layers` and `/assess` responsibilities. Add indexed search behind the API:

| Query | Proposed behavior |
|---|---|
| Town search | Indexed names and aliases with stable place IDs; keep `/places?q=...` |
| Map features | New `GET /features?bbox=west,south,east,north&categories=...&limit=...&cursor=...`, or equivalent viewport parameters on `/layers`; choose one contract during review |
| Preference-selected layers | `/layers` accepts any selected criterion count, viewport/zoom and optional anchor; returns relevant layers, source metadata and explicit pagination/truncation |
| Nearby facilities | Radius in metres, category/verified suitability filters, deterministic distance ordering; separate from map display limits |
| Area context | Polygon-at-point lookup plus correctly matched geography observations; return overlapping/ambiguous areas explicitly |
| Assessment | Uses complete matching evidence through indexed queries; never scores only the first displayed page |

Use GiST spatial indexes, metre-based geography distances and indexed polygon predicates in the PostGIS adapter. Preserve unlocated records as nonspatial information. SQL geometry queries do not provide driving/public-transport minutes. Query performance needs measurement against the normalized dataset; no capacity or latency benchmark has been performed. [Spatial database proposal](research/spatial-database-options.md).

## Next implementation task

**Finalize the versioned common schema and build one reproducible raw-to-canonical-to-indexed-search slice.**

1. Review the models above, database choice and search response contract. Export updated JSON Schemas; retain a migration/version policy for the existing prototype.
2. Define an adapter manifest for every collected source: input hashes, parser version, CRS, category mappings, expected counts, reuse status and deferred/quarantine reasons.
3. Implement a representative slice using existing frozen originals: CSO towns, Pobal childcare, Sport Ireland clubs, one council park dataset, ComReg small-area context and one CSO/RTB market table. This exercises point, polygon and nonspatial observations without claiming every dataset is already parsed.
4. Write canonical NDJSON and validation/quarantine reports, leaving originals intact. Stage records in the chosen database and atomically publish validated source releases.
5. Implement indexed place/viewport/radius/context queries and connect existing Hono routes to them. Verify CRS, polygon holes/boundaries, stable IDs, null/suppressed data, paging and source-replacement rollback.
6. Expand adapters to the remaining permitted sources, with every raw asset accounted for. Schedule and transaction analytical models can remain explicitly deferred until their capabilities are selected; they must not disappear silently from the plan.

Done for that first slice means the API can find towns and return selected, source-linked point/polygon/context layers from normalized frozen files with indexed queries. A frontend map, live property availability and travel-time ranking are later work. This research does not mark schema, scoring or deployment decisions as approved.
