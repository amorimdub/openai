# Catalogue access, offline imports, and nationwide gaps

Observed: 4 October 2026. This is research and a proposed approach, not an implemented importer or API.

## Smart Dublin can be imported without a live browser

The live DCC CKAN query returned `success: true`, 159 datasets and 1,250 resources. The snapshot records resource URLs, formats, license labels and modification metadata; it is a catalogue inventory, not a download of all underlying data. Of those resources, 544 report `datastore_active: true`; 706 report false. Source: [live catalogue query](https://data.smartdublin.ie/api/3/action/package_search?q=organization:dublin-city-council&rows=200), [saved evidence](evidence/smartdublin-dcc-catalogue-2026-10-04.json).

Use `package_search` for discovery, `package_show?id=<dataset>` for resource metadata, and the resource URL for a CSV/GeoJSON download. `datastore_search` is a separate option for enabled tabular resources. Check both HTTP status and CKAN's `success` field, and paginate rather than trusting defaults. [CKAN API guide](https://docs.ckan.org/en/2.11/api/).

A live community-centres DataStore request returned 99 records, with name, description, address, latitude/longitude and area identifiers. One sample row had sensible Dublin coordinates. This proves that specific API works; it does not certify every record or other resources. [Live sample](https://data.smartdublin.ie/api/3/action/datastore_search?resource_id=39f01fec-c3e7-4aa4-af67-e5b867b84729&limit=1), [saved evidence](evidence/dcc-community-datastore-sample.json).

## OpenStreetMap is a possible nationwide supplement

Geofabrik publishes an Ireland-and-Northern-Ireland extract in PBF, shapefile and GeoPackage formats. The extract crosses the Republic boundary; clip it if the product targets the Republic. Resource sizes and freshness shown by search caches are not trusted as live measurements; the full extract was not downloaded or schema-audited during this research. [Publisher download page](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html).

Relevant tags are `amenity=community_centre`, `leisure=park`, and optionally `leisure=playground`. Features can be nodes or areas. Preserve original geometry and distinguish public access from private/restricted access; a tag match alone is not assurance that a place is accessible or current. [Community-centre definition](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dcommunity_centre), [park definition](https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dpark).

OSM is community-maintained rather than a complete government register. Treat it as a separate source with unknown completeness; investigate overlap with council datasets before counting facilities twice. The dataset is ODbL, with attribution and sharing obligations that need to remain visible in distribution decisions; source separation does not automatically settle licensing of a combined or derived database. [OSM licensing](https://www.openstreetmap.org/copyright).

Prefer a local settlement index for town/city autocomplete. Public Nominatim disallows autocomplete and systematic POI extraction and limits total application traffic to one request per second. Use a deliberately selected provider or self-hosted geocoder if address lookup is needed. Offline feature data also does not make the basemap offline; tile hosting is a separate choice, and bulk tile prefetch from the public OSM raster service is prohibited. [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/), [tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Proposed import acceptance checklist

These are recommendations for the later implementation decision:

- Capture publisher, stable source/resource ID, exact URL, reuse license/attribution, retrieval date, publisher modification date, content hash and known observation period.
- Keep raw snapshots separate from normalized features. Preserve source IDs, housing stages, school levels and facility types.
- Normalize geometry into WGS84 GeoJSON with longitude first. Request `outSR=4326` when supported; transform EPSG:2157 otherwise. Validate Ireland bounds and sample landmarks. Quarantine axis errors instead of silently repairing all rows with a global swap.
- Page ArcGIS feature services and test for transfer-limit truncation. Namespace GTFS IDs by feed and avoid combining all-operator and individual feeds twice.
- Record coverage by category and geography as unknown, partial, or accepted for a particular release. Geographic scope alone is not evidence of completeness. A failed import must not be interpreted as zero facilities.
- Publish a reviewed snapshot atomically; keep the last accepted version if refresh validation fails. Serve locally from that snapshot during the demo.

## Pain points the product must express

1. Families currently have to compare multiple service registers and maps with incompatible definitions and update cycles.
2. Finding a nearby facility does not establish school admissions, childcare vacancies, hospital specialty access, timetable usefulness or service quality.
3. Urban areas may have more mapped amenities; raw counts and variable-size neighbourhoods can reward size or better mapping instead of household fit.
4. Room needs require actual dwelling data. An amenity dataset or construction pipeline cannot confirm an available home or government-scheme eligibility.
5. Unknown and stale data must stay visible in the explanation. A confident-looking overall rank can conceal missing categories.

These are product hypotheses inferred from the source constraints, not user-interview findings.
