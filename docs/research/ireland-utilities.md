# Ireland utility information layers: verified sources and limits

Observed **4 October 2026**, Republic of Ireland scope. User clarified **both ESB electricity and public street lighting**. This research also covers public mains water, community/group water schemes and broadband. No importer, application, research branch or commit was created.

## Recommended hackathon decision

Build the utilities vertical as **dated information with coverage confidence**, not a claim that a particular home is connected. The best reusable national map indicator is **ComReg's public broadband statistics view**. Water has useful national directories and regulatory points, but no verified household connection polygons in the inspected resources. Public lighting is useful council enrichment with patchy national coverage. ESB supplies a technically usable national capacity workbook, but the observed website terms do not grant public-product redistribution.

| Topic | Practical MVP source | What it can honestly establish |
|---|---|---|
| Broadband | ComReg public data view, small-area polygons | Percentage of premises passed by a gigabit network; separate planned coverage. Not speed or orderability at a specific address. |
| Public mains water | Uisce Éireann water-supply-zone directory; EPA RAL supply points | Named supplies, identifiers, population, and listed regulatory remediation. Not which supply serves the user or where mains run. |
| Community/group water | EPA annual scheme inventory candidate; GSI source-protection polygons as optional context | Known schemes/monitoring or source catchments. Not scheme membership or serviceable household boundaries. |
| ESB electricity | Official capacity workbook as source-linked information pending reuse permission | Substation transformer headroom at a dated planning snapshot. Not domestic connection, reliability, costs or final network capacity. |
| Public street lighting | Council lamp/pole inventories | Known historic lighting assets near a place. Not measured night illumination, current working status, or personal safety. |

Missing coverage must be **unknown**, not zero-quality. Do not penalize rural areas because a council lacks an open streetlight inventory. Utilities should have separate `water_supply`, `group_water`, `electricity`, `public_lighting`, `broadband` statuses; a single “utilities available” boolean would hide incompatible evidence.

## Verification language

**Full file parsed** means a public XLSX/GeoJSON resource was fetched and inspected. **Sample checked** means metadata, schema and one or more real features responded; the complete layer was not validated. **Catalogue/page verified** establishes the publication and terms only. Data reference dates, technical edits and catalogue harvests are recorded separately. A September 2026 metadata harvest is not evidence that a 2021 lamp survey became current.

Reads used public GET endpoints and temporary investigation files. Later CKAN metadata reads sometimes returned HTTP 403; independent existing ArcGIS/WFS reads continued working. This is recorded as a resource limitation, not a reason to infer missing data.

## Broadband: implementable national indicator

### ComReg Ireland Gigabit Statistics Public Data View

