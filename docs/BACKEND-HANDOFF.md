# Ireland connected demo handoff — 4 October 2026

The local backend is connected to a production React frontend adapted from `codex/prototype-home` at `abc13ad`: **Hono + Bun + PostgreSQL/PostGIS in native macOS containers**, with **1,709,202 records across 41 active source scopes**. Original downloads remain untouched. This is a source-backed data API; overall ranking, current availability and journey-time suitability remain unverified.

## Demo to use now

Open **http://127.0.0.1:5173**. Search a real town/city, set bedrooms, children’s ages, buying/renting budget, transport mode and radius, then choose any number of criteria. The results display actual source layers, a Leaflet map and dated evidence. Select a publisher market region explicitly to see historical purchase/rent observations. Scores remain visibly unknown.

The frontend serves production assets in `ireland-map-frontend` and proxies `/api` to the API container. Vite is stopped. The original prototype is preserved; no fictional home cards or scores are supplied as data. [Frontend package and workflow](../src/frontend/README.md).

## API to use now

Base URL: **http://127.0.0.1:3080**. `/` lists capabilities; `/ready` checks database/import readiness; `/openapi.json` serves the OpenAPI 3.1 contract. The same contract is saved at [schemas/openapi.json](../schemas/openapi.json). [Detailed contract](COMMON-API.md).

| Route | Purpose |
|---|---|
| `GET /places?q=dublin` | Town/city name search, with source polygons and IDs |
| `GET /place-anchor?placeId=…` | Representative point on the source town polygon |
| `GET /market-geographies?tenure=rent&limit=1000` | Discover original publisher codes for explicit market-region selection |
| `GET /features?bbox=…&categories=…` | GeoJSON map features for a viewport |
| `GET /features?longitude=…&latitude=…&radiusM=…` | Nearby recorded geometries, metre distances and paging |
| `GET /areas?longitude=…&latitude=…` | Statistical/source-protection polygons containing the point |
| `GET /market-context?geographyCode=…&geographyCodeSystem=…` | Exact publisher-geography buying/rental statistics |
| `GET /context?categories=…&geographyCode=…&geographyCodeSystem=…` | Nonspatial housing projects, water directories and property transactions |
| `GET /criteria` | Editable 24-criterion registry, without a fixed selection count |
| `POST /layers` | Selected GeoJSON and information layers, including explicit unknowns |
| `POST /assess` | Descriptive recorded proximity and missing evidence; scores remain null |
| `GET /data-status` | Published snapshots, counts, licences, dates, coverage and raw-adapter status |

Viewport example:

```sh
curl 'http://127.0.0.1:3080/features?bbox=-6.4,53.2,-6.1,53.5&categories=hospital,primary_school,transport_stop,parks&limit=25'
```

Rental example, original RTB location code and quarter:

```sh
curl 'http://127.0.0.1:3080/market-context?geographyCode=120500&geographyCodeSystem=CSO_RIQ02_C03004V03625&tenure=rent&period=2025Q4&propertyType=apartment&bedrooms=2'
```

Exact geography filters retain source codes and code systems. No town-to-market, pin-to-water-directory or pin-to-housing-project join is invented. `/context` without geography filters lists national source records, not matches to the household. Its rows expose original geography labels/codes for explicit selection. Geometry queries use bounding boxes/radii; they do not geocode an address or calculate travel times.

## Published coverage

| Data | Accepted records | Qualification |
|---|---:|---|
| CSO towns | 867 | Census 2022 urban boundaries; rural localities are not exhaustive |
| Pobal childcare | 5,075 | Four unlocated records; vacancies and age suitability unknown |
| Sport Ireland clubs | 8,496 | Source may include Northern Ireland |
| DCC selected parks | 90 | Recorded locations, not entrances |
| ComReg county/small-area context | 18,944 | Area percentages; no household connection claim |
| CSO HPM05 purchase observations | 50,148 | Exact month/type/geography; no bedrooms or listings |
| Health, historical schools, airports and stops | 27,801 | Hospitals/GPs 2020; schools 2014/15; active stops do not prove a useful service |
| RTB rents and other CSO purchase summaries | 456,166 | 376,988 rental observations; missing cells/excluded breakdowns explicitly counted |
| Council amenities, activities, lighting, water and housing | 150,086 | Dated asset/context records; housing and supply directories retain null geometry |
| PSRA property-price register | 809,014 | Transactions with original tax/nonmarket flags; no geocoding or current inventory |
| OSM POIs/green areas/strategic roads/cycleways | 182,515 | ODbL, original Ireland + Northern Ireland extent; no routing graph or current access guarantee |

