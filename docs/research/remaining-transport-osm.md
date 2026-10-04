# Offline OSM and GTFS completion

The frozen 396 MB Geofabrik Ireland-and-Northern-Ireland PBF is now processed by an actual offline extractor. No system OSM tools were installed. PyOsmium 4.3.1 was installed from a 1.3 MB macOS ARM binary wheel in an isolated `/private/tmp/ireland-osm-venv` environment, along with its small requests dependencies. `scripts/extract-osm.py` streams the source with a temporary disk-backed node-location cache and libosmium area assembly. The original PBF remains unchanged.

The bounded map view selects public-interest tags and strategic road/cycle geometry. It preserves OSM primitive type/ID, version, edit timestamp, source locator and original geometry: Point for nodes, LineString for networks and open ways, and MultiPolygon with inner rings for assembled areas. It never replaces a way or relation with a guessed centroid. Edit timestamps remain distinct from the Geofabrik extract cutoff of **2026-10-03T20:20:50Z**. Street/contact/person tags outside the public field allowlist are omitted.

| Category | Accepted candidate records |
| --- | ---: |
| Shops | 32,266 |
| Community centres | 2,279 |
| Parks | 3,563 |
| Green areas | 53,670 |
| Strategic road segments | 75,484 |
| Explicit cycleway/path segments | 15,253 |
| **Total** | **182,515** |

Five selected primitives are quarantined: four selected areas could not be assembled from their referenced source members, and one relation geometry extends beyond the schema's Ireland coordinate bounds. Source coverage remains partial and includes Northern Ireland. Shop presence does not verify current operations; a forest or garden does not imply unrestricted public access. Local roads are deliberately outside the bounded strategic-road scope. Cycle geometry is selected by `highway=cycleway` or a path/track with `bicycle=designated`; it does not establish a safe, connected routing graph. Overlaps with official park/community layers preserve separate source identities and are not added into a score.

Independent validation before publication:

- All **182,515** accepted candidate geometries passed read-only PostGIS `ST_IsValid` and `ST_IsEmpty` checks; none required geometry repair.
- A second original-PBF scan confirmed all **182,520** unique selected primitive type/ID/version locators. `--verify-locators records.ndjson` rechecks required IDs directly against the original PBF without trusting a derived ID cache.
- Three tests verify public-field suppression, stable primitive IDs and edit versions, retained polygon holes, cycleway line geometry and a deliberately wrong relation-version rejection. The integration fixture runs actual libosmium area assembly.

The derived preview contains approximately 104 MB NDJSON. The final canonical bundle is **209 MB**, with 182,520 inputs, 182,515 accepted records and five quarantines. Its snapshot is `e97730c88a0f2e9b4ea7d43f29ce0ede38f90f9607a82d56c6084506c23e55bc`; final canonical locator verification independently confirmed **182,515 of 182,515** required type/ID/version combinations. Root publishes the global index and database import separately. The source licence is [OpenStreetMap ODbL](https://www.openstreetmap.org/copyright): attribution and applicable derived-database terms remain recorded in the manifest. [PyOsmium's geometry documentation](https://docs.osmcode.org/pyosmium/latest/user_manual/03-Working-with-Geometries/) describes node-location storage and full area assembly.

To repeat extraction after temporary environments are removed:

```sh
python3 -m venv /private/tmp/ireland-osm-venv
/private/tmp/ireland-osm-venv/bin/python -m pip install --only-binary=:all: osmium==4.3.1
OSM_PYTHON=/private/tmp/ireland-osm-venv/bin/python bun run data:normalize --sources osm-public-services-and-strategic-networks
```

The parser also uses `OSM_PYTHON` for the interpreter path. API serving does not depend on Python; Python is used only by this offline extraction and original-PBF import verification.

The remaining GTFS ZIP contains **871,521,603 uncompressed bytes**, including approximately 443 MB `stop_times.txt` and 404 MB `shapes.txt`. Flattening these into common map points would destroy trip/calendar meaning. Faithful future ingestion needs source-versioned child tables for `feed_info`, `agency`, `stops`, `routes`, `trips`, `calendar`, `calendar_dates`, `stop_times` and `shapes`, retaining original IDs and validating foreign keys. Services may use either weekly calendars or date exceptions; stop times can extend beyond 24:00 and need GTFS time semantics. Do not infer running frequency from the feed date range or match GTFS and NaPTAN identifiers by name. NaPTAN's active-stop directory is already in the common schema, while scheduled travel-time/frequency calculation remains deferred until this relational model and a routing engine are implemented. No timed or suitability ranking is enabled by these display layers. These calendar and service-day requirements follow the [official GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/).
