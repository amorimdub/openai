# Ireland household-location map: research and proposed hackathon scope

Observed **4 October 2026**. Source research establishes Republic of Ireland coverage; Northern Ireland official sources are not yet validated. A local Hono/Bun backend foundation exists. This collection makes no frontend or deployment changes. Raw collection is complete; the subsequently authorized [common-schema/PostGIS slice](COMMON-SCHEMA.md) has expanded to 1,709,202 loaded records across 41 source scopes. Remaining parsers and reuse gates are listed in the adapter registry. This research describes source suitability, not a completed nationwide ranking.

The product should answer: **“How well does this location fit my household's needs and budget, and what still needs checking?”** Start with a town/city, collect household criteria, then explain the five verticals beside a map. Budget provides buying and renting context. Government housing projects remain informational.

## Confirmed user requirements

- Nationwide town/city selection and a user-first household questionnaire.
- **Health:** hospital access within 30 minutes when needed, or general GP access within a one-hour drive; specific service needs may differ.
- **Transportation:** airport proximity, car ownership, public transport reliance and cycling.
- **Quality of life:** clubs, parks, community centres, activities, green areas and shops.
- **Education:** children, primary/secondary schools, named schools and daycare/childcare needs.
- **Utilities:** group/community water schemes, public mains water, ESB electricity, public street lighting and broadband. Electricity and lighting were explicitly confirmed as separate requirements.
- **Budget:** both buying and renting; regional house/apartment sale-price and rent evidence.
- Offline imports are acceptable. The API should manage normalized data and scoring. Rules and points should be editable in JSON; advanced on-screen weight sliders are later work.

Final result behavior remains open: rank suitable areas around a selected town, assess only the chosen location, or return available properties. Research can support area assessment; matching an available dwelling also needs a permitted current inventory with prices and room counts. Clarify whether “rooms” means bedrooms or total rooms before building that filter.

## How the five verticals become an assessment

| Vertical | Household input | Meaningful output | Evidence needed |
|---|---|---|---|
| Health | Required care/service or named facility; hospital/GP time limit; travel mode | Relevant facility, estimated route time and requirement status | Current facility/service classification plus a mode-specific route. A generic hospital point cannot establish clinical suitability or accepting patients |
| Transportation | Car/public transport/bike; airport need; relevant destinations | Served stops, dated timetable evidence, reachable destinations, airport/cycling access | GTFS calendars for transit; roads/paths and a suitable router for journeys. Stop counts alone do not establish a useful commute |
| Quality of life | Which amenities/activities matter and acceptable proximity | Nearby venues/shops/parks and source-linked details | Classified features, public access where known, dated event records for current activities. Venues do not prove activities are running |
| Education | Childcare/primary/secondary need, children’s ages, optional named schools | Level-matched facilities and distances; unknown admissions/age suitability shown | School level/named-school data; regulated childcare ages if age matching is promised. Enrolment/capacity is not vacancies |
| Utilities | Water options, electricity, lighting and required broadband service | Coverage/connection evidence and explicit verification gaps | Property/service-area evidence. Nearby infrastructure or planned rollout does not confirm an individual home is connected |

Recommend asking about the **service access needed**, rather than retaining medical-condition free text. The user's 30- and 60-minute examples are preference thresholds, not clinical standards. Car possession is context for other routes, not a quality bonus by itself.

Use three requirement outcomes: **supported**, **not met with verified evidence**, or **unknown**. A required category with missing evidence must not become a zero-quality judgement about the town. An unknown requirement remains unresolved rather than excluding a location as if it failed.

## Initial verified sources

