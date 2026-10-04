# Choose a feasible Ireland service-access map for the hackathon

Labels: wayfinder:map
Status: open

## Destination

Establish evidence-backed source coverage and a backend foundation for an Ireland-wide household-location assessment across health, transportation, quality of life, education and utilities, with buying/renting context. Use Bun and Hono, a shared file/database record schema, and preferences selecting a flexible number of criteria to generate map layers. Connect the existing home prototype to these live APIs using a simple React frontend and verify the local demo.

## Notes

- Current execution override: the user requests completion of the backend and integration of the other chat’s frontend prototype (`codex/prototype-home`, `abc13ad`), using subagents as much as possible. React integration and native macOS containers are authorized; public/OpenAI Sites publishing is later. [Finish expanded data APIs and connect the React demo](issues/20-connected-demo-handoff.md) records this combined handoff. Earlier stage exclusions below are historical.

- Latest user request: research outbound pre-filtered home-search links after choosing an area, using MyHome.ie, Daft.ie and alternatives. Listings stay on the providers' sites; fetching their inventory and implementing the link UI are outside this research ticket. See [property-search link feasibility](issues/18-property-search-links.md).

- Completed the user-authorized [common-schema/PostGIS slice](issues/17-common-data-search-slice.md): 83,620 records/seven scopes, native Apple containers, indexed Hono searches, 35 passing tests and ten live HTTP checks. Remaining adapters and scoring remain open.
- The user's “next” advances the recommended common-schema/PostGIS implementation slice in [common records and indexed search](issues/17-common-data-search-slice.md). Raw-to-canonical parsing and a local PostGIS loader/search API are now authorized for the representative batch; original downloads and the legacy SQLite prototype are preserved.
- Latest research request: define the common schema next; compare map renderers and SQLite versus PostgreSQL/PostGIS, and audit existing search endpoints. [Next data-stage proposal](../../docs/NEXT-DATA-STAGE.md) records recommendations, not an accepted implementation decision. No raw parsing or database migration is authorized by this research request.
- 2026-10-04 latest direction: a throwaway home-screen prototype with quiet one-question profile setup, open/specific location first, explicit local profile save, then an Ireland-only map. Saved people/ages/main transport belong in a top-right cart; dynamic service priorities stay on the left. See [home-screen prototype](issues/14-home-screen-prototype.md). This authorizes bounded frontend exploration and browser profile persistence after the prior backend-only stage; final results and scoring remain open.
- User requested research and planning; application implementation is a later stage. On 2026-10-04 the user clarified nationwide coverage and a household questionnaire.
- Latest user direction explicitly requests backend work and an API subagent, confirms **Hono + Bun**, and confirms a shared schema with criterion preferences and generated layers. The number of criteria is flexible (one, two, seven or more), without a fixed count/cap. Backend contract/foundation work may proceed in this effort; do not introduce Nango. User explicitly excludes frontend work for now.
- Latest stage instruction: use subagents to collect and save **untouched raw data now**, then parse once the schema is reviewed/in place. Preserve the already-built local backend foundation; stop further normalization and database loading during raw collection. Raw collectors may execute their AFK task tickets.
- Required layers: schools, hospitals, community centres, public transport, crèches, parks, and government housing projects.
- Expanded verticals confirmed by the user: health (hospital within 30 minutes or GP within a one-hour drive), transportation (airport/car/public transport/bike), quality of life (clubs/parks/community/activities/green areas/shops), education (primary/secondary/childcare), utilities (group water/public mains, ESB electricity AND street lighting/broadband). Budget research includes BOTH buying and renting, confirmed by the user.
- Offline imports are acceptable. The API should manage normalized data and scoring. The questionnaire is in scope: room needs, school needs and children's ages/named schools, hospital access, community amenities, car versus public transport, parks, and participation in a government housing scheme. Advanced scoring-weight sliders remain a future stage; ordinary household preferences are now in scope.
- Use wayfinder, research, grilling, and domain-modeling skills. Primary sources support dataset findings.
- The local Markdown tracker is the fallback described by `.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md`. Run `/setup-matt-pocock-skills` later if the team wants a configured remote tracker.
- Confirmed by the user: all Ireland, town/city first, household questionnaire, government housing as an information layer. Final result behavior and service-needs versus medical-condition questions await clarification in the demo-contract ticket. Interpret all Ireland as the Republic provisionally; Northern Ireland sources require a separate clarification if intended.
- Research assets live under `docs/research/`. This repository has no initial commit; research branch isolation cannot be established from an existing base. Preserve local findings without fabricating a commit or changing the shared branch.
- Claim tickets before investigation; record research answers in tickets and link their assets here. Human decisions remain open until answered.

