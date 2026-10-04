# Ireland raw data collection

Raw collection is complete. The subsequent [common-schema slice](COMMON-SCHEMA.md) now publishes 41 source scopes and 1,709,202 accepted records in PostGIS, with 79 inputs explicitly quarantined. Original downloads remain unchanged; the collection counts below describe the raw stage.

Files are saved locally under `data/raw/<source>/2026-10-04/`. Each source has a manifest identifying download URLs, fetch times, original format, source period where known, licence evidence, hashes and completeness. API pagination is retained as original page responses. A complete endpoint download does not certify national service coverage or current availability.

Raw files are excluded from Git, including sources whose public reuse permission is unresolved. Copying them to a published API/database requires checking each manifest's reuse status. Source research remains in [the research catalogue](DATA.md).

Run `bun run data:inventory` after collectors finish. It reads bytes to produce `data/raw/inventory.json` with file sizes and SHA-256 checksums, without parsing source records. Downloaded `.part`/`.tmp` files are listed as incomplete and excluded from complete-file totals. The inventory is a local integrity record; consult individual source manifests for remote completeness.

## Collection status

Three subagents completed the collection, with a separate Smart Dublin catalogue capture. Saved **39 source folders**: **38 groups with downloaded data/metadata**, and **one ESB reuse-gate folder containing evidence only**. The local inventory contains **518 files, 1,119,838,617 bytes (about 1.12 GB)**. No unfinished temporary downloads remain.

An independent byte inventory matched **all 444 file size/hash claims** in the source manifests, with **zero mismatches**. ZIP integrity and the OSM publisher checksum also passed. See [integrity evidence](research/raw-integrity-check.json) and the local [file inventory](../data/raw/inventory.json). These checks establish download integrity; licences, timeliness and real-world coverage remain source-specific.

| Area | Saved originals | Qualification |
|---|---|---|
| Health | HSE hospital and GP native ArcGIS responses: 132 hospital records and 6,608 GP records | Historical 2020 directory; GP records are not deduplicated practices |
| Education | Current schools (3,938); historical schools (3,974); Pobal childcare (5,075); Tusla GIS (6,593); all 26 linked county PDFs | Current-school and Tusla reuse unverified; PDFs are July 2026 files; ages/vacancies not interpreted |
| Transportation | National GTFS ZIP, NaPTAN stop JSON, OurAirports Ireland CSV and full OSM PBF | 17,161 NaPTAN records; timetable calendars and airport suitability remain unparsed |
| Quality of life | Sport Ireland clubs (8,496) and activity locations (5,507), council parks/community exports, national OSM extract | Static directories; OSM shops/parks tags remain unparsed; council datasets overlap |
| Utilities | ComReg 26 county and 18,919 small-area polygons; Uisce XLSX; EPA 35 RAL features; GSI 357 public and 254 group-water protection features; four Dublin authorities' lighting | Area/infrastructure context does not prove an individual home's connection; lighting records do not prove working lamps |
| Buying/renting | PPR all-sales ZIP; CSO HPM05/HPM07/HPM08/HPM02 and RTB RIQ02 JSON-stat responses | Original historical statistics, not current listings; openly licensed RIQ02 ends Q4 2025; latest restrictive RTB files uncollected |
| Housing and location | Q1 2026 housing construction CSV; CSO 867 town/urban-area polygons; Smart Dublin catalogue with 159 datasets/1,250 resource descriptions | Housing CSV has no coordinates; towns omit many rural localities; catalogue metadata is separate from dataset payloads |

Counts are exposed source records and may overlap. The collection itself did not classify, deduplicate, score or import records; the later common-schema stage is documented separately. API inspection was limited to acquisition metadata, record counts, IDs and transfer checks. Original encodings, fields and native coordinate systems remain intact.

Collection details and repeatable helpers:

- [Health, education, town boundaries and airport collection](research/ireland-raw-health-education.md): `scripts/collect-raw-health-education.py` and `scripts/collect-raw-register-airports.py`.
- [Utilities, housing and council source evidence](research/ireland-utilities.md): `scripts/collect-raw-utilities-housing.py`.
- [Market, transport and quality-of-life collection](research/ireland-raw-market-transport-quality-of-life.md): `.scratch/ireland-service-map/collectors/market_transport_qol.py` and its verification helper.

Collectors resolve paths relative to this repository and support `--date YYYY-MM-DD`, defaulting to the current UTC date. Reusing a date overwrites that collector's snapshot; preserve previous folders before refetching. Restricted ESB data is not downloaded into the open-data bundle. The OSM original covers Ireland and Northern Ireland; Republic clipping belongs to the later parsing stage.

## Common-schema parsing stage

The expanded parser programme reads stored originals into the shared version-2 schema, retaining source IDs, licences, reference periods, coverage and unknown values. Remaining source plans and gates are explicit in [the adapter registry](../config/source-adapters.json). Validate pagination, coordinates, encodings and duplicates before importing. Do not infer household utility connections, school vacancies, clinical suitability, live property availability or journey times from point proximity or area statistics.

The existing `data/towns.*` and `data/pobal.*` files are prototype canonical/sanitized exports created before this raw-first instruction. They are separate from untouched original archives. The local prototype database currently contains the town snapshot only.
