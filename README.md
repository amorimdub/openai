# Ireland location services — connected demo

React frontend and Hono + Bun API with PostgreSQL/PostGIS, running in native macOS containers. The expanded raw-to-common-schema backend is loaded: **1,709,202 records across 41 source scopes**, with 79 inputs explicitly quarantined. Criteria are editable JSON; users can select one, seven or all 24 registered criteria.

## Open the demo

The running frontend is at **http://127.0.0.1:5173**. Choose a town/city, enter household preferences, select service criteria, and explore actual source layers and historical housing-budget context. This adapts the prototype at `codex/prototype-home` / `abc13ad`; original prototype files are preserved.

To restart the existing imported demo:

```sh
bun run containers:db
bun run containers:api
bun run containers:frontend
```

Recreate the frontend after recreating the API so its proxy captures the current container address. Production React assets and the API proxy run in the frontend container; Vite is only needed for development (`bun run frontend:dev`). [Frontend notes](src/frontend/README.md).

## Load or refresh the backend

Apple’s `container` CLI and its running system service are required. The PostGIS image uses Rosetta on Apple silicon. Database storage persists in the managed volume `ireland-map-postgis-data`.

```sh
bun install --frozen-lockfile
bun run containers:db
# Wait for: container exec ireland-map-postgis pg_isready -U ireland -d ireland
# Required for offline OSM parsing/import (API serving does not need Python):
python3 -m venv /private/tmp/ireland-osm-venv
/private/tmp/ireland-osm-venv/bin/python -m pip install --only-binary=:all: osmium==4.3.1
bun run data:normalize
DATABASE_URL=postgres://ireland@127.0.0.1:55439/ireland bun run data:load
bun run containers:api
```

Normalization reads the already collected originals in `data/raw/` and writes versioned NDJSON, manifests, quarantine reports and `data/canonical/last-run.json`. Loading validates hashes and records, then publishes each source scope atomically. Repeating an unchanged import is a no-op. See [common schema](docs/COMMON-SCHEMA.md) and [PostGIS operations](docs/POSTGIS.md).

The API is at **http://127.0.0.1:3080**. These containers are local development services with loopback ports; the database uses local trust authentication. Container startup scripts reuse the database and rebuild/recreate this project's API container.

```sh
curl http://127.0.0.1:3080/data-status
curl 'http://127.0.0.1:3080/places?q=dublin'
curl 'http://127.0.0.1:3080/features?bbox=-6.4,53.2,-6.1,53.5&categories=childcare,parks&limit=25'
```

The [API index](http://127.0.0.1:3080/) and [OpenAPI 3.1 contract](http://127.0.0.1:3080/openapi.json) are available for integration.

Search supports indexed names, viewports, metre-based radius queries, polygon membership, snapshot-aware paging and exact publisher-geography market filters. `/layers` generates GeoJSON for selected preferences. [API contract and examples](docs/COMMON-API.md).

## Loaded and remaining data

For nationwide Daft.ie and MyHome.ie residential listing JSON, run `bash scripts/collect-daft.sh` or `bash scripts/collect-myhome.sh`. These follow reachable sale/rental search and detail pages without collector caps and store dated snapshots under `data/raw/property-listings/`. Interrupted collections can resume with `--resume <run-directory>`. For a selected URL, use `bun run data:listings --url '<public search or listing URL>'`. See [raw property listing commands and limits](docs/RAW-PROPERTY-LISTINGS.md).

Loaded sources cover health, transportation, education, quality of life, utilities, historical buying/renting and government-housing information. They include the original property-price register and a bounded OSM feature extraction. [Complete handoff, counts and limitations](docs/BACKEND-HANDOFF.md).

The raw archive has 39 source folders, 518 files and about 1.12 GB. All groups are accounted for: 31 parsed, three partially parsed, four reuse-gated and one catalogue-only. [Source adapters](config/source-adapters.json), also exposed by `/data-status`. Current school/Tusla reuse and ESB material remain gated. GTFS schedules and a routing graph remain later analytical work; an active stop or mapped road does not establish journey times.

Scores remain `null` and `rankingReady` remains `false` while scoring and evidence are unapproved. The connected map displays evidence; public/OpenAI Sites deployment remains the later stage. [Criterion configuration](config/criteria.json).

## Verification and separate prototypes

```sh
bun run typecheck
bun test
POSTGIS_TEST_URL=postgres://ireland@127.0.0.1:55439/ireland bun run test:postgis
bun run scripts/verify-expanded-api.ts http://127.0.0.1:3080 docs/research/expanded-api-verification.json 1709202
```

The PostGIS tests create and remove their own disposable database. Live verification uses the imported snapshots and running API; inspect the dated evidence in `docs/research/`.

The earlier SQLite API is preserved and used when `DATABASE_URL` is absent: `bun run dev`. Its contract is [the legacy backend document](docs/BACKEND.md); it is separate from the current PostGIS API.

For the separately requested throwaway home-screen exploration, run `bun run prototype:home` and open http://localhost:4317/prototype/home. See [prototype notes](src/home-prototype/README.md).
