# Collect raw health, education, childcare and place source snapshots

Type: task
Labels: wayfinder:task
Status: resolved
Assignee: national_services_research
Parent: ../map.md
Blocked by:

## Question

Save original public source files/API response bodies for health, education, childcare and town/place data, with per-source retrieval manifests, hashes, licence evidence and download/completeness status. Preserve raw data separately from previously normalized prototypes. No canonical parsing, enrichment, scoring or database import in this collection stage.

## Answer

See [raw health, education, childcare, towns and airports collection](../../../docs/research/ireland-raw-health-education.md). Saved nine source folders under `data/raw/<source>/2026-10-04/`: seven complete ArcGIS facility/place snapshots with 27,187 original source records; all 26 Tusla county PDFs plus register page; and original OurAirports Ireland CSV/public-domain source page. All 192 recorded response bodies (28,027,007 bytes) passed independent byte-size and SHA256 verification. ArcGIS IDs/pre-post counts match. PDF/CSV rows remain unparsed. Historical periods, unresolved reuse rights and source-population gaps remain explicit in manifests. Repeatable collectors saved under `scripts/`.
