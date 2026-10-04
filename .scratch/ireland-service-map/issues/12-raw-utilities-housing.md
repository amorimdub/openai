# Collect raw utility, housing and council amenity source snapshots

Type: task
Labels: wayfinder:task
Status: resolved
Assignee: local_services_research
Parent: ../map.md
Blocked by:

## Question

Save original public files/API responses for utilities, government housing and relevant council parks/community layers, with source URLs, licence evidence, timestamps, hashes and coverage/download status. Preserve incomplete and reuse-restricted status explicitly. No canonical parsing or database import; individual-property connections must not be inferred.

## Answer

Saved 216 untouched original HTTP bodies (398,275,662 bytes) in 21 collected source snapshots plus one ESB licence-gate snapshot under `data/raw/<source>/2026-10-04/`, each with URL/time/header/bytes/SHA256/licence/period/count/gap provenance. ComReg 26 counties +18,919 small areas, EPA35 points, GSI357 public +254 group catchments, Fingal35,170 lights all checked complete against source counts/IDs. Council parks/community/lighting originals, Uisce XLSX and housing Q1 CSV retained; internal XLSX/CSV/GPKG parsing deferred. SDCC lighting exports35,280 features but independent expected count unknown; catalogue403 recorded. ESB terms/publication pages saved, workbook excluded pending reusable permission. Fingal community coordinate defect quarantined. No normalization/import.

Final source-folder/count ledger: `docs/research/ireland-utilities.md`, raw collection appendix. Repeatable helper: `scripts/collect-raw-utilities-housing.py` (repo-relative root, configurable/current-UTC snapshot date). No research branch or commit due unborn repository.
