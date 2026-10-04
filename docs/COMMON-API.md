# Common-schema API, version 2

`src/common/app.ts` exports `createCommonApp(repository)`. Hono handlers use the asynchronous `CommonRepository` interface; PostGIS performs spatial selection and pagination. Handlers do not read the full record corpus. The API returns GeoJSON that MapLibre, Leaflet and other map clients can consume; this stage does not implement a frontend.

The version-1 preference request remains supported. Select one or more distinct registered criteria with no fixed count limit. `/criteria` exposes the editable registry in `config/criteria.json`. Requests are limited to 256 KiB; preferences are processed in memory and are not persisted or logged.

| Route | Contract |
|---|---|
| `GET /` | API capability links. |
| `GET /openapi.json` | OpenAPI 3.1 contract, also saved under `schemas/`. |
| `GET /ready` | Database and imported-release readiness; 503 when unavailable. |
| `GET /health` | API liveness; version 2. It is not a database readiness probe. |
| `GET /criteria` | Criterion registry and `apiVersion: 2`. |
| `GET /data-status` | Active manifests, imported record count and raw-source adapter registry distinguishing parsed, deferred and reuse-gated sources. Missing evidence means unknown. |
| `GET /places?q=dublin&limit=100&cursor=…` | Indexed town/urban-area search with canonical records and provenance. Search text is required. |
| `GET /features?bbox=-6.4,53.2,-6.1,53.5&categories=childcare,parks&limit=100` | Indexed intersection query, GeoJSON, source manifests and continuation cursor. |
| `GET /features?longitude=-6.26&latitude=53.34&radiusM=10000&categories=childcare` | Indexed radius query; recorded geometry distance is in metres. |
| `GET /areas?longitude=-6.26&latitude=53.34&categories=broadband&cursor=…` | Paged statistical/utility polygons covering the point. Membership is area context, not a household connection. |
| `GET /market-context?geographyCode=…&geographyCodeSystem=…&tenure=rent&bedrooms=2` | Historical observations for an exact geographic code system and code. |
| `GET /context?categories=government_projects&geographyCode=…&geographyCodeSystem=…` | Nonspatial source records with optional exact native-geography filters; no point join. |
| `POST /layers` | One GeoJSON/context descriptor per selected criterion, source provenance and individual paging. |
| `POST /assess` | Independent recorded-point proximity where supported; all scores remain null and `rankingReady` remains false. |

Query limits are 1–250, default 100. Coordinates are finite WGS84 longitude/latitude within the broad Ireland extent, −11 to −5 longitude and 51 to 56 latitude. This extent is not a jurisdiction test. Feature requests must provide either a positive-area bounding box, or all three origin/radius parameters; combining them is rejected. Radius is 1–50,000 metres. Categories come from the registry plus `urban_area`; unknown query fields/categories are rejected with HTTP 400.

Market queries require both `geographyCode` and `geographyCodeSystem`; `placeId` returns 400 because no verified crosswalk from towns to market reporting geographies exists. Optional filters are `tenure`, `period`, `propertyType`, `bedroomClass` and exact numeric `bedrooms`. Unknown bedroom counts do not match an exact bedrooms filter. Missing, suppressed and unverified-zero observations retain null euro amounts. These observations cannot establish dwelling availability, bedroom inventory or an individual household's affordability.

## Layers request

```json
{
  "version": 1,
  "location": { "longitude": -6.2603, "latitude": 53.3498 },
  "radiusKm": 10,
  "limit": 100,
  "criteria": [
    { "id": "education.childcare", "importance": "preferred", "parameters": {} },
    { "id": "quality_of_life.parks", "importance": "preferred", "parameters": {} },
    { "id": "utilities.broadband", "importance": "required", "parameters": {} },
    { "id": "budget.rent", "importance": "preferred", "parameters": { "bedrooms": 2 } }
  ],
  "marketGeography": { "code": "SOURCE_GEOGRAPHY_CODE", "codeSystem": "SOURCE_CODE_SYSTEM" }
}
```

Optional `contextGeography: {code, codeSystem}` selects nonspatial supply/housing context independently from the pin. Display category mappings and additional direct-query categories are in `config/layer-categories.json`. Government housing and supply directories without verified geometry remain context rows.

Optional `bbox: [west, south, east, north]` changes spatial display selection from the preference radius to viewport intersection. `marketGeography` selects market context independently of the origin. Without it, budget layers return unknown context with an explanation rather than inventing a geographic join. Each returned feature has geometry once and canonical identity, attributes, raw locator and snapshot ID in its properties.

Spatial layers display the selected category, rather than asserting that each facility meets age, named-facility, admission, vacancy, clinical-service or public-access requirements. The descriptor echoes requested parameters and explains this limitation. Individual records retain their source access classification. A polygon or asset can appear as context while the corresponding utility assessment remains unknown.

For continued spatial pages, call `/features` with the same `displayCategories` (comma-separated), limit and bounding box, or origin/radius, plus the layer's `nextCursor`. Market pages use `/market-context` with the same exact geography and filters. Context pages use `/context` with the same `contextCategories`, native geography, limit and `contextNextCursor`. Cursor tokens are opaque, bounded to 4096 characters and tied to the query and active snapshots. A changed snapshot yields HTTP 409; restart the request. Multi-query layer/assessment requests also verify active snapshots before and after queries, rejecting mixed snapshots with 409.

## Assessment evidence

`POST /assess` accepts the original preference object without layer-only `bbox`, `limit` or `marketGeography`. A configured distance criterion without requested child-age, named-facility or service-capability enrichment performs a separate nearest service query within 50 km. This query does not reuse the display page. Only a returned recorded **Point** can provide a proximity observation. A polygon's nearest geometry is not an entrance; an empty radius result does not prove absence outside the radius or in an incomplete source.

Travel time remains unknown without routing, mode, timetable and capability evidence. Household utilities remain unknown without property evidence. Budget and government housing remain context, not available-home or eligibility claims. With proposed thresholds and partial sources, all criterion/vertical/aggregate scores are null, required evidence is reported missing, and `rankingReady` is false. Recorded proximity is descriptive evidence, not a score certification.

## Verification

`bun test tests/common-api.test.ts` validates HTTP contracts against a repository stub. The full suite additionally checks real PostGIS imports, exact radius boundaries, pagination, geometry and source provenance. `scripts/verify-expanded-api.ts` checks the running native-container API against the expanded imported snapshots; dated results are saved in `docs/research/expanded-api-verification.json`. Earlier representative-slice reports remain historical evidence.

Current expanded acceptance and integration instructions: [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md). All 41 active source scopes are local; future hosted Sites needs a reachable HTTPS API and exact `CORS_ORIGINS` configuration.

## Frontend discovery routes

`GET /place-anchor?placeId=<canonical town id>` returns a PostGIS point on the source town polygon. Its meaning is a representative town anchor, not a geocoded home. Missing/nonplace IDs return 404; an unavailable repository capability returns 503.

`GET /market-geographies?tenure=rent&limit=1000&q=dublin` discovers original publisher region codes, systems, periods and available dimensions for explicit selection. The checked inventory currently has 688 source-geography entries (437 rental and 251 purchase). `limit` is bounded to 1000; `total` and `truncated` describe filtering. Stale metadata against active database snapshots returns 503. Successful `data:load` rebuilds the inventory; rebuild the API image after imports so it serves the matching inventory.

The local production React frontend at http://127.0.0.1:5173 proxies these routes and the existing APIs under `/api`.
