# Ireland parks, community facilities and public housing: source investigation

Observed **4 October 2026**. Scope expanded from Dublin to all Ireland during investigation. Despite the filename, recommendations below address national coverage. This is source research and a planning decision, not an implemented importer or application.

## Recommended decision

Use a pinned OpenStreetMap Ireland snapshot as the broad parks/community baseline, enriched with verified council data where available. Label that baseline as community maintained and incomplete. No single verified public-sector dataset in this investigation supplied all everyday parks or community centres nationally. Council layers have different definitions, dates and defects. The national catalogue lists local datasets rather than making them nationally complete. [National community search](https://data.gov.ie/api/3/action/package_search?q=community%20centres&rows=100), [national parks search](https://data.gov.ie/api/3/action/package_search?q=parks&rows=100).

For the **government housing information layer**, use the national Social Housing Construction Status Report by local authority, plus a small reviewed selection of LDA project pins. The construction report has nationwide scheme records but no coordinates; show a list/table until locations are verified. Keep state-owned land parcels separate from housing projects. Do not interpret proximity to public housing as a negative scoring factor: user steering makes this an information layer.

“All Ireland” needs a jurisdiction definition. The Republic's housing report covers **31 local authorities**, while the OSM extract includes Northern Ireland. If the target includes Northern Ireland, separate NI official sources remain an explicit gap; these Republic datasets do not cover it. [Housing CSV](https://opendata.housing.gov.ie/dataset/b7fc5af6-71b4-4afb-b840-d71a248967b2/resource/e5f89137-be61-4038-a2d4-9e657b543f1f/download/csr-q1-2026.csv), [OSM extract scope](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html).

## Evidence levels

- **Catalogue verified**: publisher metadata/API fetched; existence is established, usability may not be.
- **Schema checked + sample fetched**: the actual source returned attributes and coordinates; one feature is enough to find a defect, but does not validate the whole dataset.
- **Full resource fetched**: the cited GeoJSON/CSV was downloaded and parsed; count and geometry observations below come from that file.
- **Unverified**: download, completeness, licensing detail or geolocation was not established. An attractive catalogue name is not acceptance evidence.

Public GETs were read-only. Direct network requests initially failed under the sandbox DNS restrictions; approved network reads succeeded. Working metadata/samples were kept in `/tmp` for investigation. No research branch or commit was created because the parent reported an unborn repository with no commit to branch from.

## National and non-Dublin sources

### Social Housing Construction Status Report Q1 2026 — recommended national housing information

**Publisher:** Department of Housing, Local Government and Heritage. **Licence:** CC BY-SA 4.0, not CC BY. Catalogue created/modified **28 July 2026**; CSV resource modified **28 July 2026**. Data refer to **Q1 2026**, not October 2026. Live official catalogue search found Q1 2026 as the newest matching report in this investigation; the gov.ie indexed collection still emphasized Q4 2025, illustrating why publication-page search alone can be stale. [Official catalogue](https://opendata.housing.gov.ie/dataset/social-housing-construction-status-report-q1-2026), [licence](https://creativecommons.org/licenses/by-sa/4.0/), [official catalogue API](https://opendata.housing.gov.ie/api/3/action/package_search?q=%22social%20housing%20construction%22&rows=100).

**Full CSV fetched and schema checked:** 453,556 bytes; **3,208 numbered scheme rows**, covering **31 local authorities**. The file has two summary rows, then a header; many trailing blank rows. UTF-8 decoding failed; Windows-1252 decoding succeeded. Fields include funding programme, local authority (`LA`), `Scheme/Project Name`, units, approved housing body, four appraisal/design/tender stages, `On Site`, and `Completed`. Stage cells contain quarter values. No latitude, longitude, Eircode field or geometry. Rows include named development phases, so a naive string deduplication could destroy distinctions. [CSV resource](https://opendata.housing.gov.ie/dataset/b7fc5af6-71b4-4afb-b840-d71a248967b2/resource/e5f89137-be61-4038-a2d4-9e657b543f1f/download/csr-q1-2026.csv).

**Hackathon treatment:** preserve original project text and reporting quarter; normalize local authority and stage; explicitly keep `geolocation_status: unverified` until located. Search project names inside the selected town/county as information, not a guaranteed town-complete filter. Map only curated verified locations or show approximate locality pins explicitly marked approximate. The report is delivery/pipeline information, not stock of vacant homes, an eligibility check, or a live application window. Historical completed projects are present.

### LDA state lands — technically usable, semantically a different layer

The LDA explicitly distinguishes its state-land register from assessment of housing opportunity. It warns that the register has omissions, that zoning can be stale, and that identifying individual local-authority homes is restricted for residents' privacy. Its FAQ says the three database layers are downloadable. [LDA register FAQ](https://lda.ie/public-lands/register-of-relevant-lands), [LDA database terms](https://lda.ie/state-lands-database-terms-and-conditions).

Two national polygon layers were **catalogue verified, schema checked and one feature fetched**:

| Source | Live count | Native CRS / useful fields | Freshness observed |
|---|---:|---|---|
| [PRA State Assets](https://data.gov.ie/dataset/pra-state-assets) | 75,443 | EPSG:2157; `FOLIO`, `COUNTY`, `REG_OWNER`, `ITM_EAST`, `ITM_NORTH`, zoning fields, `IsResidential` | Description says Q3 2023, release 20 Nov 2023; ArcGIS data edit 8 Apr 2024; catalogue harvested 4 Oct 2026 |
| [State Assets Sourced by LDA](https://data.gov.ie/dataset/state-assets-sourced-by-lda) | 329 | EPSG:2157; `Registered_Owner`, `COUNTY`, `ITM_EAST`, `ITM_NORTH`, `BUILDING_USE`, zoning fields | Description says Q3 2023, release 20 Nov 2023; ArcGIS data edit 24 Oct 2024; catalogue harvested 4 Oct 2026 |

Both catalogue licences are **CC BY 4.0**. Requests with `outSR=4326&f=geojson` returned usable longitude/latitude polygons. Counts are service observations, not independently confirmed counts of public land ownership. A row's owner correspondence address can be elsewhere: sample parcel in Clare had an owner address in Dublin. Geolocate from geometry, never this address. These are **state land**, not “government housing projects”, not available homes, and not necessarily developable. Omit them from the hackathon main flow unless a separate optional “state land” overlay helps explain the project. [PRA service](https://services6.arcgis.com/Vx9miIJ7oMVDgH95/arcgis/rest/services/PRA_State_Assets_OpenData_Live/FeatureServer/0), [LDA-sourced service](https://services6.arcgis.com/Vx9miIJ7oMVDgH95/arcgis/rest/services/State_Assets_Sourced_by_LDA_OpenData_Live/FeatureServer/0).

### LDA project pages — curated housing pins

The first-party [LDA projects directory](https://lda.ie/projects) is an information source, not a verified public bulk API. A sampled [Inchicore project page](https://lda.ie/projects/inchicore-dublin) exposes a current status, next step, estimated homes and latitude/longitude. Here the status is due-diligence analysis and the next step is a masterplan; this is potential development rather than an available housing scheme. The [Shanganagh launch page](https://lda.ie/news/lda-and-d%C3%BAn-laoghaire-rathdown-county-council-officially-launch-new-shanganagh-castle-estate) describes delivered affordable, cost-rental and social homes. Preserve tenure and project status distinctly. Automated scraping permission/bulk reuse terms for project-page text were **not** established; source-linked, manually reviewed facts are the safe planning option. Do not assume State Lands Database licence covers all website text.

### NPWS national parks — supplementary polygons, incomplete service

Do not use the [Heritage Council “National Parks” catalogue entry](https://data.gov.ie/dataset/national-parks) as a ready importer: its only resource is an internal ArcSDE connection string, and its description admits missing parks. A better first-party service is linked from the [NPWS Connemara boundary catalogue](https://data.gov.ie/dataset/connemara-national-park-boundary-map):

[NationalParkBoundaries FeatureServer layer 0](https://services-eu1.arcgis.com/Jhij7i46ouO8Cc0N/arcgis/rest/services/NationalParkBoundaries/FeatureServer/0).

**Full query fetched:** six polygon features: Wicklow Mountains, Wild Nephin, Killarney, Glenveagh, Connemara and Burren. Native CRS EPSG:2157; `outSR=4326` works. Fields `OBJECTID`, `DESIG`, `SITE_NAME`, `Ver`, area/length. The Connemara catalogue licence is CC BY 4.0; download filenames date to 2021/2022. Do not infer an October 2026 complete inventory or public access entrances from six boundaries. National parks also do not substitute for everyday town parks. [NPWS source metadata/resources](https://data.gov.ie/api/3/action/package_show?id=connemara-national-park-boundary-map).

Protected SAC/SPA/NHA boundaries are available separately, but a protected area need not be a publicly accessible park; do not rank it as a park solely because it is green or protected. [NPWS designation downloads and limitations](https://www.npws.ie/maps-and-data/designated-site-data/download-boundary-data).

### Councils outside Dublin — examples, not a nationwide inventory

| Source | Evidence and fields | Dates / licence / gap |
|---|---|---|
| [Galway City Community Centre Locations](https://data.gov.ie/dataset/galway-city-community-centre-locations2) | Schema + sample fetched; **4** points; EPSG:4326; `Name`, `Location` | CC BY 4.0; service data edit 5 May 2021; catalogue harvested 4 Oct 2026. Galway city only. |
| [Roscommon Community Centres](https://data.gov.ie/dataset/community-centres6) | Schema + sample fetched; **41** points; service CRS EPSG:2157 although catalogue prose says Web Mercator; WGS84 longitude/latitude fields also present | CC BY 4.0; description creation 2011; service edit 31 May 2021; catalogue harvested 4 Oct 2026. County only. |
| [Cork City Parks](https://data.gov.ie/dataset/cork-city-parks) | Catalogue verified only: CSV, SHP, GeoPackage | CC BY 4.0; CSV resource 8 Oct 2021, SHP/GPKG 15 Apr 2026. Schema/current completeness unverified. |

This illustrates why harvest time must never be labeled “data updated”. Adapter differences are real: spelling, mixed facility classifications and administrative coverage vary. Catalogue search for a town is discovery, not a test that every service there has been recorded.

### OpenStreetMap — proposed national baseline

[Geofabrik's Ireland and Northern Ireland page](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html) was fetched directly. At observation it advertised an approximately **395 MB** PBF containing OSM data to **3 Oct 2026 20:20:50 UTC**, plus roughly 992 MB SHP and 948 MB GPKG exports. The underlying country PBF was **not downloaded or counted** in this research. Exact proposed source: [ireland-and-northern-ireland-latest.osm.pbf](https://download.geofabrik.de/europe/ireland-and-northern-ireland-latest.osm.pbf). Pin the actual dated file and timestamp at ingestion; `latest` is mutable.

Use `amenity=community_centre`, `leisure=park`, optionally a separately labeled `leisure=playground` layer. Include nodes, ways and relations; points alone miss facilities mapped as building/park outlines. Filter private/closed access when tags support it, retain unknown access as unknown, and preserve source IDs. National parks use a different boundary tag. OSM's tag docs expressly distinguish urban parks and community centres from government administrative facilities. [Community-centre tag](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dcommunity_centre), [park tag](https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpark).

OSM data are ODbL with attribution and applicable database obligations; do not treat them as CC BY or silently apply an official-council licence. Keep source-specific provenance and licence metadata. OSM is a community dataset with no guarantee that every place is mapped. [OSM copyright/licence](https://www.openstreetmap.org/copyright).

## Dublin: ready enrichment sources and concrete defects

| Dataset | Evidence / observed schema | Coverage, dates and licence |
|---|---|---|
| [Community Centres DCC](https://data.smartdublin.ie/dataset/community-centres-dcc) | Full GeoJSON fetched: **99 Point** features, explicit CRS84 `[longitude,latitude]`; `Title`, `Description`, address, `Region`, `DccArea`, census small area, electoral division. CSV also advertised. | Dublin City despite description's regional wording. Dataset modified 19 Jun 2025; CSV 3 Jan 2024 / GeoJSON 5 Jan 2024; catalogue temporal range 2019–2023. Smart Dublin licence `cc-by`; national mirror calls CC BY 4.0. |
| [Parks, Gardens and Public Spaces DCC](https://data.smartdublin.ie/dataset/parks-gardens-and-public-spaces-dcc) | Full GeoJSON: **90 Point** features, CRS84; actual fields `Name`, `CultureDescription`, `DccAreaNew`, not the generic description's `Title`. | Publisher DCC; catalogue says Greater Dublin Area but sample `Region` DCC; no proof of full Greater Dublin coverage. Resources 16 Jan 2024, metadata 19 Jun 2025. `cc-by`. |
| [Parks and Open Spaces DCC 2016](https://data.smartdublin.ie/dataset/parks-and-open-spaces-dcc) | Full GeoJSON: **566 MultiPolygon** features; CRS84; `Park_ID`, `Name`, `Typology`, `Area_mSq`, numerous nullable amenity columns. | Explicitly a **2016 survey not updated since**. Metadata 1 Sep 2025 and extra GeoJSON upload 1 Apr 2025 do not refresh observations. `cc-by`. Historical geometry enrichment only. |
| [Community Facilities DLR](https://data.smartdublin.ie/dataset/community-facilities-dlr) | Full GeoJSON: **53 Point** features, longitude/latitude, no explicit CRS; `name`, `category`, `dlr_owned`, `address`, `eircode`, ITM properties. | DLR only, mixes community/cultural/library categories; filter before counting centres. Resources 18 Mar 2025; metadata 19 Jun 2025. `cc-by`. |
| [Main Parks DLR](https://data.smartdublin.ie/dataset/main-parks-dlr) | Full GeoJSON: **15** polygons/multipolygons, longitude/latitude with third ordinate; `park_name`, `type`, area fields. CSV describes ITM; don't assume every format shares CRS. | DLR expressly warns not all local parks/open spaces. Resources 5 Apr 2022; metadata 19 Jun 2025. `cc-by`. |
| [Community Centres 2025 FCC](https://data.smartdublin.ie/dataset/community-centres-2025-fcc) | Schema and one sample fetched; **41** service points. Actual sample geometry is swapped: Applewood `[53.47194741,-6.24658235]`; `Lat=-6.24658235`, `Long=53.47194741`. | Fingal; source description April 2025; service data edit 3 Feb 2026. CC BY 4.0. **Quarantine until source-specific verified correction.** |
| [Local/National Parks and Play Grounds FCC 2023](https://data.smartdublin.ie/dataset/local-national-parks-and-play-grounds-fcc-20232) | Schema + one point fetched; service actually named `Play_Areas`. Sample Racecourse Park is `Type=Playground`; native EPSG:2157 and correct transformed point. | Fingal only. CC BY 4.0, catalogue modified 18 Apr 2026; not validated as a complete park boundary layer. Classify actual features, not title. |
| [Parks SDCC](https://data.smartdublin.ie/dataset/parks-sdcc1) | Schema + sample fetched; **84** polygons; EPSG:2157 → 4326; `RefName`, `Hierarchy`, `Area1`. | South Dublin; service edit 31 May 2022; catalogue 17 Sep 2024; `cc-by`. |
| [Multi-Use Community Centres SDCC](https://data.smartdublin.ie/dataset/multi-use-community-centres1) | Schema + sample fetched; **32** points; EPSG:2157 → 4326. `Name`, `PrimaryActivity`, many facilities including creche/disability access. | South Dublin; edit 13 Apr 2021, catalogue 17 Sep 2024. Catalogue **CC0**, unlike nearby layers; do not assume shared licence. Old amenities aren't live availability. |

### Housing-looking Dublin datasets that are not map-ready public housing

[Housing Completions SDCC](https://data.smartdublin.ie/dataset/housing-completions-sdcc) and [Residential Development Under Construction or Permitted but not commenced SDCC](https://data.smartdublin.ie/dataset/residential-development-under-construction-or-permitted-but-not-commenced-sdcc) were schema/sample checked. Their linked FeatureServer layer 0 resources are **non-spatial tables**, with no extent/geometry: six neighborhood aggregates for completions, 293 planning-reference records for pipeline. They contain sums of studio/one-/two-/three-/four-/five-bedroom units. Catalogue publication 1 Apr 2026, service names Q1 2026, `cc-by`. These do not establish government ownership or live rooms availability; joining to planning geometry would be separate work.

Vacant/derelict registers and development-plan zoning may provide context but cannot substitute for public housing projects, housing supply or eligibility. A planned area, completed scheme, state land parcel and currently available home need separate record types.

## Ingestion acceptance checks and scoring implications

1. Store `dataset_id`, publisher, source resource URL, licence, source reference period, source modification date and retrieval timestamp separately. Record optional service edit timestamp as a technical edit signal, not survey recency.
2. Validate Dublin/Ireland coordinate bounds before indexing. A valid global longitude/latitude range will **not** catch Fingal's swapped pair, because both numbers are globally valid. Quarantine failures; corrections require source adapter rules and a verified location, never an unconditional global swap.
3. Ask ArcGIS for `outSR=4326` and preserve original CRS metadata. Handle transfer limits/pagination; a response of 2,000 rows need not be the full 75,443-parcel state-land dataset. The deliberately limited one-feature query reported transfer-limit metadata; it did not validate full-layer export.
4. Do not count a park point and its boundary, OSM record and council record, or each housing phase as separate equivalent amenities. Deduplicate with provenance and explicit match confidence.
5. Rank access to services, not their raw count alone. Park boundary distance/entrance routing is more useful than centroid distance for big sites. Do not infer accessibility, opening hours, school places, creche vacancies or hospital capacity from existence of a point.
6. Return coverage with each area result: `official_subset`, `community_baseline`, `missing`, `stale`, `location_unverified`. Missing records must produce “insufficient data”, not zero-quality neighborhoods. This prevents a Dublin-heavy catalogue from making rural towns look systematically worse.
7. Keep government housing **informational** and stage-aware; leave its ranking weight disabled for this agreed version. Household room needs cannot be satisfied by counts of scheme bedrooms or historical completions.

## Exact machine-readable resource ledger

The following ledger preserves URLs discovered from live publisher metadata. Formats beside a URL are catalogue claims; actual-fetch evidence is described above. WMS is map imagery and is not the preferred feature importer. The ledger includes download alternatives whose bytes were not individually fetched.

### Community Centres DCC

- [csv resource](https://data.smartdublin.ie/dataset/b4b53dc7-4b1e-4918-81fb-7e8f2899c3db/resource/39f01fec-c3e7-4aa4-af67-e5b867b84729/download/030124-dataset-community-centres-halls.csv)
- [GEOJSON resource](https://data.smartdublin.ie/dataset/b4b53dc7-4b1e-4918-81fb-7e8f2899c3db/resource/583fcdc1-4029-427d-8902-1ddc56c4a51f/download/030124-dataset-community-centres-halls.geojson)

### Parks, Gardens and Public Spaces DCC

- [GEOJSON resource](https://data.smartdublin.ie/dataset/e18455ed-4ce8-43c1-a777-c6b0f560ec63/resource/4ccab0e7-122d-4406-9bf6-8745914f9590/download/030124-dataset-parks-gardens-and-public-spaces.geojson)
- [csv resource](https://data.smartdublin.ie/dataset/e18455ed-4ce8-43c1-a777-c6b0f560ec63/resource/dd680f1b-0ecf-4da1-9858-98776689e178/download/030124-dataset-parks-gardens-and-public-spaces.csv)

### Parks and Open Spaces DCC 2016

- [csv resource](https://data.smartdublin.ie/dataset/6fde9a72-2f29-4e5a-b2aa-d02b2a2cdc2d/resource/2ef2d44d-740f-4e66-ae2e-f51145147997/download/dcc_parks_strategy2016_park_classification.csv)
- [geojson resource](https://data.smartdublin.ie/dataset/6fde9a72-2f29-4e5a-b2aa-d02b2a2cdc2d/resource/42fec1fb-5d7e-4946-b996-982037782b3d/download/dcc_parks_strategy2016_park_classification.geojson)
- [GEOJSON resource](https://data.smartdublin.ie/dataset/6fde9a72-2f29-4e5a-b2aa-d02b2a2cdc2d/resource/a8ba5cfe-cce7-49cb-bb38-ef2430191d14/download/dcc_parks_strategy2016_park_classification.geojson)

### Main Parks DLR

- [GeoJSON resource](https://data.smartdublin.ie/dataset/a9de4c9e-06c8-4675-892f-e53add378685/resource/6c01b4c0-48e3-4150-99e9-a320b18b45a9/download/dlrmainparks.geojson)
- [CSV resource](https://data.smartdublin.ie/dataset/a9de4c9e-06c8-4675-892f-e53add378685/resource/8a9b8f5c-f947-46eb-acc1-09362abb3aec/download/dlrmainparks.csv)

### Community Facilities DLR

- [csv resource](https://data.smartdublin.ie/dataset/c0cfad09-e686-4934-af52-fdcfe41798f2/resource/5f31765d-6841-4bb1-91bf-06a33f45086a/download/community-facilities-dlr.csv)
- [geojson resource](https://data.smartdublin.ie/dataset/c0cfad09-e686-4934-af52-fdcfe41798f2/resource/01356d4a-57a0-4d65-83dd-9840db55e226/download/community-features-dlr.geojson)

### Community Centres  2025 FCC

- [ArcGIS GeoServices REST API resource](https://services5.arcgis.com/CI1e5PKQXvJgmJK8/arcgis/rest/services/Community_Centres__FCC/FeatureServer/0)
- [CSV resource](https://data.fingal.ie/api/download/v1/items/ee0d534ff3cd4a7187fc5bc7699dc8e6/csv?layers=0)
- [GeoJSON resource](https://data.fingal.ie/api/download/v1/items/ee0d534ff3cd4a7187fc5bc7699dc8e6/geojson?layers=0)

### Local/National Parks and Play Grounds FCC 2023

- [ArcGIS GeoServices REST API resource](https://services5.arcgis.com/CI1e5PKQXvJgmJK8/arcgis/rest/services/Play_Areas/FeatureServer/0)
- [CSV resource](https://data.fingal.ie/api/download/v1/items/363085bfd8b740e48b7ab0c86d69c47a/csv?layers=0)
- [GeoJSON resource](https://data.fingal.ie/api/download/v1/items/363085bfd8b740e48b7ab0c86d69c47a/geojson?layers=0)

### Parks SDCC

- [ArcGIS GeoServices REST API resource](https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Parks/FeatureServer/0)
- [CSV resource](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/e20e362f4238495fac1f538e43837af6/csv?layers=0)
- [GeoJSON resource](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/e20e362f4238495fac1f538e43837af6/geojson?layers=0)

### Multi-Use Community Centres

- [ArcGIS GeoServices REST API resource](https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Community_Sports_Youth_Centres/FeatureServer/2)
- [CSV resource](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/043e925e4661478781e1d8ee14785472/csv?layers=2)
- [GeoJSON resource](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/043e925e4661478781e1d8ee14785472/geojson?layers=2)

### Galway City Community Centre Locations

- [ArcGIS GeoServices REST API resource](https://services-eu1.arcgis.com/Zmea819kt4Uu8kML/arcgis/rest/services/CommunityCentresOpenData/FeatureServer/0)
- [CSV resource](https://galway-city-council-opendata-galwaycityco.hub.arcgis.com/api/download/v1/items/e13246bd0f094647be1ae053c8a87034/csv?layers=0)
- [GeoJSON resource](https://galway-city-council-opendata-galwaycityco.hub.arcgis.com/api/download/v1/items/e13246bd0f094647be1ae053c8a87034/geojson?layers=0)

### Community Centres

- [ArcGIS GeoServices REST API resource](https://services1.arcgis.com/0g8o874l5un2eDgz/arcgis/rest/services/CommunityFacilities/FeatureServer/0)
- [CSV resource](https://data-roscoco.opendata.arcgis.com/api/download/v1/items/6dea1ab566164774aa2fc4d4285efd2e/csv?layers=0)
- [GeoJSON resource](https://data-roscoco.opendata.arcgis.com/api/download/v1/items/6dea1ab566164774aa2fc4d4285efd2e/geojson?layers=0)

### Parks

- [CSV resource](https://data.corkcity.ie/dataset/1dfa2796-66e9-423d-8e45-86df3b27a7cf/resource/6fa2e95d-90a4-4a96-bf30-5d4756f6a777/download/parks.csv)
- [geopackage resource](https://data.corkcity.ie/dataset/1dfa2796-66e9-423d-8e45-86df3b27a7cf/resource/852ef8ff-92a8-4cab-b667-a81d94c14b39/download/parks.gpkg)

### PRA State Assets

- [ArcGIS GeoServices REST API resource](https://services6.arcgis.com/Vx9miIJ7oMVDgH95/arcgis/rest/services/PRA_State_Assets_OpenData_Live/FeatureServer/0)
- [CSV resource](https://opendata-lda-ie.hub.arcgis.com/api/download/v1/items/347bfdb24c52472a96f5ce8930ce1931/csv?layers=0)
- [GeoJSON resource](https://opendata-lda-ie.hub.arcgis.com/api/download/v1/items/347bfdb24c52472a96f5ce8930ce1931/geojson?layers=0)

### State Assets Sourced by LDA

- [ArcGIS GeoServices REST API resource](https://services6.arcgis.com/Vx9miIJ7oMVDgH95/arcgis/rest/services/State_Assets_Sourced_by_LDA_OpenData_Live/FeatureServer/0)
- [CSV resource](https://opendata-lda-ie.hub.arcgis.com/api/download/v1/items/30e147e1565849fd9bbb3d79992b6e16/csv?layers=0)
- [GeoJSON resource](https://opendata-lda-ie.hub.arcgis.com/api/download/v1/items/30e147e1565849fd9bbb3d79992b6e16/geojson?layers=0)

### Housing Completions SDCC

- [ArcGIS GeoServices REST API resource](https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Housing_Completions_Q1_2026_SDCC/FeatureServer/0)
- [CSV resource](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/a831d9efaa5841589a933d8c9214b9c5/csv?layers=0)

### Residential Development Under Construction or Permitted but not commenced SDCC

- [ArcGIS GeoServices REST API resource](https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Residential_Development_Under_Construction_or_Permitted_but_not_commenced_Q1_2026_SDCC/FeatureServer/0)
- [CSV resource](https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/4c1169bc8aa345a79e941f718e2792ff/csv?layers=0)

### National construction report Q1 2026

- [XLSX resource](https://opendata.housing.gov.ie/dataset/b7fc5af6-71b4-4afb-b840-d71a248967b2/resource/763f1e4f-93c4-43a8-a0a4-0338adc2e8aa/download/csr-q1-2026.xlsx)
- [CSV resource](https://opendata.housing.gov.ie/dataset/b7fc5af6-71b4-4afb-b840-d71a248967b2/resource/e5f89137-be61-4038-a2d4-9e657b543f1f/download/csr-q1-2026.csv)

## Original source snapshots saved

On the user's subsequent instruction to save raw data before parsing, the Q1 2026 housing CSV and the verified council parks, community and street-lighting source bodies were saved under `data/raw/<source>/2026-10-04/`. Original fields/geometry/encoding are retained. Every source has a provenance/licence/count manifest. The [utilities research collection appendix](/Users/fs/dev/openai/docs/research/ireland-utilities.md) lists exact folders and final counts, including successful full API enumeration, unknown file-internal counts and the Fingal community coordinate quarantine. No housing coordinates were inferred and no database import occurred.
