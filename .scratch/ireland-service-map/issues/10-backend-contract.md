# How should a Bun and Hono backend share snapshots, storage, preferences and layers?

Type: prototype
Labels: wayfinder:prototype
Status: claimed
Assignee: backend_api
Review: needs human review
Parent: ../map.md
Blocked by:

## Question

User explicitly requested a backend subagent, confirmed Hono and Bun (not Nango), and confirmed a shared data schema plus a preferences object selecting one or more criteria without an upper cap to generate layers. Define a concrete backend contract: official sources into versioned files, separately validated database loading, common normalized schema, five-vertical criterion registry, preferences, layer/assessment responses, provenance/coverage, local storage, idempotent imports, unknown states and verification. Frontend is explicitly out of scope. Produce a reviewable backend design and runnable local foundation if feasible without external credentials; do not invent travel times, utility connection status, live listings, licensing permissions, or settled scoring weights.



## Comments

Backend-only implementation is reviewable locally in `src/`, `config/`, `schemas/` and [Backend contract](../../../docs/BACKEND.md). Hono + Bun uses canonical discriminated version-1 records shared between NDJSON, SQLite and layer responses; a separate validated, atomic/idempotent import consumes public-source files. Criteria accept one or more distinct IDs without an upper cap. Reviewed Pobal/CSO exporters preserve provenance, public fields, source count and null-location records; timed/specialty/property requirements stay unknown. Configuration is proposed, data coverage partial, and current `rankingReady` remains false. This is an implementation/validation comment, not a human acceptance verdict.

Validation: `bun test` passed 9 tests with 45 assertions; `bun run typecheck` passed. Tests cover import replacement/failure preservation, criterion counts beyond seven, API preferences/layers/unknowns, source pagination/privacy and null geometries. Parent agent is independently running public-source exports and HTTP checks. No branch, commit, push, deployment or frontend created.

Latest direction: raw-source collection first, parsing after schema review. Backend foundation preserved; no further adapters/imports performed by this subagent. Existing exporter `.source.json` files are sanitized source-shaped derivatives, distinct from independently collected raw artifacts. Human review still needed; ticket remains claimed/open.
