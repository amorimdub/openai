# Ireland service map: buying, renting and quality-of-life data

Observed **4 October 2026**. Scope: Republic of Ireland, both **buying and renting**. Recommendation: give a historical regional budget indication from CSO/RTB alongside amenity access, with the period, geographic scope and missing-data state visible. Official sources can support house/apartment sale summaries and bedroom-specific rent summaries. They do not establish current listings, vacancies, or a budget for a particular available home. No application implementation was performed.

## Decisions supported by verified evidence

- **Buying:** CSO HPM05 supports monthly regional house/apartment median, mean and count. HPM07/HPM08 provide smoother rolling-year medians for all dwelling types by region/Eircode area. Retain these as distinct metrics.
- **Renting:** CSO-hosted RTB RIQ02 provides average rents by location, dwelling category and bedroom band, with extensive missing cells. Its verified payload ends Q4 2025; the latest RTB report is Q1 2026. Do not silently substitute one period or measure for another.
- **Clubs/activities:** national Sport Ireland public ArcGIS feeds are usable and CC BY 4.0, with club and venue attributes helpful for household matching.
- **Shops/green-space baseline:** offline OpenStreetMap extract plus authoritative council/Sport Ireland enrichment. These are mapped places, not verified current event calendars, available sessions, admissions or memberships.

## Property Price Register: real sales, limited classification

