# Profile → services → region dashboard prototype

Question: does an explainable, score-first region journey make the service data easy to understand?

Run `bun run prototype:home`, then open <http://localhost:4317/prototype/home>. The captured branch also runs with `bun run src/home-prototype/server.ts`.

Latest direct user decisions, 4 October 2026:

1. Answer clean profile questions, one at a time. Start with anywhere that fits or a specific region. Ask people/ages, bedrooms, rent/buy, optional budget, transport and car availability.
2. Save the household defaults explicitly. The cart-style top-right profile remains fixed while service priorities change.
3. Select services on a full-screen page across Health, Transportation, Quality of life, Education and Utilities. Mark selections required or preferred. No map is visible during profile setup, service selection or region results.
4. Show every matching region, with its total score, five pillar scores and concise reasons. Counts are exact, with no arbitrary five-region cap.
5. Click a region/score to open its dashboard carrying the current criteria. The total score and five pillar scores drill into each selected criterion's data and matching reason.
6. Only the detail view contains a small map, showing the region and an example service point. Dynamic criteria remain editable at left; the saved household profile remains at top right.
7. Zero results prompt removal of requirements. Removing them updates the count. An incomplete specific-location selection asks for a region instead.

The latest journey supersedes the earlier full-screen map and spatial green-scale result view. Green bars now communicate region, pillar and total scores. Drogheda's detail also includes fictional home examples, filtered by bedroom and budget choices; live availability needs a listing feed.

## Demo data boundary

Real canonical region names/boundaries are connected. Service evidence, journey values, broadband values, map service points, home listings and scores are fictional interaction fixtures. Nothing here establishes live suitability, service eligibility, routed journeys, verified utility connections or current property availability. Research data, raw archives and the database are untouched.

Thirty sample regions use complete fictional service evidence. Local-service criteria use a user-selected 15, 30 or 60 minute walk. Hospitals default to a 60 minute drive, with 15/30/60 options. Required services must meet the actual selected access limit in the fixture; preferences still influence the average. Time scores are a simple demo function of fixture minutes relative to the limit. Broadband uses a minimum 100/500/1000 Mbps choice. Public mains water and mapped cycle routes use example presence; airport access shows nearest example distance. Required selections have weight 2 and preferences weight 1 in total/pillar averages. Unselected pillars show no score rather than zero. These mechanics are disclosed, not a validated scoring policy.

Service-specific views: hospital 15/30/60-minute car-access bands; nearest-GP time graph plus mapped GP points; bus-stop/train-station display toggle; mapped cycle routes; nearest-airport distance; walking access for parks, green spaces, GAA clubs and community centres; childcare/primary/secondary map toggles; broadband speed scale and public-water connection status. Education toggles can explore an unselected service without adding it to the total. Water and broadband do not get fabricated service-point markers. All map service points/route lines are illustrative; actual journey times, connections and coverage need evidence and routing integration.

## Review shortcuts

- `/prototype/home?demo=access&region=cso-urban-areas-2022%3A828&pillar=health&criterion=health.gp`: all requested service examples, with GP detail.
- `/prototype/home?demo=services`: full-screen service picker with a fictional household.
- `/prototype/home?demo=regions`: 30 regions with no selected services/no asserted scores.
- `/prototype/home?demo=dashboard`: 30 scored regions, with one preference per pillar.
- `/prototype/home?demo=dashboard&region=cso-urban-areas-2022%3A828`: Drogheda detail, total and all five pillar scores.
- `/prototype/home?demo=drogheda`: a single-region search with a primary-school preference.

Demo URLs never write or replace a saved profile. Normal “Save profile” persists people/ages/transport plus initial search defaults in this browser (`find-your-place.prototype.profile.v1`). Service selections remain in memory. “Start again” starts an unsaved setup while leaving the previous saved bundle intact until replacement. No account, server profile storage or external submission.

“Prototype state” exposes the current view, selected region, criteria and saved profile snapshot; hidden with `NODE_ENV=production`.

Map: [Leaflet 1.9.4](https://leafletjs.com/reference.html) with [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/), with visible attribution. Internet is needed for the library, font and base tiles. `places.geojson` copies the 867 already-exported CSO/Tailte Éireann 2022 urban geometries from the existing `data/towns.ndjson`; raw archives and the database are unchanged. Source: [urban-area layer](https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer/5). Licence: CC BY 4.0. Urban areas do not cover every rural locality.

`ireland.geojson` is the Ireland feature from [Natural Earth's 1:10m Admin 0 countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/), downloaded from its [publisher-maintained repository](https://github.com/nvkelso/natural-earth-vector). [Public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). It is a display mask, not a property, service or scoring boundary.

Validation: targeted JavaScript bundle and Bun server typecheck pass. Browser checks verified clean map-free setup (zero base tiles), full-screen service selection, exact 30/1/0 result counts, requirement clearing restoring 30 results, total/five-pillar scores on cards and details, criteria carried into Drogheda, criterion-specific data/map updates, a 390px mobile dashboard without horizontal overflow, and service-specific graph/map/toggle views. A required Drogheda hospital at 15 minutes gives 0 regions, and changing it to 30 minutes restores 1; a preferred access-time change also changes the score. Earlier save/reload and profile/cart consistency checks remain applicable. Review screenshots contain fictional data only.

Sources: [research overview](../../docs/DATA.md), [domain language](../../GLOSSARY.md), [criterion registry](../../config/criteria.json).

Capture: `codex/prototype-home` holds the current throwaway snapshot; `codex/prototype-home-layouts` preserves the superseded three-layout exploration. Shared unborn `main` and its index remain unchanged. [Design ticket](../../.scratch/ireland-service-map/issues/14-home-screen-prototype.md).

Verdict: the journey and information hierarchy are direct user decisions. This implementation is a reviewable prototype, not a production assessment.
