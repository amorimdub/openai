# National schools, healthcare and early-years data

Research observed **4 October 2026**. Scope: Republic of Ireland, with Dublin as a filter rather than the dataset boundary. Northern Ireland requires separate sources; these findings do not establish whole-island coverage. This is a data-planning investigation, not an implemented importer or application.

## Decision

Use **Pobal Childcare Facilities** as the first nationally importable childcare-location layer, and **GeoHive / HSE Health Atlas Hospitals** as an explicitly historical hospital-location baseline. The most useful current school source is the Department of Education's public **Schools Map_WFL1**, but its item contains no reuse-license declaration: establish reuse terms before publishing that dataset. A working, explicitly CC BY licensed historical school layer exists for a clearly labelled demonstration, but cannot support claims about current school provision.

The immediate product promise should be **proximity to recorded services**. These sources do not establish available childcare places, school admission eligibility, waiting times, emergency-department access, or service quality. Missing suitability/availability attributes must remain unknown rather than earning a zero or invented score.

## Verified source matrix

| Category / source | Geographic coverage and verified access | Format / geometry | Reuse and freshness | Hackathon disposition |
|---|---|---|---|---|
| [Department of Education Schools Map_WFL1](https://services-eu1.arcgis.com/9HteQxumPOXiqlpG/arcgis/rest/services/Schools_Map_WFL1/FeatureServer) | Republic of Ireland; count query returned **3,938** points; unauthenticated sample and distinct-field queries worked | ArcGIS JSON / GeoJSON; native EPSG:3857, tested `outSR=4326` | Item license empty; layer data edit **2026-05-08**; sampled/distinct `Year=2026` is not independently established as a census date | Best current candidate, **reuse gate unresolved** |
| [Provisional Schools Ireland](https://www.arcgis.com/home/item.html?id=df226b216e69428d8647ff8101d627a4) | National historical layers: **116 special**, **3,147 primary**, **711 post-primary**; each count and sample query worked | ArcGIS JSON / GeoJSON; native EPSG:2157, tested WGS84 output | Item declares Government of Ireland / Department of Education and Department of Arts, Heritage and the Gaeltacht, **CC BY 4.0**; **2014/15 source**, data edit **2015-11-23**; hosting account `gar.john`, provenance not independently authenticated | Historical demonstration fallback only; do not portray current coverage |
| [Department primary/post-primary current collections](https://www.gov.ie/en/department-of-education/collections/primary-schools-enrolment-figures/) | Search index lists preliminary **2025/26** files; direct pages returned HTTP **403** in browser fetch and public HTTP client | Published spreadsheet collections; exact current file URLs/schema not verified | Catalogue for data on individual schools says CC BY 4.0, but its resource points to a legacy landing page; relation to this exact current feature service is unproven | Acquisition and exact-license scope gate |
| [Pobal Childcare Facilities](https://www.arcgis.com/home/item.html?id=4bea2229af6b456ea362b3514b38d70a) | National publisher layer; count **5,075**; unauthenticated sample and count query worked | ArcGIS JSON / GeoJSON; native EPSG:2157; tested WGS84 output | Item explicitly **CC BY 4.0**; layer data edit **2026-09-15**; underlying observation/survey date not supplied | Preferred childcare points; distinguish scheme participation from registration, age suitability and availability |
| [Tusla EarlyYearsProviders](https://www.arcgis.com/home/item.html?id=41a791c10413419f9fea268ea07e016a) | National publisher layer; count **6,593**; sample and count query worked | ArcGIS JSON / GeoJSON; native EPSG:3857; tested WGS84 output | Item license empty; data edit **2025-07-09**; no verified update schedule for this layer | Registration-reference candidate, **reuse and record-population gates**; count is not a deduplicated active-crèche count |
| [Tusla county register](https://www.tusla.ie/services/preschool-services/early-years-providers/register-of-early-years-services-by-county/) | County lists nationally; Dublin link served **July 2026**, **173-page PDF**, text readable | PDF addresses; no latitude/longitude columns in reviewed Dublin table | Register page says monthly updates; observed PDF is July, not an October snapshot; specific PDF reuse license not verified | Useful age/service/capacity enrichment after permission/geocoding/normalization, not fastest first importer |
| [Hospitals — HSE Ireland / GeoHive](https://www.arcgis.com/home/item.html?id=feb34881088341bbbf80d86af6a4f333) | National historical hospital layer, **132** points; sample/count/category queries worked | ArcGIS JSON / GeoJSON; native WKID 29900 / latest 29902, tested WGS84 output | Explicit **CC BY 4.0**; Health Atlas supplied **March 2020**, data edit **2020-04-14**; item edit **2025-12-18** is metadata, not fresh hospital data | Usable historical location baseline; reconcile against current HSE directory before claiming current coverage |
| [South Dublin Preschool / Childcare](https://data.smartdublin.ie/dataset/preschool-childcare1) | **South Dublin only**, not all Dublin or national; feature sample worked | CSV / GeoJSON / shapefile / KML plus ArcGIS service; native EPSG:3857; tested WGS84 output | Catalogue **CC0**; catalogue and layer last data edit **2018-10-19** | Local historical fallback, not national backbone |

All counts above come from separate `returnCountOnly=true` responses observed during this investigation. They are not completeness certifications or counts of currently accepting services.

## Schools: primary, post-primary and special needs

The current Department feature service is publicly discoverable under ArcGIS account `statistics_unit_DOE`. Its service description specifies schools in the Republic of Ireland; layer 0 is the point layer, while table 1 must not be counted as additional facilities. [Service directory](https://services-eu1.arcgis.com/9HteQxumPOXiqlpG/ArcGIS/rest/services/Schools_Map_WFL1/FeatureServer), [item metadata JSON](https://www.arcgis.com/sharing/rest/content/items/e71d0ca28fc54513b9a169dac2ebc28d?f=json).

Tested distinct-value queries returned:

- `School_Type`: `Primary School`, `Post-Primary School`, `Special School`.
- `Primary_School_Type`: `Ordinary`, `Ordinary with Special Classes`, `Special School`, `NA`.
- `Primary_School_Level`: `Junior & Senior School`, `Senior School`, `Junior School`, `Unknown`, `NA`.
- `Year`: `2026`.

Fields include roll number, school name, address, county, Eircode, latitude/longitude, school planning area, local authority, language of instruction, ethos, gender, fee-paying flag and enrolments. One sampled Monaghan senior primary school had valid WGS84 coordinates and a roll number. This is valuable for named-school selection and matching children to school level, but junior/senior applicability must come from level, not a blanket primary-school score. Enrolments are pupils recorded, not empty seats; special-school presence does not prove suitability for a specific need. [Current layer schema](https://services-eu1.arcgis.com/9HteQxumPOXiqlpG/arcgis/rest/services/Schools_Map_WFL1/FeatureServer/0?f=pjson).

Exact current sample endpoint:

```text
https://services-eu1.arcgis.com/9HteQxumPOXiqlpG/arcgis/rest/services/Schools_Map_WFL1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=1&f=geojson
```

Reuse remains unresolved because this exact item's `licenseInfo`, description and acknowledgments were empty. Other Department indicator datasets being CC BY does not automatically establish terms for this point layer. [Exact item](https://www.arcgis.com/sharing/rest/content/items/e71d0ca28fc54513b9a169dac2ebc28d?f=json).

The Department's indexed [primary collection](https://www.gov.ie/en/department-of-education/collections/primary-schools-enrolment-figures/) lists preliminary 2025/26 and previous yearly files, with page update 15 May 2026; the [post-primary collection](https://www.gov.ie/en/department-of-education/collections/post-primary-schools-enrolment-figures/) lists 2025/26, page update 5 March 2026. These were discovery evidence from search indexing only: direct fetching returned 403, so no exact current file link, workbook structure or license text was validated. The [national catalogue's older school listing](https://data.gov.ie/en_GB/dataset/data-on-individual-schools/resource/0bdb34c2-ca4b-4b5a-8632-e197bc51e797) declares CC BY 4.0 but records a 2014 landing-page resource rather than a verified current data file.

Explicitly licensed authoritative 2016/17 national CSV listings also exist, but both legacy `education.ie` resource downloads returned 403. They are not verified usable imports. [Primary CSV catalogue](https://data.gov.ie/en_GB/dataset/list-of-primary-schools/resource/3ccb563a-a84f-4592-b7cd-84ad43b0bb4b), [post-primary catalogue](https://data.gov.ie/dataset/post-primary-schools-list-2017).

A working licensed **historical** fallback was sampled in each school layer. Item metadata explicitly names the Departments and CC BY 4.0; it is hosted under `gar.john`, so establish provenance before relying on it beyond a labelled demonstration. Native geometries advertise EPSG:2157, while legacy attribute `X`/`Y` values do not consistently look like ITM; use server geometry reprojection rather than inferring CRS from column names. [Metadata and license](https://www.arcgis.com/sharing/rest/content/items/df226b216e69428d8647ff8101d627a4?f=json), [service](https://services3.arcgis.com/ArIWe98F0BECP9pn/arcgis/rest/services/Schools_DeptEducationData/FeatureServer).

```text
https://services3.arcgis.com/ArIWe98F0BECP9pn/arcgis/rest/services/Schools_DeptEducationData/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
https://services3.arcgis.com/ArIWe98F0BECP9pn/arcgis/rest/services/Schools_DeptEducationData/FeatureServer/1/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
https://services3.arcgis.com/ArIWe98F0BECP9pn/arcgis/rest/services/Schools_DeptEducationData/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
```

Layer 0 is special, 1 primary, 2 post-primary. Counts total 3,974 historical records. These URLs are import patterns; full pagination/export completeness was not tested.

## Childcare: usable points, different authority layers

Pobal's item declares a downloadable national childcare layer and an explicit CC BY 4.0 license. The organisation's [open-data page](https://www.pobal.ie/research-analysis/open-data/) links its maps and explains its publication and reuse policy. The item was last modified in July 2025 while the live layer's data timestamp is September 2026: use the layer timestamp for technical freshness, but keep the underlying observation date unknown. [Item/license metadata](https://www.arcgis.com/sharing/rest/content/items/4bea2229af6b456ea362b3514b38d70a?f=json), [live layer](https://services8.arcgis.com/AF8wcIoCeDo33LsM/arcgis/rest/services/Childcare_Facilities_NEW/FeatureServer/2?f=pjson).

Verified fields: `service_name`, `service_ref`, misspelled `lattitude`, `longitude`, `eircode`, contact details, `organisation_type`, and string programme flags `ecce`, `ccsp`, `ncs`. The sample included an afterschool-named provider, confirming that this should be presented as childcare services rather than assuming every point is a baby crèche. The layer does not provide ages, opening hours, vacancy counts, fees or Tusla registration IDs. Its own description says all childcare facilities, but completeness against Tusla's active register was not proven; a programme flag is not regulatory status. [Schema](https://services8.arcgis.com/AF8wcIoCeDo33LsM/arcgis/rest/services/Childcare_Facilities_NEW/FeatureServer/2?f=pjson).

Exact tested sample and count endpoints:

```text
https://services8.arcgis.com/AF8wcIoCeDo33LsM/arcgis/rest/services/Childcare_Facilities_NEW/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=1&f=geojson
https://services8.arcgis.com/AF8wcIoCeDo33LsM/arcgis/rest/services/Childcare_Facilities_NEW/FeatureServer/2/query?where=1%3D1&returnCountOnly=true&f=json
```

The server advertises a **2,000-record** response limit, so 5,075 cannot be fetched safely in one default request. Page by object IDs or offsets, check transfer-limit indicators and verify collected unique IDs against count before releasing a snapshot. This is a proposed importer requirement; full export was not performed.

Tusla is the regulatory source. Its [register landing page](https://www.tusla.ie/services/preschool-services/early-years-providers/register-of-early-years-services-by-county/) describes the national county register and monthly refresh. The actual observed [Dublin PDF](https://www.tusla.ie/uploads/content/Dublin_July26.pdf) is headed July 2026, with service name/address, Tusla number, age range, service type, allowed capacity, registration date and conditions. Registered capacity is a regulatory maximum, not vacancies. Text extraction worked, but multi-line capacities such as limits for full-day/part-time care require careful parsing; first-page sample IDs demonstrate row readability, not validated extraction of every row.

Tusla's [national GIS item](https://www.arcgis.com/sharing/rest/content/items/41a791c10413419f9fea268ea07e016a?f=json) identifies childcare registrations as its source but supplies no license. A sample point contained `Ref_no` like `TU2015CC245`, facility name, address, Eircode and town. No service-type, age/capacity, status, or county fields were in the inspected schema; its 6,593 rows therefore must not be treated as 6,593 active baby crèches. [Layer](https://services-eu1.arcgis.com/FKG93wmpArM17gAf/arcgis/rest/services/EarlyYearsProviders/FeatureServer/0?f=pjson).

```text
https://services-eu1.arcgis.com/FKG93wmpArM17gAf/arcgis/rest/services/EarlyYearsProviders/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=1&f=geojson
```

Do not join Pobal `service_ref` to Tusla `Ref_no` as if they are the same identifier. Match reviewed name/address/Eircode plus distance, preserve both IDs and review ambiguous matches. A PDF-to-GIS join and national validation of ages/registration status are future enrichment work. [Pobal schema](https://services8.arcgis.com/AF8wcIoCeDo33LsM/arcgis/rest/services/Childcare_Facilities_NEW/FeatureServer/2?f=pjson), [Tusla schema](https://services-eu1.arcgis.com/FKG93wmpArM17gAf/arcgis/rest/services/EarlyYearsProviders/FeatureServer/0?f=pjson).

## Hospitals and healthcare

The GeoHive hospital item publishes HSE Health Atlas data under CC BY 4.0. It is a **March 2020** dataset, although item metadata was updated December 2025. The live layer data timestamp remains April 2020. [Item/license](https://www.arcgis.com/sharing/rest/content/items/feb34881088341bbbf80d86af6a4f333?f=json), [layer schema](https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/HospitalsHSEIreland/FeatureServer/0?f=pjson).

Exact tested endpoints:

```text
https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/HospitalsHSEIreland/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=3&f=geojson
https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/HospitalsHSEIreland/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json
```

Fields include category, subcategory, name, four address lines, Eircode, `POINT_X` longitude and `POINT_Y` latitude; native geometry CRS is Irish Grid WKID 29900/latest 29902. WGS84 GeoJSON samples were valid. Distinct subcategories include General/Acute, Community, Private General, Mental Health, Maternity, Paediatric, Rehabilitation and others. An Abbeyleix sample was Community and Aut Even Private General. A point in this layer therefore cannot automatically satisfy an emergency hospital or maternity requirement. [Queryable layer](https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/HospitalsHSEIreland/FeatureServer/0).

The [current HSE hospital directory](https://www.hse.ie/services/hospitals/) displayed 52 results in the search-index observation, a different population from this historical GIS layer's 132 records. Use it to verify service names/types and closures/moves; it was not verified as an open bulk API with an applicable reuse license. A [legacy HSE open-data catalogue URL](https://data.ehealthireland.ie/dataset/list-of-hospitals-in-ireland) was inaccessible in the browser tool and must not be advertised as an operational importer.

GPs, health centres and emergency departments are separate categories and require their own verified datasets or service-directory adapters. This investigation does not certify a reusable current national GP/primary-care/emergency-service feed. Ranking can safely show recorded hospital proximity with source age; specialist/emergency requirements remain unknown until independently enriched.

## SmartDublin fallback findings

The [South Dublin childcare catalogue](https://data.smartdublin.ie/dataset/preschool-childcare1) explicitly declares CC0 and offers a public feature service, plus CSV/GeoJSON/shapefile/KML. Both catalogue and layer date point to October 2018. A sample valid WGS84 point named a crèche in Dublin 12. This is local, historical community GIS and does not prove current Tusla registration. [Feature schema](https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Community_EducationEnterprise_FS_Hosted/FeatureServer/2?f=pjson).

```text
https://services1.arcgis.com/PxbTDTskGHCe4sv6/arcgis/rest/services/Community_EducationEnterprise_FS_Hosted/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=1&f=geojson
https://data-sdublincoco.opendata.arcgis.com/api/download/v1/items/4f6849dad174400caa576f7fa0b14ae1/geojson?layers=2
```

The first endpoint was sampled; the catalogue lists the second export URL, but the export itself was not downloaded. [Schools in Dublin Region](https://data.smartdublin.ie/dataset/schools-in-dublin-region) is CC BY and contains 2019/20 primary, special and post-primary resources. Its catalogue labels resources CSV even where URLs/mime types are XLSX: inspect file contents, not format labels, when importing. It cannot meet national coverage.

## Import and ranking consequences

Recommended normalized records retain `source`, source item/resource URL, source facility ID, category/subcategory, name, normalized geometry, address, observation date if provided, technical data-edit date, retrieval date, license, geography coverage and a reviewed suitability status. Separate source IDs from canonical deduplicated IDs. Geographic filters should use actual boundaries, especially where Dublin City Council differs from the wider Dublin county/region.

School questionnaire inputs can specify primary/post-primary, junior/senior where relevant, ages, a named school and optional suitability constraints. Named-school proximity is calculable from its point; admission/catchment entitlement is not. Childcare age matching needs regulatory age/service enrichment; until then show general childcare proximity, not a false baby-crèche match. Hospital requirements should distinguish general proximity from verified acute/emergency/maternity service access.

Keep all source licenses and source dates alongside the scoring output. No capacity or quality bonus is justified by raw enrolment, registered maximum capacity, scheme participation, or the presence of a point. Unknown evidence is distinct from evidence of absence. Do not infer neighbourhood desirability from public housing or deprivation.

## Verified and remaining gates

Verified: public feature-service item/schema JSON; separate record-count queries; school distinct categories/year; small GeoJSON samples with tested server reprojection; explicit license text for Pobal, HSE/GeoHive, historical school fallback and South Dublin catalogue. No credentials were required for those queries.

Unproven: full paginated snapshot integrity; current national schools reuse scope; primary dataset provenance for the very old licensed school mirror; current openings/closures and entrances; national childcare completeness versus regulator; provider age/vacancy suitability; cross-source joins; current hospital service capabilities; refresh commitments; GP/primary-care coverage; Northern Ireland. Current school collection pages and legacy school downloads returning 403 are specific access evidence, not proof that the underlying datasets are unavailable to every user.

Next data decision: obtain explicit current-school reuse terms and a fresh attributable snapshot, then validate a national import with unique-ID counts and sampled positions. Pobal points can proceed with attribution; hospital and historical school demonstrations must prominently show their source years.
