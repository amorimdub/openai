# Common data contract, version 2

This contract preserves evidence while allowing one map/search API to return GeoJSON. The current bounded slice covers towns, childcare, clubs, Dublin park points, broadband areas and purchase market observations. Other saved originals remain raw until their adapters are added. Renting, health, transport, utility connections and housing projects are not covered by these adapters yet.

The runtime contract is `src/common/schema.ts`; generated JSON Schemas are `schemas/common-record.schema.json` and `schemas/common-manifest.schema.json`. JSON Schema describes the shape; the runtime also checks identity, geometry/status consistency, market units and quality accounting. The version 1 SQLite prototype remains a separate earlier format.

## Records

Every record carries `version: 2`, a deterministic source/scope/external ID, source ID, scope, content-derived snapshot ID, name, observed period and a raw locator. A locator has a path relative to `data/raw` and a JSON feature/cell locator. Source dates and periods differ: fetching in October does not make a Census 2022 boundary or January 2024 park a current observation.

| Kind | Geometry | Meaning |
| --- | --- | --- |
| `service` | WGS84 point or explicit null | Recorded directory location; childcare, clubs or selected parks |
| `place` | WGS84 polygon/multipolygon | Original statistical boundary and geography code/vintage |
| `utility_area` | WGS84 polygon/multipolygon | Statistical area with typed aggregate metrics, original values and definitions |
| `market_context` | Explicit null | Price observation for an original source region, period and source dimensions |

Longitude precedes latitude, as required by GeoJSON. Recorded locations do not establish an entrance, admission, vacancies, care capability or route time. Unlocated childcare entries remain searchable directory records but cannot be plotted. Price observations remain nonspatial; their source regions are not silently joined to towns or guessed coordinates.

Service attributes use a public whitelist: category, address/county/Eircode where present, service type, published programme flags, activity and affiliation. Email, phone numbers, free-text notes and contact metadata are not copied. `access: unknown` means public directory publication does not establish public access.

Broadband metrics preserve source field keys, units, original text/numbers, reported/planned/unknown status and individual definitions. `<200` premises is retained as original text with a null numeric value. Gigabit passed, active connections and passed including planned NBI remain separate. None describes availability at a particular home.

Market observations retain mean/median, EUR units, month, property type, null bedrooms, matching sale-volume sample size and all original dimension codes/labels. Missing values and source zeros are distinct: zeros have `source_zero_unverified` with null usable amount, while retaining `sourceValue: 0`. Average/median observations are not properties currently for sale or a promise of affordability.

## Frozen-source adapters

The current adapters consume the saved 2026-10-04 captures without network requests or edits to originals.

| CLI adapter | Source / scope | Accepted records | Unlocated | Source period |
| --- | --- | ---: | ---: | --- |
| `towns` | `cso-urban-areas-2022` / `national-urban-areas` | 867 | 0 | 2022 |
| `childcare` | `pobal-childcare` / `national-childcare` | 5,075 | 4 | Unknown; technical edit does not supply observation date |
| `clubs` | `sport-ireland-clubs` / `island-wide-source` | 8,496 | 0 | Unknown; original island-wide source preserved |
| `parks` | `parks-gardens-and-public-spaces-dcc` / `dublin-city` | 90 | 0 | 2024-01 |
| `broadband-counties` | `comreg-broadband` / `counties` | 25 | 0 | Unknown in API; catalogue describes Q2 2026 |
| `broadband-small-areas` | `comreg-broadband` / `small-areas` | 18,919 | 0 | Unknown in API; catalogue describes Q2 2026 |
| `purchase` | `cso-hpm05` / `national-regional-monthly-executions-all-statuses` | 50,148 | 50,148 | 2010-01 through 2026-07 |

This is 83,620 accepted records and one quarantined county boundary, from 26 source county features. The independent PostGIS topology check identified a Meath ring self-intersection; the parser now quarantines that exact frozen shape. All 18,919 small-area polygons passed the independent topology check. Coverage remains `partial` even when every source row was acquired: directory or statistical coverage does not establish all current real-world services.

HPM05 contains 601,776 cells. This slice selects mean and median sale-price cells for all 199 months, all three dwelling-type categories (all/apartment/house), 42 original regional codes, **All Dwelling Statuses** (`-`) and **Executions** (`02`). The separate New and Existing dwelling-status cells are excluded, rather than mixed with their aggregate.

| HPM05 accounting | Cells |
| --- | ---: |
| Accepted mean/median price observations | 50,148 |
| Nonaggregate dwelling statuses excluded | 401,184 |
| Filings excluded after selecting aggregate status | 100,296 |
| Volume cells used only as matching sample-size evidence | 25,074 |
| Value-of-sales cells excluded because they are not a dwelling price | 25,074 |
| Total input cells | 601,776 |

Exclusion reasons are mutually exclusive in this order. Every input feature or cell is accepted, quarantined or excluded, and the manifest validates the sum.

Town IDs use publisher urban-area GUIDs; their attributes retain original urban-area codes. Childcare IDs use service references; clubs use GlobalIDs. ComReg uses county GlobalIDs or Census 2022 small-area GUIDs, with original geography codes separately preserved. DCC supplies no durable park ID in this file: the adapter uses a content hash of original name/address fields; changing those fields can change the ID. Market IDs use every selected source dimension code.

