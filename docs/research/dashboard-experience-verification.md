# Dashboard experience verification — 5 October 2026

Local implementation and rendered verification. These findings do not establish Production deployment, current service availability, accepted suitability scores or routed journey times.

## Implemented

- Dashboard location switching retains criteria and resets costs for a different town.
- Applied location, radius and criteria stay together; draft changes are visibly pending.
- Combined points, lines and polygons are coloured by category. Shared record IDs appear once with all criterion memberships. Layer toggles, geographic radius, publisher tooltips, viewport fitting and further spatial pages are available.
- Area KPIs show distinct loaded records and criteria with map evidence. Reviews retain unknown suitability and show publisher dates, record geometry distances and source limitations.
- Rental and mortgage estimates include transport, utilities, household expenses and per-selected-service recurring costs. Blank and invalid costs remain unknown; complete costs and an explicit monthly household budget are required for headroom.
- Explicit publisher geography selection exposes historical housing observations. Using one as a housing assumption retains its geography, period, statistic, property type and bedroom class. Manual housing edits clear the provenance.
- Costs survive priority edits and reset for another place or tenure. The location picker uses a native modal dialog with Escape dismissal. Document scrolling returns to the top after setup.

## Automated checks

- Root TypeScript check: passed.
- `bun test`: 76 passed, 7 skipped, 0 failed. The skipped PostGIS group is separately exercised below. Existing national raw fixtures were made available through an ignored `data/raw` symlink to the original checkout's archive; source files were not changed.
- Frontend domain coverage includes unknown costs, explicit zero costs, rental totals, positive and negative headroom, mortgage amortisation (including zero interest), invalid assumptions, deduplication of shared point/line/polygon records, arbitrary criterion counts, and preference defaults matching the displayed controls.
- `POSTGIS_TEST_URL=... bun run test:postgis`: 5 passed, 0 failed, using its own disposable database.
- Frontend TypeScript and Vite build: passed both locally and in the final container build.
- `git diff --check`: passed.

## Browser evidence with real imported data

Playwright CLI, Chromium; local Hono/PostGIS API with 1,709,202 records and 41 source scopes.

- Naas, 10 km, hospital / public transport / parks / green areas / shops / primary school / childcare: seven layers, 443 distinct initial mapped records, five source snapshots.
- Hiding public transport: visible count changed from 443 to 343; restoring it returned all layers.
- Transport paging: 100 records increased to 149; combined map and KPI both increased to 492.
- Rent 1,750 + transport 280 + utilities 180 + household costs 130 + childcare 100 (other service costs explicitly 0): monthly estimate 2,440, headroom 60 against a monthly household budget of 2,500. The final rebuilt demo repeated this check and preserved rent 1,750 through priority editing.
- Explicit Naas market region `CSO_RIQ02_C03004V03625|145900`: 2025Q4 observations returned with property type and bedroom class. Using the two-bedroom apartment observation populated rent 1,816.81 with labelled historical provenance; manual editing cleared it.
- Changing Naas to Cork city and suburbs refreshed seven selected services to 540 initial distinct mapped records, cleared housing cost inputs and restored the unknown monthly subtotal.
- Required hospital change showed a pending-change notice, then a missing-suitability-evidence notice after application.
- Native location picker dismissed with Escape.
- Final setup verified both window and root scroll positions were 0.
- At 390 px width the document width was 390 px; no horizontal overflow. Desktop and mobile screenshots were visually inspected.

Screenshots: `output/playwright/dashboard-desktop.png` and `output/playwright/dashboard-mobile.png` (ignored local artifacts).

## Runtime

The final frontend image was rebuilt and served at `http://127.0.0.1:5173`; compiled JavaScript asset `index-BXXVnypd.js`. The database/API/frontend were found stopped during verification and restored using the repository scripts. The frontend proxy was recreated after the API's address changed. Subsequent readiness returned 1,709,202 records and 41 active source scopes, and the final browser flow passed against that restored API. No cause for the interruption was established.

## Remaining data limits

Counts reflect loaded pages; “+” identifies additional pages. The review is source evidence, not certified access, eligibility, home availability or quality. Historical school and hospital dates remain visible. Nearest-point assessment is independent within 50 km, and is labelled accordingly. Geometry distances are not routed journeys or entrance distances. Housing observations do not imply a town crosswalk, household bedroom match, available dwelling or actual property price. Service costs are entered assumptions; no prices are inferred from locations. Mortgage estimates use a constant annual interest rate and exclude upfront deposit and purchase fees from monthly totals.
