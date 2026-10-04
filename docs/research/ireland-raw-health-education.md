# Raw national source collection

Collected **4 October 2026** for the Republic of Ireland. These are original HTTP response bodies, retained locally under `data/raw/<source>/2026-10-04/`. Source JSON, source pages, CSV and PDFs are untouched; no canonical records, enrichment, coordinate transformation, score calculation or database import was performed. Only source metadata, pagination/counts/object IDs and link discovery were read to acquire and check completeness.

## Saved inventory

Each linked folder contains `manifest.json` with source URLs, resolved URLs, UTC retrieval start/end timestamps, safe HTTP headers, byte sizes, SHA256 hashes, source reference periods, licence evidence, reuse status and completeness. Raw snapshots are local-only and Git-ignored by the parent task.

| Original source snapshot | Saved path | Original source records/files | Reference period and reuse status |
|---|---|---|---|
| Department of Education current school point layer | [doe-schools-current](../../data/raw/doe-schools-current/2026-10-04/manifest.json) | **3,938 records**, 22 response bodies | Research observed `Year=2026`; underlying census date unconfirmed; exact item reuse licence unresolved |
| Historical school mirror, special/primary/post-primary layers | [schools-historical](../../data/raw/schools-historical/2026-10-04/manifest.json) | **3,974 records**, 31 response bodies: 116 special, 3,147 primary, 711 post-primary | **2014/15**, explicit CC BY 4.0 item; mirror provenance remains a gate |
| Pobal childcare layer | [pobal-childcare](../../data/raw/pobal-childcare/2026-10-04/manifest.json) | **5,075 records**, 27 response bodies | Layer edit September 2026, observation date unknown; explicit CC BY 4.0 |
| Tusla early-years GIS layer | [tusla-early-years](../../data/raw/tusla-early-years/2026-10-04/manifest.json) | **6,593 records**, 33 response bodies | Layer edit July 2025; active-registration population unverified; exact item reuse licence unresolved |
| HSE/GeoHive hospitals | [hse-hospitals-2020](../../data/raw/hse-hospitals-2020/2026-10-04/manifest.json) | **132 records**, 7 response bodies | Health Atlas supplied **March 2020**, explicit CC BY 4.0 |
| HSE/GeoHive general practitioners | [hse-gp-2020](../../data/raw/hse-gp-2020/2026-10-04/manifest.json) | **6,608 records**, 33 response bodies | Health Atlas supplied **March 2020**, explicit CC BY 4.0; clinician records, not distinct practices |
| CSO/Tailte 2022 urban-area polygons | [cso-urban-areas-2022](../../data/raw/cso-urban-areas-2022/2026-10-04/manifest.json) | **867 records**, 10 response bodies | Census **2022**, generalised 20m; exact publisher item CC BY 4.0 |
| Tusla county registers | [tusla-county-register](../../data/raw/tusla-county-register/2026-10-04/manifest.json) | **All 26 linked county PDFs** and original register HTML | All linked filenames identify **July26**; prior Dublin cover inspection confirms July 2026. Other PDF contents unparsed; PDF reuse licence unverified |
| OurAirports Ireland country export | [ourairports-ireland](../../data/raw/ourairports-ireland/2026-10-04/manifest.json) | Complete original CSV plus publisher data/licence HTML | Public domain per publisher, community data; individual observation dates vary. CSV rows deliberately unparsed during collection |

Total: **192 original source response bodies, 28,027,007 bytes**. The seven ArcGIS snapshots contain **27,187 source records**, including historical/current school snapshots and separate authority records; this is not a count of unique services. PDF provider totals and new CSV row totals remain unknown because parsing is deferred.

## Original formats and completeness checks

For every ArcGIS source, the collector saved untouched item and service metadata, each requested layer's metadata, pre-download count, original object-ID list, paginated feature bodies and post-download count. Feature queries use all original fields and native source geometry (`outFields=*`, `returnGeometry=true`, `f=json`); no `outSR` was applied. The current-school scope is point layer 0; the service's auxiliary table is not included. Historic schools include all three facility layers. Other services include the exact facility layer established in the prior research.

Pages request at most 250 original object IDs. Per-layer manifests record expected/returned counts, unique IDs, missing/unexpected IDs and transfer-limit flags. All seven source snapshots passed: pre/post counts match, every requested ID was returned exactly once, and no transfer limit was reported. This certifies acquisition of the exposed layer at retrieval, **not** real-world service completeness, current openings or facility suitability. There is no merged or normalized feature file.

The county register acquisition discovered PDF URLs only from the original [Tusla register page](https://www.tusla.ie/services/preschool-services/early-years-providers/register-of-early-years-services-by-county/), then saved every linked county file. All 26 succeeded. Completeness means all linked documents were downloaded; provider rows/capacities/age restrictions remain unparsed. The [OurAirports CSV](https://ourairports.com/countries/IE/airports.csv) and [original public-domain data page](https://ourairports.com/data/) also downloaded successfully, without reading or mapping CSV records.

Independent post-download verification recomputed all 192 recorded sizes and SHA256 hashes from the saved files, and checked all recorded resources returned HTTP 200. All matched. Manifests contain only allowlisted provenance headers (content type/length/encoding, last modified, ETag, date, cache and redirect metadata); anonymous session cookies were removed. Source bodies were not altered.

## Repeat collection and remaining gates

Repeatable acquisition scripts are [collect-raw-health-education.py](../../scripts/collect-raw-health-education.py) and [collect-raw-register-airports.py](../../scripts/collect-raw-register-airports.py). They require Python's standard library and public network access. Roots are resolved relative to the repository; the snapshot date defaults to the current UTC date, with `--snapshot-date YYYY-MM-DD` and `--output-root PATH` overrides. Use a new date for a later snapshot to preserve this evidence; rerunning with the same date replaces that folder's files. The second script reuses the first script's raw-fetch/checksum helpers. Exact per-request URLs and licence item bodies are preserved in the manifests rather than inferred from file extensions. Syntax and both argument-help invocations were checked without re-fetching or modifying the finished raw snapshots.

Existing research remains the interpretation reference: [national services](ireland-national-services.md), [health and journey-time sources](ireland-health-transport-times.md), and [town/transport sources](ireland-transport-location.md). Current school/Tusla GIS and county PDF reuse rights are still unresolved; collecting public files locally does not resolve publication permissions. Historical HSE data remains historical, and known swapped GP latitude/longitude attributes remain untouched. No current GP accepting-patients data, hospital capability enrichment, joins, CRS corrections or schema mappings were introduced. Those are separate later stages.
