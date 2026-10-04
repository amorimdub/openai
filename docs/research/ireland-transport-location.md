# Ireland service map: transport, places, boundaries and location input

Observed: **4 October 2026**. Research decision: use offline national NTA transport snapshots and CSO/Tailte town polygons; start with a town/city selector and a user-confirmed map pin. Precise address/Eircode lookup and journey routing are optional later dependencies. This establishes **Republic of Ireland** coverage; it does not establish complete Northern Ireland coverage. Implementation was not started.

## Verified source inventory

| Source | Direct resource / service | Format and access | Evidence obtained |
|---|---|---|---|
| NTA national transport schedules | [GTFS_All.zip](https://www.transportforireland.ie/transitData/Data/GTFS_All.zip) | Public ZIP of GTFS CSV tables; no key for download | HEAD HTTP 200, application/zip, 179,594,769 bytes, Last-Modified 2026-10-03 22:15:49 UTC. Subsequently downloaded unchanged; CRC passes, 14,155 stop rows. Actual service calendars remain unparsed; see [raw acquisition evidence](ireland-raw-market-transport-quality-of-life.md). |
| NTA national stop register | [NaPTAN.json](https://www.transportforireland.ie/transitData/Data/NaPTAN.json) | Public JSON; XML and XLSX also listed | Downloaded and parsed: 21,731,297 bytes, 17,161 stop-point records: 17,098 active, 62 pending, 1 inactive. Dataset creation/modification 2026-10-01. |
| NTA LUAS schedule sample | [GTFS_LUAS.zip](https://www.transportforireland.ie/transitData/Data/GTFS_LUAS.zip) | Public GTFS ZIP | Downloaded/parsed: 1,010,252 bytes, 128 stop/platform records and 2 routes. Confirms real resource schema, not complete national feed validation. |
| CSO 2022 urban areas, Tailte publisher | [Town polygon layer](https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer/5) | Public ArcGIS REST; JSON / GeoJSON, EPSG:2157 native | Layer metadata, all 867 attribute records, and full 867-feature WGS84 GeoJSON fetched and parsed (3,002,571 bytes). |
| CSO 2022 small areas, Tailte publisher | [Small-area polygon layer](https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Small_Area_National_Statistical_Boundaries_2022_Ungeneralised_view/FeatureServer/0) | Public ArcGIS REST, polygons, EPSG:2157 native | Metadata and one WGS84 GeoJSON polygon checked; full national geometry **not** downloaded. |
| Administrative county boundaries | [Tailte Administrative Areas 2019](https://data-osi.opendata.arcgis.com/datasets/osi::administrative-areas-national-statutory-boundaries-2019) | ArcGIS portal | Official CSO-linked catalogue proof only; direct export/schema not checked. |

Downloads are offline feasible. A successful HTTP response proves resource access, not current operational coverage or completeness. Preserve acquisition time, publisher date, feed version, licence, checksum and source URL with each import.

## Transport: use the national catalogue

The [official current NTA/TFI data page](https://www.transportforireland.ie/transitData/PT_Data.html) provides the all-operator feed and separate Dublin Bus, Bus Éireann, Irish Rail, GoAhead, LUAS, Local Link, Nitelink and other operator feeds, plus NaPTAN and PTIMS GeoJSON infrastructure. It states CC BY 4.0 attribution to NTA. Use this page rather than the older `/GTFS` portal page that still links December 2019 stop snapshots. The [national catalogue](https://data.gov.ie/dataset/nta-gtfs) lists daily updating, but an imported snapshot still requires its actual service calendars to be checked.

NaPTAN sample fields checked: `NaPTAN.StopPoints.StopPoint[]`, `AtcoCode`, `@Status`, `Descriptor.CommonName.#text`, and `Place.Location.Translation` containing `GridType=ITM`, `Easting`, `Northing`, `Longitude`, `Latitude`. First checked record is Ballymagrorty, latitude 55.0334043 / longitude -7.3577718. Filter active records and report missing coordinates. These are transport locations, **not evidence that a useful route currently serves each stop**. NPTG locality references can help place context but have not been independently validated here. [National NaPTAN resource](https://www.transportforireland.ie/transitData/Data/NaPTAN.json).

For schedules import `stops`, `routes`, `trips`, `stop_times`, `calendar`, `calendar_dates`, plus `agency`, `feed_info` and optional shapes. Key relationships are trip → route/service calendar and stop_time → trip/stop. Coordinates in GTFS are latitude/longitude; GeoJSON is longitude/latitude. Respect pickup restrictions, direction, parent stations and duplicate platform records. Derive departures for a **chosen date and time window**, applying holiday exceptions. [GTFS specification](https://gtfs.org/documentation/schedule/reference/).

Observed LUAS sample: `stops.txt` includes `stop_id`, `stop_code`, `stop_name`, `stop_lat`, `stop_lon`, `location_type`, `parent_station`, `wheelchair_boarding`; `routes.txt` has Green/Red, `route_type=0`. `agency_timezone` is `Europe/London` in this feed: retain the supplied timezone and parse service-day times properly. Five calendar records reach December 2026, with a 26 October exception. `feed_info` advertises 2026-10-03 to 2027-10-03, which is **longer than actual calendar coverage**. Therefore never use `feed_end_date` alone to decide a selected date is supported. [Sample archive](https://www.transportforireland.ie/transitData/Data/GTFS_LUAS.zip).

Scoring levels should stay distinct:

1. **Stop access:** nearest active, served stop; straight-line metres is a defensible initial metric if labelled. Neither a radius nor a station count proves walkability.
2. **Scheduled service:** departures per hour, service days, first/last service and distinct useful routes from current GTFS; deduplicate platforms/overlapping feeds. Cap counts to avoid rewarding a cluster of poles.
3. **Scheduled journey:** needs origin/destination, departure time, street access/egress, transfers and a routing engine. GTFS alone is not a door-to-door planner.
4. **Observed reliability/live journey:** requires real-time observations/history, separate from a static snapshot.

The ZIP named [GTFS_Realtime.zip](https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip) is a **static schedule bundle for real-time operators**, not a live vehicle feed. The [NTA developer portal](https://developer.nationaltransport.ie/) requires sign-up/keys for GTFS-R. The [NTA fair-usage policy](https://developer.nationaltransport.ie/usagepolicy) specifies tokens and once-per-60-second access per token, attribution, accuracy and usage conditions. No account, token or live API call was tested. None is necessary for the proposed offline hackathon scoring.

Car-based household preferences cannot be satisfied by bus-stop proximity. For the demo, lower transport weight or expose a separate car preference; do not invent driving minutes without road routing. Useful future metrics are road-network travel time to selected anchors and mode-specific access; they need a separate source/provider decision.

## Town/city selection and map areas

Use the [2022 urban-area layer](https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer/5) as the first local selector: `URBAN_AREA_GUID`, `URBAN_AREA_CODE`, `URBAN_AREA_NAME`, `COUNTY`, `Centroid_x`, `Centroid_y`. The checked API returns all 867 records below its 2,000-record limit. Centroid fields are **ITM metres**, not longitude/latitude; query output geometry with `outSR=4326` or transform EPSG:2157. A point-on-surface is preferable to an unchecked centroid as a map focus.

Verified full offline GeoJSON query:

`https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer/5/query?where=1%3D1&outFields=URBAN_AREA_GUID,URBAN_AREA_CODE,URBAN_AREA_NAME,COUNTY&outSR=4326&f=geojson`

These are statistical built-up areas, not every village or rural locality. The [CSO explanation](https://www.cso.ie/en/census/census2022/census2022smallareapopulationstatistics/) supplies 867 urban areas, 18,919 small areas and matching Census 2022 CSV downloads. Small areas support national rural coverage and within-city analysis but are not naturally named neighbourhoods. Do not rank an entire town from one town-centre pin and imply the result describes every home. Choose between scoring a confirmed point, a consistently sampled town distribution, or comparison of small areas; this remains a product decision.

Checked small-area fields include `SA_GUID_2022`, `SA_PUB2022`, `SA_GEOGID_2022`, `SA_URBAN_AREA_NAME`, `COUNTY_ENGLISH`, `ED_GUID`, `ED_ENGLISH`, `CSO_LEA`. The service caps responses at 2,000: paginate or use full exports for national ingestion. Generalised geometry suits display; preserve the ungeneralised edition for precise point membership.

Licence evidence matters: data.gov.ie urban/small-area records display **“No licence specified”**, but the publisher's exact [urban-area ArcGIS item](https://www.arcgis.com/sharing/rest/content/items/5468708d36454d1f95a3ff23cbaeb2f5?f=pjson) and [small-area item](https://www.arcgis.com/sharing/rest/content/items/70a33cbb8bd7406da0d571be28624721?f=pjson) `licenseInfo` explicitly state CC BY 4.0. Retain that item-level evidence, credit CSO/Tailte Éireann, and respect the stated generalisation/reference limitations. The [urban catalogue](https://data.gov.ie/dataset/cso-urban-areas-national-statistical-boundaries-2022-generalised-20m) dates its geography to 2022 and release to June 2023; API metadata/update times are not a new census.

Optional locality enrichment: [Logainm open data](https://www.logainm.ie/en/about/open-data) is CC BY 4.0 for placenames through its API, requires a Gaois account/key, recommends monthly updates, and prohibits website scraping. Explanatory notes/citations are excluded from that open licence. [Its data dictionary](https://docs.gaois.ie/en/data/logainm/v1.0/data) exposes coordinates plus an `Accurate` flag; some coordinates may be extrapolated. No credentials or API payload were checked. This is enrichment, not the first demo dependency.

## Address and Eircode constraints

[Eircode's official products page](https://www.eircode.ie/business/products-and-services) describes ECAF address data and ECAD geocoordinates as purchased, licensed products; direct-end-user licensing is for internal use and disallows sharing/selling those products/services to other companies. The public Finder is not proof of an unrestricted open bulk database or free application API. Do not scrape it or rely on unofficial lookup endpoints. Check an approved provider's licence before building exact-Eircode search.

Practical demo flow: choose town/city locally → configure household priorities → optionally place/adjust the home/work anchor on the map → score with visible location precision. Rural users can place a pin even when not in the 867-name list. Browser location can be optional, requested only by an explicit user action. Never retain a home/work text address merely to calculate distances; use coordinates in the request and avoid storing raw queries by default.

A generic geocoder is another possible future dependency. **Public Nominatim is not a default home-address integration:** its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) says not to submit personal/confidential information, caps the entire application at one request/second, requires identifying User-Agent/Referer and attribution, caches and switchability, and prohibits autocomplete/systematic POI queries. Select self-hosting or a suitable licensed provider deliberately if exact address lookup becomes essential. Town-first offline input avoids that dependency entirely.

## Remaining gates

- Validate `GTFS_All.zip` completely before national timetable claims: calendar coverage, operators, coordinate validity, IDs and completeness; the national ZIP is now downloaded with CRC verification, while service-level timetable analysis remains outstanding.
- Decide point scoring versus town/area comparison and define rural fallback. Household transport mode changes the meaning of proximity.
- Determine whether “all Ireland” means Republic or all island. Northern Ireland transport, boundaries and licensing are not validated here.
- Choose a road/walk/transit router before displaying journey minutes or catchments; otherwise label straight-line proximity clearly.
- Maintain timestamps and coverage flags so missing data never becomes a zero-quality judgement.