## Integrity and outputs

Each source's original acquisition manifest supplies the expected byte sizes and SHA-256 hashes. The adapter verifies every consumed payload and support/evidence asset before parsing. Parsed page bytes are checked again so a change between verification and reading fails the operation. The original acquisition manifest itself is preserved by hash in the canonical manifest; as the provenance root it cannot validate its own authenticity. Verify trusted acquisition manifests separately if data comes from another machine.

Snapshot IDs are deterministic SHA-256 values over source/scope, adapter version and sorted raw asset path/size/hash entries. Records are validated before streaming into NDJSON. Duplicate canonical IDs and malformed source features are quarantined with a raw locator and reason. Unsupported table structures, source count discrepancies, integrity failures or malformed market values abort the whole source snapshot and remove unfinished output. No coordinate guessing or automatic geometry repair occurs.

Each bundle lives at `data/canonical/<adapter>/<snapshot-id>/`:

- `records.ndjson`: version 2 canonical records.
- `records.ndjson.manifest.json`: source, scope, source URL, licence evidence, attribution, fetch time, observed period, limitations, all consumed raw assets, adapter version, output SHA-256 and quality accounting.
- `quarantine.ndjson`: raw locator and reason for rejected features; empty when none fail.

The manifest is written last. Once every selected adapter succeeds, the CLI atomically updates `last-run.json` with source/scope identity, snapshot, files and quality. A partial run replaces only matching source/scope entries and preserves other published bundles; a failed selected batch leaves the previous index intact. Canonical files are derived local data; raw files remain unchanged. The parser stage itself does not import into a database; database publication remains a separate validated operation.

```sh
bun run src/common/normalize-cli.ts --date 2026-10-04
bun run src/common/normalize-cli.ts --date 2026-10-04 --sources towns,childcare --raw-root data/raw --output data/canonical
bun run src/common/normalize-schema-cli.ts
```

The defaults select all seven reviewed adapters and the frozen 2026-10-04 capture. `--date` chooses an existing snapshot directory; it does not fetch new data. These first-source adapters enforce reviewed capture counts. Extending them to a later capture requires reviewing changed counts and source/schema periods.

## Projection and polygon conversion

`src/common/geometry.ts` transforms EPSG:2157 (Irish Transverse Mercator) and EPSG:3857/102100 (Web Mercator) to EPSG:4326 with proj4. Unknown CRS values fail rather than guessing. Source polygon rings are grouped by smallest containing parent, with even-depth rings becoming exteriors/islands and odd-depth rings becoming holes; this supports holes and disjoint multipart boundaries independent of ring order/winding. Output uses GeoJSON exterior counter-clockwise and hole clockwise winding. Source null points are preserved; malformed, unclosed or zero-area rings are rejected.

Parser regression tests cover multipart/hole/island conversion, malformed rings/coordinates, known projection points, source-hash tampering, no private contacts, null locations, broadband suppression/planned metrics, HPM05 dimension selection, matching sample sizes, original regional codes, price units and missing/zero states. Precise topology and native-versus-transformed coordinate comparison belong to the independent PostGIS validation alongside these tests.


## Independently observed topology quarantine

`config/common-geometry-quarantine.json` holds a generic rule for the frozen Meath county geometry rejected by PostgreSQL 17.5 / PostGIS 3.5.2 / GEOS 3.9.0. The exact reason is `Ring Self-intersection[-6.41775174665228 53.4282735406387]`; evidence is `data/canonical/topology-validation-2026-10-04.json`. The rule matches source, scope, raw path, raw SHA-256, stable external ID, raw locator and canonical geometry SHA-256. A newer raw asset or corrected geometry cannot match this frozen rule automatically.

Applicable rule content participates in the deterministic snapshot ID and switches the affected adapter version to `2.0.1-geometry-quarantine`. Rules for unrelated source scopes do not change those snapshots. The quarantine report retains the exact reason, rule hash, matching evidence and validator details. The manifest explicitly states the missing county feature; 26 input features are accounted as 25 accepted plus 1 quarantined. No `ST_MakeValid`, coordinate repair or silent drop is performed. Future captures should be validated independently and the rule updated only with corresponding evidence.

## Expanded release

The current version-2 model also includes infrastructure assets, nonspatial utility observations, housing information and distinct property transactions. Utility areas distinguish statistical boundaries from source-protection/reported areas. Optional `sourceModifiedAt` and `sourceVersion` retain OSM edit metadata separately from fetch/observation periods. All kinds retain the same source/scope/snapshot/raw-locator envelope.

Original provenance locators now support native feature/cube cells, NaPTAN stop ordinals, logical CSV rows, actual XLSX worksheet rows, GeoPackage primary keys, ZIP member rows and OSM primitive IDs/versions. Import verifies each referenced locator directly against its original asset. PPR has capture-row identities because the source has no stable transaction ID; no cross-snapshot property match is claimed. OSM keeps stable primitive IDs and a separate version.

Published total: **1,709,202 records / 41 scopes**, with 79 quarantined inputs. [Expanded handoff](BACKEND-HANDOFF.md) supersedes the representative-slice count above; the original slice evidence remains historical.