**Recommended dataset:** [ArcGIS item metadata](https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson), linked through the first-party [ComReg Open Data Map Hub](https://datamaps-comreg.hub.arcgis.com/).

**REST base:** [Ireland_Gigabit_Statistics_Public_View/FeatureServer](https://services-eu1.arcgis.com/pvZmdFc5up2jdiPm/arcgis/rest/services/Ireland_Gigabit_Statistics_Public_View/FeatureServer).

The public service contains NUTS2 layer 0, counties layer 1, LEA layer 2, electoral divisions layer 3 and **small areas layer 4**. County and small-area schema and samples were fetched without login. Count queries returned **26 county polygons** and **18,919 small-area polygons**. Native CRS **EPSG:2157**; `outSR=4326&f=geojson` returned longitude/latitude polygon geometry successfully. Full national export was not downloaded.

Useful small-area fields:

- `SA_GUID_2022`, `SA_PUB2022`, `SA_URBAN_AREA_NAME`, county and electoral-division names.
- `Premise_Count_Public_View`: a **string**, including suppressed bins such as `<200`.
- `Gigabit_Passed_PCT_Public_View`: coverage percent.
- `Gigabit_NBI_Passed_PCT_Public_View`: alias explicitly includes **planned NBI**, so keep it separate from currently passed premises.
- `Gigabit_Active_PCT_Public_View`: active-service metric; it is not a coverage metric or speed test.

County layer additionally has `FTTP_Passed_PCT_Public_View` and `FTTP_Active_PCT_Public_View`. A sampled Carlow polygon returned FTTP passed 89 and gigabit passed 90. A sampled Kilkenny small area returned gigabit passed 99, with premise count suppressed as `<200`; don't reconstruct missing household data from this bin. [County schema](https://services-eu1.arcgis.com/pvZmdFc5up2jdiPm/arcgis/rest/services/Ireland_Gigabit_Statistics_Public_View/FeatureServer/1?f=pjson), [small-area schema](https://services-eu1.arcgis.com/pvZmdFc5up2jdiPm/arcgis/rest/services/Ireland_Gigabit_Statistics_Public_View/FeatureServer/4?f=pjson).

**Reuse:** item `licenseInfo` explicitly grants CC BY 4.0 commercial/noncommercial reuse with attribution to ComReg for statistics and CSO for boundaries; also identify Tailte Éireann as specified by the source boundary metadata. This licence is verified for **this public view**, not every item returned by a ComReg search. An adjacent item, `[QKDR] CSO Ireland Broadband Coverage`, says use only through the hub and its proxy returned **403**. Do not build on that restricted item or copy its URL as a working public API. [Public-view licence metadata](https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson), [restricted-item metadata](https://www.arcgis.com/sharing/rest/content/items/2e256f908e1942c4b3c3fa8997132751?f=pjson).

**Freshness:** latest first-party quarterly publication found was **Q2 2026**, released **3 September 2026**; ComReg says its hub includes Q2 data. This public view's item metadata was modified 3 September; county service data edit **28 September** and small-area data edit **29 September 2026**. No explicit quarter column appeared in the sampled public view. Pin the snapshot and cross-check the intended reporting quarter against the publication before assigning `reference_period=2026-Q2`; a technical edit date alone is not sufficient. [ComReg Q2 release](https://www.comreg.ie/comreg-issues-electronic-communications-sector-quarterly-report-for-q2-2026/?type=media-releases).

**API use:** paginate or enumerate object IDs; a deliberately one-record query reports `exceededTransferLimit`. Snapshot the selected polygon layers offline, avoiding a live provider dependency for each user query. For a town spanning multiple small areas, weight by usable premise counts or show a range; suppressed counts mean exact weighting may be unsupported. Never use the town centroid's one small area as the entire town's broadband rate.

### NBP / NBI: property checks are links, not the open-data baseline

The [government National Broadband Plan map](https://www.gov.ie/en/publication/5634d-national-broadband-plan-map/) distinguishes AMBER intervention areas from BLUE commercial provision **or plans**. Its page says latest underlying premises information is GeoDirectory **Q4 2025** and page updated **4 March 2026**. This classification does not prove a ready connection. No generally reusable bulk API/licence for its individual premises was verified in this research.

[NBI's Eircode/address checker](https://nbi.ie/order/) is a useful final property-level handoff. No open, reusable bulk endpoint or licence was established for automating this checker. Avoid scraping it to simulate nationwide property connection data. [ComReg's own public-view description](https://www.arcgis.com/sharing/rest/content/items/d57d56df83f142989c21a670593c9065?f=pjson) explicitly says aggregate statistics must not be interpreted as service availability at individual premises.

The national catalogue's [Implementation of the National Broadband Plan](https://data.gov.ie/dataset/implementation-of-the-national-broadband-plan) is an audit **PDF**, not a coverage layer. [Broadband Connection Points Live](https://data.gov.ie/dataset/broadband-connection-points-live2) is a **County Galway** public-location dataset, despite its generic name; it is not home broadband availability.

## Public mains water: a usable directory, not connection geography

### Uisce Éireann water supply zones, Q1 2026

[Official open-data page](https://www.water.ie/open-data) advertises a Water Supply Zones XLSX, updated **30 March 2026**, under CC BY 4.0 with specified attribution, source, disclaimer and modification statements.

- [Publisher-linked workbook preview](https://water.widen.net/view/pdf/use17tawmb/Q1-2026-Public-Water-Supply-Zone-Information.xlsx?u=oephrt).
- [Working original XLSX download](https://water.widen.net/content/use17tawmb/original/Q1-2026-Public-Water-Supply-Zone-Information.xlsx?u=oephrt&download=true).

**Full workbook fetched and parsed:** 60,853 bytes; one `WSZ 2026` sheet, header plus **692 rows across 31 Water Services Areas**. Seven columns: area, zone name, EDEN water supply zone code, WSZ ID, water resource zone code, owner and population as of **27 March 2026**. No coordinates, geometry, pipe routes, addresses, household connection field or polygon boundaries. Values such as `NA` and `Disputed` occur in the resource-zone code column; preserve rather than invent relationships.

The publication explains that water supply zones are for compliance reporting and water resource zones group interconnected supply/demand systems. That description should not be mistaken for a polygon download: the actual resource inspected is a directory. **MVP:** list local-authority supplies, allow exact supply-code lookup if known, and link provider checks. Do not determine a user's supplier by nearest zone name. [Source and attribution requirements](https://www.water.ie/open-data).

### EPA Remedial Action List (RAL)

**Reusable national risk-context layer:** [official catalogue](https://data.gov.ie/dataset/environmental-protection-agency-remedial-action-list), CC BY 4.0.

[Advertised WFS GeoJSON resource](https://gis.epa.ie/geoserver/EPA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=EPA:DW_RAL&maxFeatures=50&outputFormat=application%2Fjson) fetched **35 MultiPoint features**. Native response CRS **EPSG:29902 / Irish Grid**: the numbers are metres, not longitude/latitude. Adding `srsName=EPSG:4326` returned correct longitude/latitude for a sampled Adare point.

Fields include supply name, scheme code, county, population, supplied volume, proposed action, target completion text and deficiency flags. Target text such as “December 2026” is **not a scheduled event guarantee**. Catalogue harvest was **3 October 2026**; no source reference quarter or layer edit timestamp was established from the sampled feature response. Keep `retrieved_at` distinct and cross-check the latest published RAL when importing.

A RAL point identifies a supply with listed deficiencies; it is neither a customer-service polygon nor a current boil-water notice. Absence from the RAL is not proof that a home's drinking water is safe. Do not infer “your supply” from point proximity. [EPA description](https://data.gov.ie/api/3/action/package_show?id=environmental-protection-agency-remedial-action-list).

## Group/community water: distinguish scheme and source

EPA distinguishes public supplies, public group schemes (community distribution of Uisce Éireann-treated water), private group schemes (community abstraction/treatment/distribution) and small private supplies. Individual household wells are a separate category and are not established by a nearby scheme. [Official supply-type definitions](https://www.epa.ie/our-services/compliance--enforcement/drinking-water/supply-types/).

### GSI group-water/public-water source protection layers

**Publisher:** Geological Survey Ireland. **Licence:** CC BY 4.0. Both [group-scheme catalogue](https://data.gov.ie/dataset/group-scheme-preliminary-source-protection-areas-ireland-roi-itm) and [public-supply catalogue](https://data.gov.ie/dataset/public-supply-source-protection-areas-ireland-roi-itm) link the same combined service and SHP zip:

[Combined MapServer](https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM/MapServer).

- Layer **0**: public-water source protection areas; checked schema and one polygon. Supply fields `SPA_NAME`, `DW_CODE`, county, report URL/date, update date, active flag.
- Layer **1**: group-water **zones of contribution**; checked schema and one polygon. `GWS_NAME`, `YEAR`, consultant, zone ID. Sample Ballintubber record is dated **2013**.
- Native **EPSG:2157**, successful `outSR=4326` GeoJSON query. WMS is also advertised for imagery, SHP for offline import.

Catalogue harvest **22 September 2026** does not date all underlying studies. These polygons describe hydrological source/protection catchments; **a house inside one is not thereby a customer**, and a house outside it can still be supplied. Treat them as optional environmental context, not mains/group-water availability and not an eligibility test.

### EPA nationwide scheme inventory and monitoring workbook

[Drinking Water Monitoring Results and Water Supply Details 2025](https://eparesearch.epa.ie/safer/iso19115/display?isoID=20267) advertises a consolidated **20.98 MB XLSX** covering all 31 Water Service Authorities, including schemes by county, results, parameters and summary data. Actual metadata says published/edited **30 July 2026**, covering **1 January–31 December 2025**. The listing's generic access-date text and index timestamp are not reliable replacements for those explicit fields.

The [download agreement](https://eparesearch.epa.ie/safer/downloadCheck.jsp?atID=2284147&isoID=20267&rID=72026) requires acceptance of attribution/disclaimer conditions and describes further use in **scientific applications**. An unrestricted CC licence for this attached workbook was **not verified**; it must not inherit the separate RAL dataset's licence. Workbook bytes/schema were **not downloaded** in this investigation because reuse scope is a real unresolved gate for a public housing-location product. This is a candidate for scheme directory enrichment once terms and spatial columns are confirmed, not an accepted importer.

### NFGWS map

The primary [Ireland's Group Water Schemes map](https://nfgws.ie/wp-content/uploads/2020/07/gws-map.html) was fetched as HTML. It has source type, DBO contract and connection-count controls; the source is a Mapbox vector tileset, not a linked CSV/GeoJSON export. No reusable open-data licence, current source date or household service-boundary promise was found on this map. Its URL contains 2020/07, which is an upload-path clue, **not verified survey freshness**. Use a reference link only; prefer explicitly licensed GSI context and a validated EPA inventory before proposing national bulk ingestion.

## ESB electricity: useful planning workbook, public reuse unresolved

[Official availability capacity heatmap](https://www.esbnetworks.ie/services/get-connected/renewable-connection/network-capacity-heatmap) links [Customer heatmap download July 2026 XLSX](https://media.esbnetworks.ie/media/docs/default-source/publications/customer-heatmap-download-july-2026.xlsx?sfvrsn=51c3b179_19).

**Full workbook fetched for internal research:** 6,929,289 bytes; three sheets, heatmap dimension A1:Z46529, two heading rows and **46,527 data rows**. Fields include station name, primary/secondary voltages, transformer configuration, installed capacity, demand available capacity, parent constraints, generation capacity, parent feeder/station and latitude/longitude. Some station identifiers are masked. No domestic address/MPRN connection register is provided.

**Age:** July 2026 publication uses station capacity and contracts/offers to **Q4 2025**, with load readings **2024/2025**; quarterly updates are an objective, not proof of live state. HV locations are indicative; LV/MV locations are more specific. Transformer capacity excludes important upstream/final connection constraints. These facts support planning information only.

**Licence gate:** no CC/open licence was verified for this workbook. The first-party [copyright terms](https://www.esbnetworks.ie/data-legal/copyright) reserve rights and allow personal/noncommercial downloads with notices retained, while prohibiting public/commercial copying or redistribution without authorization. Therefore **do not ship these rows in the hackathon public API** without separate permission or a dataset-specific reusable licence. Keep a source link and say property connection is unverified. The [ESB national open-data catalogue publisher](https://data.gov.ie/organization/esb) exposes an EV charging dataset; charging infrastructure is not domestic electricity availability.

## Public street lighting: real council assets, uneven national coverage

No verified complete Republic-wide open lighting inventory was found in the inspected catalogue. These usable examples are **local council subsets**:

| Source | Actual sample/file verification | Data age / licence |
|---|---|---|
| [Public Lighting DCC](https://data.gov.ie/dataset/street-lighting-dublin-city) | Full GeoJSON parsed: **45,017 points**, CRS84 `[lon,lat]`; `ID`, `site_name`, unit number/type, lat/lon | Dataset temporal 2021; GeoJSON upload 7 Dec 2021; catalogue harvest Sep 2026. CC BY4. Includes DCC, ESBN and LUAS assets inside DCC area. |
| [Public Lighting DLR](https://data.gov.ie/dataset/dlr-public-lighting) | Full GeoJSON parsed: **23,530 points**, lon/lat with ITM attributes; lamp, street, unit, watts and burn-description fields | Explicit snapshot **19 Apr 2021**, council-maintained lights only; GeoJSON uploaded Sep 2022. CC BY4. |
| [Public Lighting FCC](https://data.gov.ie/dataset/public-lighting-fcc1) | Schema/sample checked; count **35,170 points**, native EPSG2157 →4326 works; zone/street/unit and lat/lon | Catalogue prose says 2025; service name March 2024 and **dataLastEditDate 15 Mar 2024**. CC BY4. Don't claim a 2025 survey. |
| [Public Lighting SDCC](https://data.gov.ie/dataset/public-lighting-sdcc1) | Web catalogue/resource verified only; GeoJSON export advertised, metadata API retry returned 403; actual schema/file unverified | Explicit snapshot **4 Oct 2023**, SDCC-maintained lights only. CC BY4. |

Lamp presence is different from a lamp being operational. Dimming/burn text is configuration, not measured lux on a pavement. Count density is affected by road geometry and inventory coverage; keep this informational until a defensible, consistently covered access metric is agreed.

## Import and API acceptance rules

1. Add utility provenance: publisher/resource/record ID, licence, `reference_period`, technical edit date, retrieval time, geographic coverage and precision.
2. Treat absent connection information as `property_connection: unknown`. A town/city selector cannot establish an individual home's water, electricity or fibre connection.
3. Preserve `current` versus `planned` broadband fields and scheme/source/connection distinctions. Do not label planned NBI as current gigabit.
4. Convert metres CRS to WGS84 before rendering. GSI/ComReg/Fingal use EPSG2157; EPA RAL defaults EPSG29902. Validate Ireland bounds and geometry types.
5. Fetch offline snapshots with pagination, preserve provider errors and suppressed values, and avoid request-time national scraping. Mark outdated/partial layers and expose source date alongside the result.
6. Keep utility scores disabled when evidence is missing, ambiguous or only household verification can answer it. If broadband contributes to ranking, use the named area aggregate with date/coverage disclosure, not an asserted speed at home.
7. Ship only resources with an established reusable licence. ComReg public view, Uisce directory, GSI context, EPA RAL and council lighting have verified open terms here. ESB workbook, NFGWS tiles and EPA SAFER monitoring workbook remain separate reuse gates.

## Exact additional resource links

- [DCC lighting GeoJSON](https://data.smartdublin.ie/dataset/064a3764-84aa-48d0-ac43-f5b45f229584/resource/feef6a85-4895-4b86-b423-e2e68d92305c/download/dcc-public-lighting.geojson).
- [DLR lighting GeoJSON](https://data.smartdublin.ie/dataset/d3b33221-e593-480c-9f2e-d38d98268683/resource/16402fae-b078-4451-91ed-baf2659df3cf/download/public_lighting_2021_dlr.geojson).
- [FCC lighting FeatureServer layer 0](https://services5.arcgis.com/CI1e5PKQXvJgmJK8/arcgis/rest/services/Fingal_Public_Lighting_March_2024/FeatureServer/0).
- [SDCC advertised GeoJSON, not fetched](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/7d16cce95976436083f4c9c35ea0b488/geojson?layers=0).
- [GSI combined water protection SHP zip](https://gsi.geodata.gov.ie/downloads/Groundwater/Data/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM.zip).
- [Galway public broadband connection points, catalogue verified only](https://services1.arcgis.com/mJI7JYqAOKXPG7Hh/arcgis/rest/services/Broadband_Connection_Points_Live/FeatureServer/0).

## Raw collection completed 4 October 2026

The user subsequently authorized saving original source data now and parsing later. The collection saved **216 original HTTP response bodies, 398,275,662 bytes**, across **21 collected source snapshots** and **one ESB reuse-gate snapshot**. These totals include source metadata/licence evidence, ID/count responses and original data, but exclude manifests. **No source attributes were renamed, selected away, normalized, geocoded or imported into a database.** ArcGIS pages retain all source fields and native geometry/CRS; no `outSR`, simplification or precision reduction was requested. Files retain their original encoding and bytes. JSON inspection was limited to HTTP/API failures, IDs, counts and paging completeness. Anonymous cookies and authorization headers are omitted from provenance.

Every directory below contains `manifest.json`: request/final URLs, actual UTC fetch times, useful HTTP response headers, byte lengths, SHA256 hashes, original reporting periods, licence evidence/reuse status, count checks, completeness and semantic/coverage gaps. A directory's date is the collection snapshot date, not the data's observation date.

| Directory under `data/raw/` (each contains `2026-10-04/`) | Original data saved | Count/completeness evidence |
|---|---|---|
| `comreg-broadband` | Native counties and small-area JSON pages; item/service/schema/count/ID bodies | **26/26 counties; 18,919/18,919 small areas**, every enumerated ID present exactly once. County layer retained because it adds FTTP metrics. Other redundant geographic variants omitted. |
| `uisce-water-zones` | `Q1-2026-Public-Water-Supply-Zone-Information.xlsx`, **60,853 bytes**; official open-data page | Complete original file; internal parsing deferred. Prior research separately established **692 rows**. |
| `epa-remedial-action-list` | Native `DW_RAL.geojson`, WFS hits response and catalogue | **35 points**, matching provider total; native EPSG29902. |
| `gsi-water-source-protection` | Native public protection/group contribution JSON pages and service/catalogues | **357/357 public protection polygons; 254/254 group scheme polygons**, IDs/counts complete. These remain catchments, not served-property boundaries. |
| `housing-construction-q1-2026` | Original `csr-q1-2026.csv`, **453,556 bytes**, and catalogue | Complete original file with source encoding/summary/footer preserved. Internal parsing deferred; prior research separately established **3,208 scheme rows/31 local authorities**. CC BY-SA 4.0 obligations apply. |
| `community-centres-dcc` | Original GeoJSON + catalogue | **99 features**, matching prior research count. |
| `parks-gardens-and-public-spaces-dcc` | Original GeoJSON + catalogue | **90 features**, matching prior research count. |
| `parks-and-open-spaces-dcc` | One original 2016 park-classification GeoJSON + catalogue | **566 polygons**, matching prior research count; redundant duplicate variant omitted. |
| `community-facilities-dlr` | Original GeoJSON + catalogue | **53 features**, matching prior research count; mixed facility categories. |
| `main-parks-dlr` | Original GeoJSON + catalogue | **15 features**, matching prior research count; main parks only. |
| `community-centres-2025-fcc` | Native API pages/schema/count/IDs + catalogue | **41/41 features**, IDs complete. **Quarantine:** original coordinate/Lat-Long defect identified during research is preserved, not repaired. |
| `local-national-parks-and-play-grounds-fcc-20232` | Native API pages/schema/count/IDs + catalogue | **52/52 features**, IDs complete; play-area inventory, not comprehensive park boundaries. |
| `parks-sdcc1` | Native API pages/schema/count/IDs + catalogue | **84/84 features**, IDs complete. |
| `multi-use-community-centres1` | Native API pages/schema/count/IDs + catalogue | **32/32 features**, IDs complete; CC0. |
| `street-lighting-dublin-city` | Original 2021 GeoJSON + catalogue | **45,017 features**, matching prior research count. |
| `dlr-public-lighting` | Original 2021 GeoJSON + catalogue | **23,530 features**, matching prior research count. |
| `public-lighting-fcc1` | Native API pages/schema/count/IDs + catalogue | **35,170/35,170 features**, IDs complete; March 2024 asset data. |
| `public-lighting-sdcc1` | Original advertised GeoJSON export | **35,280 features** downloaded; independent expected service count **unverified**. Whole export saved. Catalogue GET returned HTTP403; that failure is recorded, not treated as missing assets. |
| `galway-city-community-centre-locations2` | Native API pages/schema/count/IDs + catalogue | **4/4 features**, IDs complete; local subset. |
| `community-centres6` | Roscommon native API pages/schema/count/IDs + catalogue | **41/41 features**, IDs complete; native EPSG2157. |
| `cork-city-parks` | Original `parks.gpkg`, **151,552 bytes**, and catalogue | Complete SQLite/GeoPackage file downloaded; feature-count parsing deferred. |
| `esb-network-capacity-reuse-gate` | Original copyright and publication HTML bodies only | **No workbook collected** into the open raw bundle. Manifest retains the resource URL and unresolved permission gate; public download does not establish redistribution permission. |

The **398 MB** source bundle is mostly ComReg native polygons (**338,391,263 bytes including metadata**). This is deliberate preservation of original geometry. Byte transfer completeness does not imply a dataset is current, nationally complete, or sufficient to establish a home's connection. `record_completeness_verified` distinguishes checked API/GeoJSON counts from unopened workbook/CSV/GeoPackage internals; `count_checks` distinguish prior research counts from this collection's verification. A complete whole-file download can therefore still have an unverified internal record count.

Initial long explicit-ID query URLs returned HTTP404 for larger ArcGIS requests. The repaired collector uses short, sorted object-ID range queries and validates the returned IDs against enumeration/count responses. **ComReg, GSI and Fingal lighting were successfully retried and are count complete**; failed attempts are not substituted with empty feature lists. No restricted scientific-use agreement was accepted, and no NBI address checker, NFGWS map tile set or ESB workbook was copied into the open bundle.

Repeatable standard-library downloader: [collect-raw-utilities-housing.py](/Users/fs/dev/openai/scripts/collect-raw-utilities-housing.py). Its output root resolves relative to the repository; the default snapshot date is current UTC. The completed collection used `--date 2026-10-04`. Source selection is optional, so an explicit rerun may refresh a chosen snapshot without collecting every source:

```sh
python3 scripts/collect-raw-utilities-housing.py --date 2026-10-04 comreg-broadband
```

An explicit same-date rerun overwrites its selected raw files/manifests, so use a new date for a new historical snapshot. The source URLs are the verified resources listed above; future runs must reassess newly published quarters and reuse terms. Further parsing, normalization and database import remain deferred at the user's request.