## Decisions so far

- [Finish expanded data APIs and connect the React demo](issues/20-connected-demo-handoff.md): completed local React + Hono/PostGIS integration in native macOS containers; 1,709,202 records/41 scopes, 75 passing tests and all 11 final HTTP checks. Scoring and public deployment remain later work.

- [Can selected areas and housing filters open Irish property websites directly?](issues/18-property-search-links.md): Daft and Property.ie preserve supported filters; MyHome works technically but its published terms restrict deep links. Provider-area mappings remain a human decision.

- [Which map renderer and basemap are easiest for the Ireland service layers?](issues/15-map-renderer-research.md): MapLibre is recommended for nationwide layers; Leaflet has less setup for a bounded demo. Basemap hosting remains separate.
- [Should the common Ireland dataset use SQLite or PostgreSQL/PostGIS?](issues/16-spatial-database-research.md): existing SQLite is a local JSON prototype; PostGIS is recommended for the complete nationwide spatial backend, with SQLite/RTree as the simpler limited-demo option. The user subsequently advanced the PostGIS implementation slice and native macOS container runtime.
- Raw-source collection is complete for this stage: [raw catalogue](../../docs/RAW-DATA.md), 39 source folders including one ESB evidence-only gate, 518 local files/about 1.12 GB, all 444 manifest hash/size claims matched. [Health/education](issues/11-raw-health-education.md), [utilities/housing](issues/12-raw-utilities-housing.md) and [market/transport/QoL](issues/13-raw-market-transport-qol.md) record acquisition outcomes. The subsequent representative parsing/PostGIS slice is complete; remaining adapters are explicitly deferred or reuse-gated.
- [Which local Dublin datasets can supply community, parks, and housing layers?](issues/01-local-services-data.md): national parks/community coverage needs a qualified baseline plus council enrichment; housing has a national construction report but mapping requires verified locations.
- [Which national datasets can supply schools, hospitals, and crèches?](issues/02-national-services-data.md): Pobal points are reusable; current school reuse is unconfirmed, hospital points are historical, and availability/suitability require enrichment.
- [Which transport, boundary, and address sources make the map feasible?](issues/03-transport-location-data.md): offline NTA transport and CSO/Tailte town data support a Republic-wide selector; exact address lookup, routing and Northern Ireland have separate gates.
- [Which sources can support health and transport journey-time requirements?](issues/07-health-transport-time-data.md): genuine mode/service evidence is required for timed checks; current GP availability and router results remain unproven.
- [Which open sources can establish water, electricity, lighting, and broadband coverage?](issues/08-utilities-data.md): ComReg aggregate coverage is reusable; water and lighting are qualified context, while household connections and ESB redistribution remain unverified.
- [Which sources can support regional housing budgets and expanded quality-of-life layers?](issues/09-budget-qol-data.md): CSO supports typed sale summaries, RTB supports rent categories, and Sport Ireland supplies national clubs/venues; live availability is not established.

## Not yet specified

- Which expanded categories are reliable enough for scoring versus information once utility/GP/routing/price data gaps are understood.
- Which results layout best serves the still-open result contract; coverage and source-age explanations will need visible space.
- What demo acceptance evidence is practical once the input behavior and geographic boundary are settled.

Research overview and reviewable proposals: [hackathon research and scope](../../docs/DATA.md). The [score configuration draft](../../docs/research/scoring-config.draft.json) is an asset for the open score-contract ticket, not a resolved scoring decision.

## Out of scope

- Advanced scoring-weight controls on screen, accounts, and stored home/work histories: outside this planning destination. Ordinary household criteria are in scope following the user's clarification.
- Public deployment/OpenAI Sites publishing and live operational integrations remain later work. The user has now authorized the local connected React frontend.

Latest home prototype decision (4 October 2026): profile questions → full-screen service priorities → scored matching-region cards → total/five-pillar dashboard → criterion detail with a small map. This supersedes the map-first result view. See `issues/14-home-screen-prototype.md` and throwaway branch `codex/prototype-home`; scores and property examples remain fictional.