[PSRA register information and downloads](https://www.propertypriceregister.ie/website/npsra/ppr-home-en.html) cover residential purchases from 2010. Its observed register-update timestamp was **30 September 2026, 17:49:29**.

The exact [official bulk ZIP](https://www.propertypriceregister.ie/website/npsra/ppr/npsra-ppr.nsf/Downloads/PPR-ALL.zip/$FILE/PPR-ALL.zip) was downloaded and parsed: **19,139,142 bytes**, one `PPR-ALL.csv`, **809,014 rows**, 26 counties, sale dates from **2010-01-01 to 2026-09-25**. This confirms resource delivery and schema, not correctness of every transaction. CSV required Windows-1252 decoding; date is day/month/year. A downloader must quote the `$FILE` path so a shell does not expand it.

Verified headers:

`Date of Sale (dd/mm/yyyy)`, `Address`, `County`, `Eircode`, `Price (€)`, `Not Full Market Price`, `VAT Exclusive`, `Description of Property`, `Property Size Description`.

251,675 rows had a nonempty `Eircode` (approximately 31.1% across the entire historical register). Empty values are not a geocoding failure by the app; they are a source gap. No latitude/longitude, bedrooms, reliable floor area or stable transaction ID appeared in this bulk schema. The size description is only a categorical field, not a general square-metre measurement.

Crucially, the actual description values combine houses and apartments: `Second-Hand Dwelling house /Apartment` (663,989 rows), `New Dwelling house /Apartment` (144,976), plus a few Irish-language variants. **PPR cannot reliably separate house versus apartment from its structured description.** Parsing “Apartment” in a street address would be a heuristic, not official dwelling classification. Never infer bedrooms from household size.

PSRA's [information note](https://www.propertypriceregister.ie/website/npsra/ppr-home-en.html) says the register is not a property-price index, flags non-full-market transactions, explains that new-property prices should exclude 13.5% VAT, and warns that apartment bundles may be filed as one combined price, many divided prices, or multiple addresses for one price. It also acknowledges filing errors. Therefore a raw county average can be distorted by non-market deals, development bundles, tax basis and dwelling mix.

Proposed raw-transaction import rules: retain original amounts/flags; exclude flagged non-full-market deals from market-budget aggregates; separate new/existing; label the VAT basis and use only a verified, date-aware VAT normalisation if required. Quarantine obvious multi-property/bulk addresses and implausible values for review, recording the rule and exclusion count. Do not claim these heuristics remove all bulk transactions. Handle corrections by replacing/updating a source snapshot, not assuming old rows never change. Prefer CSO curated aggregates for the first version.

Reuse is governed by [PSRA's reuse page](https://www.psr.ie/re-use-of-public-sector-information/), which permits free reuse with source/copyright acknowledgement, accuracy and conditions against misleading/promotional uses. **This is publisher-specific reuse permission; CC BY was not verified for the raw PPR ZIP.** Preserve the exact policy pointer with the imported snapshot. A public ZIP was verified; a supported public PSRA price-query JSON API was not established. Avoid unofficial APIs as the authoritative ingestion source.

## CSO buying-budget APIs: choose the right table

The following public JSON-stat 2.0 endpoints were **fetched and parsed**, without keys. All returned `updated=2026-09-16T11:00:00.000Z` and ended at **2026 July**. Use `id`, `size`, each dimension's category indices/labels and flattened `value` to decode cells; never assume dimension order. Corresponding public `CSV/1.0/en` routes are documented catalogue formats but were not fetched here. [CSO statistical reuse policy](https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/) specifies CC BY 4.0.

| Table | Exact API | Verified data and use |
|---|---|---|
| HPM05 | [JSON-stat](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM05/JSON-stat/2.0/en) | Volume, value, mean sale price, median price; 199 months; house/apartment/all; new/existing/all; filings/executions; 42 RPPI regions. Best verified **regional house/apartment euro-price** table. |
| HPM07 | [JSON-stat](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM07/JSON-stat/2.0/en) | Rolling 12-month mean/median; 188 months; dwelling status, event, region, household buyer type. All dwelling types combined. |
| HPM08 | [JSON-stat](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM08/JSON-stat/2.0/en) | Rolling 12-month mean/median; 140 Eircode-output categories including All; new/existing, filings/executions, buyer type. No house/apartment or bedroom dimension. |
| HPM02 | [JSON-stat](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM02/JSON-stat/2.0/en) | County counts, value, mean/median; market/non-market, household/non-household, new/existing and event. Good broader transaction context. |
| HPM09 | [JSON-stat](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM09/JSON-stat/2.0/en) | Price index and percentage changes for 20 type/region categories; 259 months. **Index, not euro budget.** |

Verified HPM05 sample: July 2026, Dublin City, all dwelling statuses, filings: apartment median **€400,000**, **239** sales; house median **€530,000**, **320** sales. This is a monthly regional sample, not a bedroom-specific asking price or rolling-year median. Fetch the count alongside every price.

The [CSO methodology](https://www.cso.ie/en/releasesandpublications/ep/p-rppi/residentialpropertypriceindexjuly2026/backgroundnotes/) notes that approximately one quarter of dwelling types are imputed, so house/apartment summaries are estimates. Mean is total value divided by volume; median is the middle transaction price. Medians resist high-price extremes but neither statistic controls dwelling mix. Filings describe administrative submission month; executions describe legal transfer month and may be revised until 12 months have elapsed. RPPI is the mix-adjusted trend measure. The [July 2026 release](https://www.cso.ie/en/releasesandpublications/ep/p-rppi/residentialpropertypriceindexjuly2026/) was published 16 September and says the latest three index months are provisional.

Do not average monthly medians to manufacture a 12-month median. HPM07's published rolling median is useful where available; when matching house/apartment using HPM05, label the single-month sample or compute a separately labelled aggregate from appropriately classified transaction data. Bedroom-specific buying summaries were **not verified**.

For a town selector, regional buy estimates can join to county/local-authority context, retaining the source region ID. HPM05/07 regions include city/county splits and older region names, so an explicit concordance is needed; string matching “Cork” is insufficient. HPM08 routing keys are not CSO town polygons. A postal area named after a town may include rural surroundings or overlap town boundaries. Do not equate them or average region medians across a town crossing boundaries. PPR point mapping additionally needs a licensed/address geocoder; Eircode presence alone does not provide coordinates.

## RTB rent data: machine-readable baseline and current report

[RIQ02 JSON-stat API](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en) was fetched and parsed. Payload update was **14 May 2026**, with **73 quarters through Q4 2025**, **446 location labels**, seven bedroom categories and six property categories. Copyright metadata names RTB; the [specific open-data resource catalogue](https://data.gov.ie/api/3/action/package_show?id=riq02-rtb-average-monthly-rent-report) explicitly gives **CC BY 4.0**. Catalogue harvest/update dates do not supersede the time period inside the payload.

Verified dimensions: `STATISTIC`, `TLIST(Q1)`, `C02970V03592` bedrooms, `C02969V03591` property type, `C03004V03625` location. Bedrooms: all, one, two, three, 1–2, 1–3, four-plus. Types: all, detached, semi-detached, terrace, apartment, other flats. Location examples include county, named town and Dublin postal neighbourhood labels. The API has **no explicit new/existing-tenancy dimension**. Do not relabel these cells as new-tenancy rent without confirming the producer's methodology for that table.

Decoded sample: Q4 2025, two-bed apartment, Dublin location code `120500`: **€2,283.59 per month**. This is the published average for that category/location, not a median, advertised rent or guarantee. The fetched cube contained **990,448 null cells** out of 1,367,436 cells, with no numeric-zero cells. [RTB's dataset page](https://rtb.ie/data-insights/rtb-data-hub/rtb-esri-rent-index-data-set/) says a displayed 0.00 indicates insufficient data. Normalise both suppressed/null and display-zero-as-missing; never label the area rent-free or exclude it as unaffordable.

Also available: [RIQ02 CSV](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/CSV/1.0/en), [RIH02 half-year JSON](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIH02/JSON-stat/2.0/en), [RIA02 annual JSON](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIA02/JSON-stat/2.0/en). These exact routes have official catalogue/page links; their payloads were not parsed here. Longer-period tables may reduce sparse-location gaps but need independent period checks.

Latest verified report: **Q1 2026**, published **3 September 2026** according to [ESRI](https://www.esri.ie/publications/the-rtb-rent-index-q1-2026). It separately reports national standardised new-tenancy rent **€1,839/month** and existing-tenancy rent **€1,513/month**. Standardised means model-adjusted for property characteristics; it is not a simple average or median. For someone moving, new-tenancy estimates are the more relevant concept; existing-tenancy context should not be blended into it.

The [current report](https://rtb.ie/wp-content/uploads/2026/09/RTB-Rent-Index-Q1-2026.pdf) has county/city/local-authority/LEA summaries and broader house/apartment/bedroom breakdowns, with data omissions where samples are insufficient. Official [new-tenancy XLSX](https://rtb.ie/wp-content/uploads/2026/09/Tables-for-RTB-New-Tenancies-Q1-2026.xlsx) is linked on the report page; workbook schema was not downloaded/parsed. A latest-Q1 open JSON API with all those dimensions was not established. RTB's [website terms](https://rtb.ie/terms-of-use/) restrict automated website use and redistribution; unlike CSO-hosted RIQ02, the report/XLSX open licence was not established here. Keep those as linked reference material until dataset-specific permission or an open equivalent is verified. Do not scrape a tenancy register to invent live rental inventory.

RIQ02's location labels/codes do not automatically join CSO urban polygons. Build a reviewed town/county concordance, preserve geographic level, and mark county fallback. LEA/city bounds in current reports have different scopes from town bounds. Rent € per month and purchase total € are different budget units and must be kept separate.

## National clubs, activities, green areas and shops

Sport Ireland provides a stronger official national venue baseline than relying entirely on council-by-council discovery. Both services below are **public, no key**, native geometry EPSG:3857, return GeoJSON with `outSR=4326`, and have a **2,000-record response cap**. Metadata, count queries and two-record GeoJSON samples were fetched and parsed; Full national lists were subsequently acquired unchanged: 8,496 clubs and 5,507 activity records; see [raw acquisition evidence](ireland-raw-market-transport-quality-of-life.md). Counts are records, not deduplicated unique venues. Both services' data-last-edit timestamp was **3 September 2026, 15:06:28 UTC**, while catalogue dates still say December 2023.

| Layer | Exact REST layer | Verified count / fields |
|---|---|---|
| Affiliated clubs | [GetIrelandActiveClubs](https://services-eu1.arcgis.com/CltcWyRoZmdwaB7T/arcgis/rest/services/GetIrelandActiveClubs/FeatureServer/0) | **8,496** records. `GlobalID`, `Name`, `Activity`, `ClubAffiliation`, `Under18Membership`, `AccessibilityDetails`, `County`, `Website`, `Latitude`, `Longitude`, `OnMapType`, `RecordType`, `DataOwner`. |
| Places to be active | [GetIrelandActiveActivityLocations](https://services-eu1.arcgis.com/CltcWyRoZmdwaB7T/arcgis/rest/services/GetIrelandActiveActivityLocations/FeatureServer/0) | **5,507** records. `Name`, `Activity`, `Category`, `LocationType`, `OpenToPublic`, `HoursAvailable`, `SportsFacilities`, `Amenities`, `AccessibleFeatures`, `County`, `Website`, geometry and coordinates. |

The [club catalogue](https://data.gov.ie/dataset/7d00a4bd-74e1-406c-8901-aa2969f6b481/resource/4c31ba9e-b55a-44f0-8c70-65b9edfa1f3d) and [activity catalogue](https://data.gov.ie/dataset/getirelandactive_activitylocations) specify CC BY 4.0; credit Get Ireland Active/Sport Ireland. Activity coverage includes parks, beaches, forests, play areas and recreation facilities. Some Northern Ireland records may be present; this study recommends clipping to Republic scope.

Sample queries use `query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=2&f=geojson`; check `exceededTransferLimit` and paginate for actual ingestion. `Activity` and `Category` are comma-separated descriptive values, not a guarantee of today's scheduled event. `HoursAvailable` is free text in samples. Under-18 membership indicates an offering, not an available child's place. Club positions may represent a clubhouse/meeting anchor rather than every activity venue. Keep clubs and facilities separate to avoid double-counting access.

[DCC Sport pitches and Facilities](https://data.smartdublin.ie/en/dataset/sport-pitches-and-facilities-dcc) is an additional local authoritative layer with CSV/GeoJSON and Culture Near You linkage. Its catalogue lists geographic/venue fields, June 2025 update and 2019–2023 range; no resource payload was parsed here. Council parks/community layers researched separately can enrich the national baseline; distinguish that enrichment from uniform national completeness.

For shops and additional green polygons use [Geofabrik's Ireland/Northern Ireland OSM extract](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html), clipped to Republic boundaries. Live catalogue HTML was fetched: data through **2026-10-03T20:20:50Z**, PBF approximately **395 MB**; Full PBF was subsequently acquired unchanged (414,418,799 bytes) and passed publisher MD5; OSM content remains unparsed. See [raw acquisition evidence](ireland-raw-market-transport-quality-of-life.md). [Exact PBF resource](https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf). [OpenStreetMap licensing](https://www.openstreetmap.org/copyright) is **ODbL**, with attribution and derived-database requirements; preserve OSM provenance and licence instead of labelling the combined corpus CC BY.

Tag-based import choices: [shop](https://wiki.openstreetmap.org/wiki/Key:shop) for supermarket/convenience and other retail; [leisure=park](https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpark) for public park polygons; [club](https://wiki.openstreetmap.org/wiki/Key:club) for clubs missing official layers. Classify separate daily essentials versus optional retail. Exclude demolished/disused records where tagged; keep unknown opening/access metadata explicit. Green land cover is not necessarily an accessible park; forests/farmland/private greenspace need access/entrance checks.

No complete, openly licensed national real-time event/session calendar was established. Static venue proximity is implementable; “activities available tonight”, age eligibility, bookings, fees and free membership capacity require separate publisher feeds or live verification.

## Honest budget indication and remaining gates

Proposed result wording: “Historical sale median for houses in [source region], [month], [count] sales” or “Registered average rent for [bedroom/type/location], [quarter]”. Show the wider regional scope when the user selected a town. Never say “homes available within your budget” from these sources.

A JSON score configuration can define the user budget unit, buying/renting mode, desired dwelling type/bedroom band, metric source, time window, minimum sample rule and fallback policy. A minimum-sample threshold is a product/statistical decision, not a value supplied by this research. Match rent bedroom categories exactly; buying bedrooms remain unknown. Keep missing, stale or mismatched-geography budget evidence separate from scoring zero. For buying, total purchase budget can be compared with historical transaction context; this does not calculate borrowing eligibility or household cashflow.

Before implementation: select precise metric/fallback rules; independently verify latest Q1 rent table permission/schema if using it; join price/rent regions to towns deliberately; parse national venue lists fully and deduplicate; check OSM missingness rather than treating fewer mapped shops as objectively lower quality. Current stock/asking prices and vacancy claims require a licensed live-listing source outside the verified open-data baseline.
