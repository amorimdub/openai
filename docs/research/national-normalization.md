# National health, education and transport normalization

Implemented on 2026-10-04 in `src/common/adapters/national.ts`. All original HTTP bodies remain frozen. Accepted rows use common schema version 2 and preserve the source asset path and zero-based raw record locator. Public service fields use an explicit allowlist; GP individual names, phone numbers, email addresses and web links are omitted.

| Adapter | Input | Accepted | Excluded | Quarantined | Observation period |
| --- | ---: | ---: | ---: | ---: | --- |
| hospitals | 132 | 132 | 0 | 0 | March 2020 |
| gp | 6,608 | 6,587 | 0 | 21 | March 2020 |
| schools-special | 116 | 116 | 0 | 0 | 2014/15 |
| schools-primary | 3,147 | 3,147 | 0 | 0 | 2014/15 |
| schools-secondary | 711 | 711 | 0 | 0 | 2014/15 |
| airports | 137 | 10 | 127 | 0 | Unknown; individual source updates vary |
| transport-stops | 17,161 | 17,098 | 63 | 0 | 2026-10-01 |
| **Total** | **28,012** | **27,801** | **190** | **21** | |

The 21 GP coordinate quarantines are outside the schema's Ireland bounds after transforming native EPSG:2157 geometry. They are retained as explicit quarantine evidence, never moved to a guessed address. Co-located GP rows remain separate historical directory entries and must not be interpreted as unique practice counts. Blank school name fields fall back to the publisher's populated `OFFICIAL_N` column; source roll-number annotations such as `*` remain intact. Dedicated special schools retain category `special_school`, separate from `primary_school` and `secondary_school`.

Hospital Irish Grid coordinates use TM65/EPSG:29902 (the source also labels its deprecated equivalent 29900). The seven-parameter transformation was independently compared to **all 132** publisher-provided `POINT_X`/`POINT_Y` WGS84 points: discrepancies are below 0.000002 degrees on each axis. A second independent check using the running PostGIS database transformed all 132 native points with `ST_Transform(...,29902→4326)`: maximum axis discrepancy versus the parser was **2.1316282072803006e-14 degrees**, confirming agreement with the database transformation. Source point coordinates do not establish entrances or travel times. The GP source has reversed `lat`/`lon` column names; those fields are deliberately ignored in favour of native EPSG:2157 geometry.

The airport layer selects rows reporting scheduled passenger service and an open airport type. It excludes 127 rows without reported scheduled service. This does not verify current routes, tickets, flight schedules or accessibility. The NaPTAN layer selects publisher status `active`, explicitly excludes 62 pending and one inactive record, and preserves the source stop classification code. The publisher directory includes Northern Ireland cross-border stops; its geography and limitations state this clearly. All 17,098 active points use explicit WGS84 longitude/latitude values from the ITM translation object. The raw locator is `naptan-stop/N`, corresponding to `NaPTAN.StopPoints.StopPoint[N]`.

Reuse evidence is contained in the frozen source item/page metadata:

- [HSE hospital GeoHive item](https://www.arcgis.com/sharing/rest/content/items/feb34881088341bbbf80d86af6a4f333?f=pjson): CC BY 4.0, Health Atlas supplied March 2020.
- [HSE GP GeoHive item](https://www.arcgis.com/sharing/rest/content/items/01cb04a1fab34c72a746dc660622fe73?f=pjson): CC BY 4.0, historical 2020 directory.
- [Historical provisional schools item](https://www.arcgis.com/sharing/rest/content/items/df226b216e69428d8647ff8101d627a4?f=pjson): explicit Government of Ireland CC BY 4.0 statement. Historical mirror provenance remains unauthenticated.
- [OurAirports publisher documentation](https://ourairports.com/data/): public domain community data with no accuracy guarantee.
- [NTA transport-data documentation](https://www.transportforireland.ie/transitData/PT_Data.html): CC BY 4.0, fair-usage policy applies.

`bun test tests/national-adapters.test.ts` verifies projection against independent publisher coordinates, school-level mapping and official-name fallback, contact-field suppression, passenger-airport filtering, NaPTAN status/CRS handling, CSV quoting, all source row counts and duplicate canonical IDs. It passes seven tests. Global TypeScript checking also passed at handoff.

The `GTFS_All.zip` schedule is still preserved raw. A stop directory cannot establish frequency, departures or a 30/60-minute journey. GTFS service calendars, route/stop relationships and scheduled travel-time evaluation require their own relational model and routing implementation. Current education/Tusla sources with unverified reuse remain gated. Clinical-condition suitability, school admissions and current GP acceptance remain unknown; these parsers do not enable verified ranking scores.