**79 inputs are quarantined**, including corrupt/out-of-bounds coordinates, invalid source polygons and unassembled OSM areas. No source geometry was silently repaired. Known malformed Fingal community data has an active zero-record snapshot documenting all 41 quarantines.

All **39 raw groups are accounted for**: 31 parsed, three partially parsed, four reuse-gated and one catalogue-only. The three partial groups are selected CSO purchase breakdowns, NaPTAN stops without GTFS schedule tables, and the bounded OSM extraction. Current DOE/Tusla and ESB sources remain gated by unresolved reuse evidence. [Adapter registry](../config/source-adapters.json).

GTFS trip/calendar/stop-time ingestion and routing are a later analytical model; source data is preserved. Actual hospital/GP service capability, admissions/vacancies, household utilities, current listings and government-scheme eligibility are not established by these sources. Scoring thresholds remain proposed; `rankingReady` is false. These limitations are returned by the API as well as recorded here.

## Repeatable local workflow

```sh
bun install --frozen-lockfile
bun run containers:db
# OSM normalization/import requires PyOsmium; setup below is only for the offline loader.
python3 -m venv /private/tmp/ireland-osm-venv
/private/tmp/ireland-osm-venv/bin/python -m pip install --only-binary=:all: osmium==4.3.1
bun run data:normalize
DATABASE_URL=postgres://ireland@127.0.0.1:55439/ireland bun run data:load
bun run schema:common
bun run containers:api
```

`OSM_PYTHON` overrides the interpreter path. The serving container queries PostGIS and requires neither Python nor a raw-data mount. Database data persists in `ireland-map-postgis-data`; host ports are loopback-only. The current database uses development trust authentication. Existing immutable source snapshots are retained; unchanged reimports are no-ops.

## Restart the existing demo

```sh
bun run containers:db
bun run containers:api
bun run containers:frontend
```

No reimport is needed to restart the loaded demo. Recreating the API can change its private container IP, so recreate the frontend afterwards; its startup script discovers the address. Frontend assets are built in a multi-stage Bun image. `bun run frontend:build` and `bun run frontend:test` check the separate React package; `bun run frontend:dev` is the optional Vite development mode.

## Later Sites integration

Use the connected React implementation, OpenAPI contract and GeoJSON response shape when publishing the site. A hosted site will need a reachable **HTTPS API base URL**, database configuration and a permitted browser origin. These are deployment tasks for the later stage; the current API is local.

Set `CORS_ORIGINS` to an exact comma-separated list of permitted site origins when deploying or rebuilding the API container. No wildcard browser access is enabled by default. Preferences are processed for each request and are not persisted. Editable display mappings live in [layer-categories.json](../config/layer-categories.json); criteria/threshold proposals remain in [criteria.json](../config/criteria.json).

The React map uses Leaflet for the bounded demo and attributed OpenStreetMap base tiles. Source layers remain database-backed. MapLibre can consume the same GeoJSON for a later nationwide renderer.

## Acceptance evidence

[Final connected-demo acceptance](research/connected-demo-acceptance.json) records the checked frontend/backend image digests, build, test and browser evidence.

- [Final expanded live HTTP acceptance](research/connected-demo-api-verification.json), all 11 checks passed.
- [Frontend discovery/proxy checks](research/connected-frontend-proxy-verification.json) and [browser screenshot](research/connected-demo-browser.png).
- [Final 75-test output](research/connected-demo-tests.log).
- [Independent PostGIS counts, geometry and query plans](research/expanded-postgis-verification.json).
- [Original raw byte/hash preservation](research/raw-final-backend-integrity.json).
- [Common schema](COMMON-SCHEMA.md), [local operations](POSTGIS.md), [raw catalogue](RAW-DATA.md).

The combined suite passed **75 tests / 56,509 assertions**, including real isolated PostGIS integration tests and frontend preference-contract tests. Backend TypeScript, the static/proxy server TypeScript and the production React build passed. Final network/browser acceptance is recorded separately in dated evidence; this is a local demo.

An initial expanded run exposed slow multi-criterion requests. The failing report is preserved. Category/spatial candidate indexes and late record materialization fixed the query path while retaining exact spheroidal radius checks. [Before/after performance evidence](research/postgis-performance-verification.json).
