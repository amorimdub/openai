# Finish expanded data APIs and connect the React demo

Type: task
Labels: wayfinder:task
Status: resolved
Assignee: root
Parent: ../map.md
Blocked by:

## Question

Complete the user-authorized expanded raw-to-common-schema backend and connect the existing `codex/prototype-home` prototype at `abc13ad` to live data through a simple React frontend. Preserve untouched originals and the other chat's prototype. Use subagents and native macOS containers, verify browser/API/database behavior, and document the runnable local handoff. Public/OpenAI Sites deployment remains a later stage. Human scoring, routing and availability decisions remain open.


## Answer — 4 October 2026

Completed the expanded backend and connected local React demo, preserving `src/home-prototype` and the referenced prototype commit. Hono/Bun and the production React build run in native macOS containers with PostgreSQL/PostGIS and a persistent volume. Frontend: http://127.0.0.1:5173; API: http://127.0.0.1:3080; OpenAPI contract: `/openapi.json`.

Published 1,709,202 canonical records across 41 active scopes. All 39 raw groups are accounted for, 518 original files remain byte/hash unchanged, and 79 invalid inputs are explicitly quarantined. Geometry, raw provenance, source reuse and historical dates remain part of the shared schema. Current DOE/Tusla and ESB reuse gates remain explicit; GTFS schedules/routing remain later analytical work.

React adapts the other chat’s prototype, supports real town search, representative town anchors, household/transport preferences, flexible criterion selection, actual service GeoJSON layers and explicit publisher-region selection for historical buying/renting context. The final browser journey showed seven criteria around Galway, dated hospital records, 2025Q4 rental observations with publisher bedroom labels, loaded attributed map tiles, and no console warnings/errors. Scores and household fit remain unknown.

Verification: 75 tests / 56,509 assertions passed without skips, including real isolated PostGIS tests; backend/frontend/static-server TypeScript and production React builds passed. All 11 final live API checks passed. Initial multi-criterion timeout evidence is retained; indexed category/spatial candidate filtering fixed the query path without changing exact radius semantics. Final frontend image was rebuilt after the bedroom-label polish and checked again in the browser.

[Connected-demo acceptance](../../../docs/research/connected-demo-acceptance.json), [live API acceptance](../../../docs/research/connected-demo-api-verification.json), [map screenshot](../../../docs/research/connected-demo-map.png), [handoff and restart instructions](../../../docs/BACKEND-HANDOFF.md). Public HTTPS/OpenAI Sites deployment, approved scoring, routing, current availability and household utility evidence remain later work. Other human decision tickets are not answered by this implementation.
