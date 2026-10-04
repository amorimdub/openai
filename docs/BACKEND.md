> Historical version-1 SQLite prototype. The current version-2 PostGIS API and native macOS container commands are documented in [COMMON-API.md](COMMON-API.md), [POSTGIS.md](POSTGIS.md) and the [README](../README.md). Set `DATABASE_URL` to select the common backend.

# Local Hono + Bun backend foundation

This is a runnable, reviewable **local backend prototype**. There is no frontend, deployed endpoint, authentication system, listing inventory or routing engine. All endpoints bind to `127.0.0.1`; preferences are evaluated in memory and are not persisted or logged. Deployment and multi-user access are separate work.

The interface separates three jobs: public source → reviewable snapshot files; validated snapshot → local SQLite; preferences → layers and evidence-aware assessments. It uses [Hono's Bun integration](https://hono.dev/docs/getting-started/bun) and [Bun native SQLite](https://bun.com/docs/runtime/sqlite). Provider discovery and remaining national gaps are documented in [DATA.md](DATA.md) and [research](research/).

## Current work direction

The latest user direction is **collect and save raw source files first, then parse after schema review**. The local backend, schemas and two exporters below are already implemented and tested foundations; they are not a mandate to continue normalizing/importing new sources now. The existing `.source.json` exporter file is a public-field subset of ArcGIS GeoJSON, not an untouched upstream capture. Keep independently collected raw responses/metadata distinct from these derived canonical NDJSON files. The parent session owns that raw-source collection and records which earlier normalized files/database imports already exist.

## Run

```sh
bun install --frozen-lockfile
bun run data:fetch pobal ./data/pobal.ndjson
bun run data:fetch towns ./data/towns.ndjson
bun run data:import ./data/pobal.ndjson
bun run data:import ./data/towns.ndjson
bun run dev
```

`DB_PATH` defaults to `./data/ireland.prototype.sqlite`; `PORT` defaults to `3000`. These are ordinary environment variables. The SQLite file and its WAL/SHM files are ignored by Git; source snapshots remain reviewable local files. Initial empty-database responses correctly report unknown evidence.

```sh
bun test
bun run typecheck
bun run schema:export
```

## Shared schema and offline loading

The version-1 canonical record schema lives in `src/schema.ts`; machine-readable JSON Schemas are exported into `schemas/`. Import, storage and layer responses preserve these discriminated records:

| Kind | Meaning | Geometry |
|---|---|---|
| `service` | Recorded school, childcare, healthcare, transport, recreation or retail facility; category retained | GeoJSON or null, with explicit `locationStatus` |
| `place` | Named geographic selection area | GeoJSON, e.g. a CSO urban-area polygon |
| `market_context` | Historical buy/rent statistic, definition, period, geography, property/bedroom classification and sample size | GeoJSON or null; explicit `placeId` |
| `housing_information` | Government project stage/reporting period/unit count | GeoJSON or null; place link where known |
| `utility_area` | Reported/planned area-level utility evidence | GeoJSON; explicit status/definition/period |

Supported geometry types are Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon in WGS84 longitude/latitude order. Polygon rings must close. Coordinates are checked against a broad Ireland extent, which **does not test Republic membership**. Reversed axes and out-of-extent geometries are rejected; pins are never manufactured. A facility with a legitimate null source geometry remains an unlocated record; it cannot appear as a map point or satisfy distance scoring. Privacy fields are excluded from service attributes and from the allowlisted source exports.

Each export writes:

- `file.ndjson`: one canonical record per line, `id = sourceId:externalId`.
- `file.ndjson.source.json`: the source GeoJSON with only reviewed public fields, including unlocated facilities.
- `file.ndjson.manifest.json`: version, source/scope, publisher, precise source and license-evidence URLs, license and attribution, retrieval/edit dates, observation period if known, limitations, record count, geometry quality counts and SHA-256 of canonical NDJSON.

The schema preserves CC BY, CC0, CC BY-SA, ODbL, public-domain and documented custom-reuse license identities. This does not grant permission or resolve mixed-license obligations. **Only Pobal childcare and CSO/Tailte urban-area layers are in the automated exporter allowlist.** Exact source policies are in `config/sources.json`; adding a source requires reviewing its actual reuse terms, fields and geographic scope. Current DOE/Tusla/ESB discovery does not authorize their automatic redistribution.

The ArcGIS exporter enumerates IDs and independently verifies the count, requests geometry in WGS84 in chunks of 200 IDs, checks each returned ID and truncation indicators, validates every record, then writes the files. It does not silently discard malformed or missing records. Null facility geometries are preserved and counted; optional null source text fields stay unset. Raw snapshot hashes are not currently recorded; the canonical file hash is verified during import. Manifest publication is last; interruption between file renames may leave mismatched files, which fail import safely and leave the last accepted database intact.

Import validates checksum, canonical records, count, geometry quality counts when provided, IDs, duplicates and exact source/scope agreement **before mutation**. A single SQLite transaction replaces only that source/scope's records and current manifest. Reimport is idempotent; deleted source records disappear on successful replacement; unrelated sources/scopes remain. The database stores canonical JSON documents and source manifests, with kind/category indexes. It does not implement a spatial index, historical snapshot archive or cross-source deduplication. Full scans are adequate for this bounded demo and need replacement/measurement for larger datasets.

## Criteria, preferences and generated layers

`config/criteria.json` is the tweakable registry of stable criterion IDs, verticals, methods, default weights and proposed distance thresholds. Its five verticals are health, transportation, quality of life, education and utilities; budget and housing are separate context. No server change is needed to select one, two, seven or all registered criteria. New criterion IDs/categories can be added to the JSON and take effect on restart; a new metric type needs implementation.

The API accepts **one or more** distinct criterion IDs, with no upper count cap. Each has `required`/`preferred`, optional positive weight and compatible parameters. Duplicate/unknown IDs and inappropriate parameters return 400. Requests are bounded to 256 KiB for the local prototype. Thresholds/weights are proposals and do not represent accepted medical, quality or policy standards. Body parameters request service capabilities rather than sending a medical diagnosis.

```json
{
  "version": 1,
  "location": { "longitude": -6.2603, "latitude": 53.3498 },
  "radiusKm": 10,
  "criteria": [
    { "id": "health.hospital", "importance": "required", "parameters": { "maximumMinutes": 30, "mode": "driving", "requiredService": "emergency_department" } },
    { "id": "education.childcare", "importance": "preferred", "weight": 2, "parameters": {} },
    { "id": "quality_of_life.parks", "importance": "preferred", "parameters": {} },
    { "id": "transportation.public_transport", "importance": "required", "parameters": { "mode": "public_transport" } },
    { "id": "utilities.broadband", "importance": "required", "parameters": { "minimumDownloadMbps": 100 } },
    { "id": "budget.rent", "importance": "preferred", "parameters": { "maximumAmountEur": 1800, "bedrooms": 3 } },
    { "id": "housing.government_projects", "importance": "preferred", "parameters": {} }
  ]
}
```

A town choice is a polygon/identifier; callers supply a **confirmed point** for location assessments. A town center is not substituted for a household address and the API does not call Nominatim. Supply `location.placeId` when joining market records or geographically linked housing information. Market comparisons with requested bedrooms exclude rows with a different or unknown bedroom category; no home price/room availability is inferred. Here “bedrooms” is the explicit contract; whether the user's original “rooms” meant bedrooms remains a product question.

`POST /layers` returns one layer descriptor per selected criterion, source manifests, a GeoJSON FeatureCollection, unlocated/non-spatial context records, explicit evidence status and truncation. Display radius defaults to 10km and is capped at 50km. Points use a radius; non-point display selection uses bounding-box intersection, never precise connection/access evidence. A layer displays at most 1,000 geometry records and reports `totalInView` and `truncated`; assessments independently use all matching imported records, so display truncation does not change the metric. Context rows are also capped at 1,000. Known private services are excluded. Facility ID selects a named source facility; cross-source identity reconciliation is not implemented.

## HTTP interface

| Endpoint | Response |
|---|---|
| `GET /health` | Local prototype liveness and schema version |
| `GET /criteria` | Editable criterion registry |
| `GET /data-status` | Current imported source manifests and total records; missing means unknown |
| `GET /places?q=dublin` | Up to 100 matching CSO urban place records; total and truncation |
| `GET /market-context?placeId=...` | Imported historical area statistics; empty until a reviewed market importer exists |
| `POST /layers` | Selected layer descriptors + GeoJSON + source evidence |
| `POST /assess` | Per-criterion results, per-vertical summaries, aggregate coverage/bounds and explicit unknowns |

```sh
curl http://127.0.0.1:3000/criteria
curl http://127.0.0.1:3000/data-status
curl 'http://127.0.0.1:3000/places?q=dublin'
curl -H 'Content-Type: application/json' --data @preferences.json http://127.0.0.1:3000/layers
curl -H 'Content-Type: application/json' --data @preferences.json http://127.0.0.1:3000/assess
```

`preferences.json` is any request matching the example/schema; the backend does not persist it.

## Assessment limits and honest unknowns

Currently scored metrics are **straight-line proximity to a recorded point** for the configured education/parks/community-center criteria. The nearest matching point and full source manifest accompany the metric. Polygon park distance/entrances are not yet implemented. Threshold scores are proposed linear 0–100 curves; they do not indicate public access, clinical safety, quality, school admission or childcare vacancy. Child-age or service-specific requests remain unknown without verified suitability enrichment.

Hospital 30-minute / GP 60-minute requirements, airports, transit, cycling and car journeys remain unknown until genuine mode/network routing evidence exists. Public transit also needs date/time and valid timetables. A nearby hospital cannot satisfy a minutes requirement. Utility polygons/assets cannot prove electricity, mains/group water membership, lighting quality or address broadband connection. Buying/renting data remains historical market context; matching a budget to an available dwelling needs listing inventory. Government housing is an information layer and never boosts/depresses a score or asserts eligibility.

Unknown scores are null, never zero. Aggregate scores are null while any selected criterion is unmeasured; missing criteria keep their weights and contribute to explicit score bounds and weighted evidence coverage. Required criteria with a measured distance beyond an explicit limit are reported as failures. `rankingReady` also requires an approved configuration and accepted source coverage; it remains **false** for the current proposed configuration and partial source snapshots, even if all requested point-proximity metrics are computed. No current endpoint certifies that towns/areas can be ranked comparably.

## Verification

Tests exercise the same import and HTTP interfaces as callers: repeated imports and clean source replacement, failure preservation, malformed coordinates/duplicate IDs, selection counts above seven, criterion/parameter errors, selected layers and provenance, missing travel/property/age evidence, bedroom-filtered market context, pagination/count integrity, public-field sanitization and a legitimate null-geometry provider. Offline source fixtures validate those failure modes without depending on changing public services. Live source/API checks are separate evidence and should be recorded with the actual manifests/counts rather than inferred from passing fixture tests.
