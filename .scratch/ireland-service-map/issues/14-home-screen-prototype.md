# Explainable region dashboard after profile and service selection

Type: prototype
Status: ready for human review
Parent: ../map.md

## Current direct user decisions, 4 October 2026

Clean one-at-a-time profile questions → explicitly save household defaults → full-screen priority service selection → all matching regions with total and five pillar scores → region dashboard → criterion evidence and a small map.

Required criteria determine eligibility; preferences influence ranking. Every matching region is shown with an exact count (30, 1 or 0 in reviewed demo scenarios), without a five-region cap. A zero-result state offers requirement removal. Profile defaults remain in a top-right cart; results/detail criteria remain editable at left. The map appears only in the detail view. Five pillars are Health, Transportation, Quality of life, Education and Utilities. Clicking total/pillar/criterion scores shows matching detail.

This supersedes the earlier map-first journey, full-screen region map and green spatial scale. Green score bars now belong to cards and pillar/total summaries. Drogheda is the region example; its detail contains fictional homes while current inventory awaits a feed.

## Artifact and evidence boundary

`src/home-prototype/`, run `bun run prototype:home`, route `/prototype/home`. Shareable fictional review scenario: `/prototype/home?demo=dashboard&region=cso-urban-areas-2022%3A828`. Demo URLs never replace stored profiles.

Real region names and 2022 boundaries; fictional service evidence, metrics, service points, homes and scores. Required filtering and total/pillar averaging are demo mechanics only, disclosed in the detail view. Unknown/unselected pillars are not represented as zero. No verified service suitability, journey routing, utility connection or live property availability is claimed. No production backend, raw data or database changes.

## Verification

Prototype JavaScript bundle and Bun server typecheck pass. Browser evidence covers a quiet initial question with zero base tiles, full-screen service selection, 30 matching sample regions, one Drogheda result, zero after all services become required, requirement clearing restoring 30, total/five-pillar scores on cards/detail, inherited criteria, criterion-specific evidence/small-map changes, and a 390px mobile layout with no horizontal overflow. Prior explicit profile save/reload/cart checks remain applicable.

## Capture and answer

`codex/prototype-home` captures this flow; `codex/prototype-home-layouts` retains the superseded initial layouts. The repository has an unborn main branch; capture only prototype files and this ticket using a temporary index, preserving the shared main/index and unrelated work.

The information hierarchy is settled by direct human feedback. The prototype remains for human review; actual score normalization, evidence quality/missingness, freshness, weights and property-feed integration remain implementation work.

## Latest access criteria and visuals

Direct user decision: local access is selectable at 15/30/60 minutes on foot; hospitals default to 60 minutes by car and also expose 15/30-minute bands. GP locations/time graph, separate bus/train display, cycle-route map, nearest-airport distance, parks/green spaces/GAA clubs/community-centre access, education category toggles, and broadband/public-water indicators each get suitable visuals. Broadband is a speed criterion and water is a connection criterion, rather than walking time.

The reviewed fixture confirms a required hospital in Drogheda at 15 minutes gives zero matches, while 30 minutes gives one. Hospital bands, GP graph, bus/train switch, cycle lines, education category switch, and mains-water status were inspected in-browser. Exploring an unselected education category does not add it to the total. Prototype data remains illustrative, with no real routed times or verified connections.

Review shortcut: `/prototype/home?demo=access&region=cso-urban-areas-2022%3A828&pillar=health&criterion=health.gp`.