| Layer | Primary source | Evidence obtained | Important limitation |
|---|---|---|---|
| Town/city | [CSO/Tailte 2022 urban areas](https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer/5) | All **867** polygons fetched in WGS84; publisher item CC BY 4.0 | Built-up statistical areas, not every rural locality; pin fallback needed |
| Schools | [Department current school layer](https://services-eu1.arcgis.com/9HteQxumPOXiqlpG/arcgis/rest/services/Schools_Map_WFL1/FeatureServer/0) | **3,938** records by count query; sample/schema/type/year checks | Exact current item's reuse license absent. Licensed 2014/15 mirror is historical only |
| Hospitals | [GeoHive/HSE Health Atlas](https://www.arcgis.com/home/item.html?id=feb34881088341bbbf80d86af6a4f333) | **132** records; geometry/category samples; CC BY 4.0 | Underlying data **2020**; requires current service/status verification |
| Childcare | [Pobal facilities](https://www.arcgis.com/home/item.html?id=4bea2229af6b456ea362b3514b38d70a) | **5,075** records; sample/WGS84/schema checks; CC BY 4.0; layer edited September 2026 | Includes more than baby crèches; ages, vacancies and national completeness unproven |
| Childcare enrichment | [Tusla county registers](https://www.tusla.ie/services/preschool-services/early-years-providers/register-of-early-years-services-by-county/) | July 2026 Dublin PDF with ages/types/capacity; national GIS sample | Reuse, PDF parsing and GIS joins unresolved; capacity is not availability |
| Stops/schedules | [NTA public transport data](https://www.transportforireland.ie/transitData/PT_Data.html) | National stop JSON parsed: **17,098 active** records; national GTFS download available; LUAS sample parsed; CC BY 4.0 | Full national calendars/operators not yet validated; active stop presence alone insufficient |
| Parks/community | [Council datasets](https://data.smartdublin.ie/organization/dublin-city-council) plus proposed [OSM snapshot](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html) | DCC 99 community features and 90 park points parsed; other council examples checked | Uneven national completeness; OSM full-country import untested; source-specific dates/licenses needed |
| Government housing | [Q1 2026 construction report](https://opendata.housing.gov.ie/dataset/social-housing-construction-status-report-q1-2026) | CSV parsed: **3,208 schemes**, **31 local authorities**, stages/units; CC BY-SA 4.0 | No coordinates; start with local-authority lists and vetted pins. Does not establish available homes/eligibility |

Expanded source research:

| Layer | Usable source or candidate | Verified scope / constraint |
|---|---|---|
| GPs | [Historical GeoHive/HSE practices](research/ireland-health-transport-times.md) | Licensed 2020 points; clinician/practice deduplication and current accepting-patients status unresolved; coordinate attributes need correction via actual geometry |
| Airports/cycling | [Airport and route research](research/ireland-health-transport-times.md) | Public-domain airport fallback; protected-cycle lines are a Dublin subset. Journey compliance requires a router and genuine service/mode evidence |
| Clubs/activities | [Sport Ireland](https://services-eu1.arcgis.com/CltcWyRoZmdwaB7T/arcgis/rest/services/GetIrelandActiveClubs/FeatureServer/0) | CC BY 4.0; 8,496 club and 5,507 activity-location records sampled/counted. These are venues, not live activity/event inventory |
| Broadband | [ComReg public statistics view](https://services-eu1.arcgis.com/pvZmdFc5up2jdiPm/arcgis/rest/services/Ireland_Gigabit_Statistics_Public_View/FeatureServer) | CC BY 4.0; county/small-area polygon coverage percentages. Current and planned indicators differ; no individual-address service guarantee |
| Water | [Uisce open data](https://www.water.ie/open-data), EPA/GSI context | 692 supply-zone directory entries; no service geometry in that workbook. Group-water protection catchments are not household service areas |
| Electricity/lighting | [Utility evidence](research/ireland-utilities.md) | ESB workbook public reuse permission unresolved; open lighting inventories are older council subsets. Neither establishes a working domestic connection |
| Purchase budget | [CSO HPM05](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM05/JSON-stat/2.0/en) | Monthly EUR means/medians/counts split house/apartment by region, through July 2026. No bedroom dimension; retain classification-imputation and geography caveats |
| Rental budget | [RTB RIQ02 via CSO](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en) | Licensed average monthly rent by location/type/bedrooms, fetched through Q4 2025, many suppressed cells. Separate latest Q1 2026 report reuse/acquisition gate |

Counts are observed source records, not assurances of completeness or currently available services. Exact endpoints, licenses, schema checks and unresolved gates live in the research reports linked below.

## Budget model

Keep purchase budget and monthly rental budget as separate inputs. Prefer official **CSO regional/area price summaries** for a first benchmark; the **Property Price Register** can support transaction-level exploration after cleaning and geography work. Use **RTB/ESRI rent data** for rented-market benchmarks, preserving new versus existing tenancy definitions. These are market statistics, not current asking prices or live inventory. [CSO price methods](https://www.cso.ie/en/methods/prices/residentialpropertypriceindex/), [PPR information note](https://www.propertypriceregister.ie/), [RTB rent index](https://rtb.ie/data-insights/rtb-research-reports/rtb-esri-rent-index/).

Every displayed amount needs a reference period, geography, statistic definition and sample/coverage information. Use a median where deriving a typical transaction price, with average and transaction count if useful; use the published standardized average for RTB rent rather than relabelling it a median. An index measures price change and must not be displayed as a euro price. Do not turn an area average below a household budget into “a matching home is available”.

The PPR combines house/apartment descriptions and supplies no room counts. **CSO HPM05 does provide regional house/apartment euro-price medians**, while HPM07/HPM08 provide rolling-year all-dwelling medians by region/Eircode area. The price index is a separate trend measure. Do not average monthly medians to manufacture a rolling median. Buying-bedroom breakdowns remain unverified; rent RIQ02 has type and bedroom categories. Price/rent geographies need reviewed joins to the town selector. [Budget and quality-of-life findings](research/ireland-budget-quality-of-life.md).

## Score configuration and API proposal

The [research scoring draft](research/scoring-config.draft.json) records the five-vertical concept and evidence constraints. Its **20 points per vertical are an exploratory proposal**, not an accepted algorithm. The backend foundation has a runtime [criterion registry](../config/criteria.json) for executable prototype defaults. Budget remains market context and government housing remains informational.

Latest user correction: preferences may select **one, two, seven or more criteria**. There is no fixed four/five-criterion requirement or cap. Hono and Bun are the confirmed stack; Nango was a dictation misunderstanding and is excluded. Frontend work is explicitly outside the current request. A shared canonical record format must be preserved by both source-file export and database import.

Only requested/applicable criteria participate. Compare all candidates using the same household profile and accepted evidence policy. Return each criterion’s match, source, evidence scope and confidence; show per-vertical results before any composite. A missing required criterion makes its aggregate unknown. Never silently drop a category from just one area's denominator.

For approved proximity criteria, a proposed distance curve is `100 × clamp((b − d)/(b − a), 0, 1)` for full-score threshold `a`, zero-score threshold `b` and distance `d`. The saved distance values are illustrative. **This curve cannot test a minutes-based requirement.** Hospital/GP time checks require route evidence; transit requires date/time and valid service calendars. No router or time calculation has been implemented.

Recommended flow: **source snapshots → validate → normalize → spatial index → API → five verticals + budget → map/explanation**. A small Bun API with SQLite/spatial indexing is a plausible starting proposal; choose deployment/storage once the result contract is agreed. Deterministic scoring is sufficient for the core comparison.

Proposed endpoints:

| Endpoint | Responsibility |
|---|---|
| `GET /places?query=` | Local town/city selection |
| `GET /features?bbox=&categories=` | GeoJSON layers |
| `POST /assess` | Location and household criteria → evidence, requirement outcomes, scores/unknowns |
| `GET /market-context?area=&tenure=` | Dated purchase/rent benchmarks |
| `GET /housing-projects?local_authority=` | Stage-aware informational project list |
| `GET /data-status` | Dataset versions, dates, coverage and attribution |

Ranked areas/properties need a separate candidate-definition decision. A town-centre pin must not stand in for every home in that town. Keep assessment evidence and map features on the same dataset snapshot/config version.

## Source and ingestion research

- [Schools, hospitals and childcare](research/ireland-national-services.md).
- [Transport, town boundaries and location input](research/ireland-transport-location.md).
- [Parks, community facilities and housing](research/dublin-local-services.md).
- [Catalogue/API access, national gaps and import acceptance checks](research/crosscutting-ingestion.md).
- [Expanded health/transport and genuine journey-time evidence](research/ireland-health-transport-times.md).
- [Water, electricity, public lighting and broadband](research/ireland-utilities.md).
- [Buying/renting context and national clubs/activities](research/ireland-budget-quality-of-life.md).
- [Decision map](../.scratch/ireland-service-map/map.md).

Imports need real validation: pagination, coordinate conversion and bounds, facility deduplication, active records, date interpretation and source-specific reuse terms. Observed defects already include reversed Fingal coordinates, non-spatial housing tables and a housing CSV with encoding/header/footer cleanup. Metadata harvest dates are not observation dates. Offline feature data still needs a basemap provider; it does not make map tiles offline automatically.

## Decisions remaining

Result behavior; required-versus-preferred criteria; room definition; category scoring and missing-data policy; route engine/modes; acceptable historical data; exact current-school reuse scope; utility granularity; market-geography joins; Republic versus whole island; and the final demo acceptance criteria. The map retains these human decisions instead of marking the implementation route settled prematurely.

Research and raw downloads are local. A backend prototype was created and checked before the latest raw-first instruction; its existing town/childcare exports are sanitized derivatives. Only the town snapshot was imported into the local prototype database. No further imports are being performed during raw collection. This collection performs no frontend, deployment, commit, push or remote issue mutations.
