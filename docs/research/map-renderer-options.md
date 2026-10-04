# Map renderer and basemap options for the Ireland service map

Researched 4 October 2026 against official documentation. Research only: no frontend, parser or database changes. Ease-of-implementation ratings and recommendations below are engineering judgments, not measured benchmarks.

## Recommendation

**Choose MapLibre GL JS for the all-Ireland application, starting with bounded GeoJSON layers.** It provides built-in point clustering and accepts vector tiles later, so we can keep one renderer as datasets grow. Its TypeScript/WebGL architecture fits a browser map with distinct service categories and area overlays. [MapLibre introduction](https://maplibre.org/maplibre-gl-js/docs/), [cluster example](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/), [source specification](https://maplibre.org/maplibre-style-spec/sources/).

**Leaflet is the easiest choice for a short hackathon demo** showing one selected town and modest service layers. Choose it if delivery time dominates and the team already knows it. The common API contract can support either renderer; choosing Leaflet does not require a different data model. Its simple GeoJSON interface and layer control reduce initial wiring. [Leaflet GeoJSON tutorial](https://leafletjs.com/examples/geojson/), [API reference](https://leafletjs.com/reference.html).

The concrete tradeoff: Leaflet can add an overlay with `L.geoJSON(...)` and put it in a built-in layer control. MapLibre requires a GeoJSON source and separate rendering layers—for example clustered circles, cluster-count labels and unclustered points—plus application controls. That extra initial wiring buys built-in clustering and a later switch from GeoJSON to tiled sources without adopting a vector-tile plugin. For the stated nationwide scope, this report keeps **MapLibre as the single recommended default**, with Leaflet as the deadline fallback. [Leaflet reference](https://leafletjs.com/reference.html), [MapLibre cluster example](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/), [MapLibre source specification](https://maplibre.org/maplibre-style-spec/sources/).

OpenLayers becomes attractive if the product needs extensive GIS interaction, multiple map projections or direct specialist geospatial formats. Those needs are not central to the current user journey. [OpenLayers quick start](https://openlayers.org/doc/quickstart.html), [projection FAQ](https://openlayers.org/doc/faq.html).

## Comparison

| Need | Leaflet | MapLibre GL JS | OpenLayers |
| --- | --- | --- | --- |
| First town-and-services demo | Lowest initial effort: raster basemap + `L.geoJSON` | Moderate: style, sources and rendering layers | Moderate: map, view, source, layer and styles |
| GeoJSON points, lines, polygons | Core GeoJSON support, style callbacks and popups | GeoJSON source plus circle/symbol, line and fill layers | GeoJSON reader plus vector layers |
| Criteria visibility | Built-in overlay control or custom checkbox state | Application controls layer visibility/filter state | Application controls layer visibility/style state |
| Point clustering | `Leaflet.markercluster` plugin | Built into GeoJSON sources | `ol/source/Cluster` |
| Nationally dense layers | Bound queries; prefer canvas paths/circle markers; plugins for tiled vector data | Bound queries initially; direct vector-tile source path | Bound vector loading and native vector-tile layers |
| Primary complexity | Managing plugins and many feature objects | WebGL support, style resources and source/layer distinction | More explicit GIS/projection configuration |
| Best fit here | Fast local-area demo | Recommended all-Ireland product | Specialist GIS requirements |

Capability evidence: [Leaflet reference](https://leafletjs.com/reference.html), [Leaflet clustering repository](https://github.com/Leaflet/Leaflet.markercluster), [MapLibre cluster example](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/), [MapLibre source specification](https://maplibre.org/maplibre-style-spec/sources/), [OpenLayers cluster example](https://openlayers.org/en/latest/examples/cluster.html), [OpenLayers vector-tile example](https://openlayers.org/en/latest/examples/vector-tile-info.html), [OpenLayers GeoJSON API](https://openlayers.org/en/latest/apidoc/module-ol_format_GeoJSON-GeoJSON.html).

Clustering reduces visual crowding; it does not remove the cost of downloading and processing an entire national dataset. MapLibre recommends reducing unused properties, simplifying display geometry, splitting large GeoJSON payloads and considering vector tiles. Therefore **none of these libraries should receive every raw national dataset at startup**. [MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).

## Keep four choices separate

1. **Domain schema:** service, place, utility area, housing information and market context, with source/provenance and quality fields.
2. **Database:** stores/query indexes for those records; SQLite and PostgreSQL can both feed GeoJSON.
3. **Renderer:** Leaflet, MapLibre or OpenLayers displays the returned features.
4. **Basemap:** streets, labels and geographic context supplied as raster/vector tiles, with separate licences and hosting.

Use GeoJSON FeatureCollections at the map boundary with WGS84 longitude/latitude order and stable feature IDs. Reproject Irish Grid, ITM and Web Mercator source data during later parsing; never label native metres as longitude/latitude. GeoJSON allows null geometry, but unlocated records belong in an information panel rather than a plotted marker. [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946).

The original raw file remains immutable evidence. A normalized record can point back to its source snapshot and original record identifier. Market tables without coordinates should join a verified area identifier, rather than inventing a property location. A water-source protection polygon should retain its meaning instead of becoming a domestic-service coverage polygon. These are proposed domain decisions for review, independent of renderer.

## Existing API compatibility and gaps

Source inspection on 4 October: [app](../../src/app.ts), [schema](../../src/schema.ts), [engine](../../src/engine.ts). This section describes implementation, not a fresh live-server verification.

- `GET /places?q=...` already searches imported place names, capped at 100. It is an in-memory substring filter; it is not address geocoding or general service search.
- `POST /layers` already accepts an open-ended list of distinct criteria and returns a GeoJSON FeatureCollection for each selected criterion, plus source metadata and nonspatial context. This output works with all three renderer choices.
- Current selection uses a location and radius, scans records and caps each layer at 1,000 features with a `truncated` flag. There is no viewport query, cursor paging, vector-tile endpoint or database spatial index in that engine.
- `POST /assess` is a separate evidence/scoring operation. Selecting or rendering a layer must not imply that a health travel time, property utility connection, housing availability or score has been established.

## Proposed map/API contract for the next stage

Keep `/criteria`, `/places` and `/data-status`; preserve `/assess` as the assessment contract. Extend `/layers` or introduce a versioned feature query accepting **bbox, zoom and criterion IDs**, with optional place/anchor information. The browser obtains bounds on pan/zoom and fetches selected layers only. These are proposed changes, not existing endpoints.

Return per-layer `id`, `vertical`, `FeatureCollection`, source attribution, snapshot/period, coverage status, returned count and explicit truncation/paging state. Put small flattened map properties on each feature—stable ID, name, category and evidence/source key—and load full detail on demand. Multiple criteria mapping to the same dataset should reuse a source/feature ID rather than duplicating markers.

Use spatially indexed bbox intersection for display. A large polygon intersecting the viewport must be included even when its centroid is outside it. Use simplified geometry for display only; assessments use suitable original geometry and an explicit metric. At wide national zoom levels return aggregates or tiles instead of silently dropping most features. Caps are an operational starting point to benchmark with our actual data, not a claim that 1,000 complex polygons are inexpensive. [MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).

Future rendering endpoint: an MVT tile route such as `/tiles/{layer}/{z}/{x}/{y}.pbf`, or published read-only PMTiles snapshots. Keep full records and scoring evidence separately. MapLibre's vector source requires tile source-layer names; PMTiles is an archive format, not the editable service database. [MapLibre sources](https://maplibre.org/maplibre-style-spec/sources/), [PMTiles concepts](https://docs.protomaps.com/pmtiles/).

## Basemap options and offline meaning

| Basemap option | Setup | Suitable use |
| --- | --- | --- |
| OSM public raster tiles | No provider account; valid requests and visible attribution required | Modest interactive online demo; best-effort service |
| Hosted provider such as MapTiler | Account/API key, provider plan/terms, supplied style and attribution | Easiest detailed hosted basemap for a MapLibre application |
| Self-hosted licensed regional tiles/PMTiles | Prepare or obtain tiles, configure hosting, styles, fonts/sprites and attribution | Predictable regional/offline basemap when required |

OSM's public raster policy permits normal viewport viewing but prohibits bulk download, pre-seeding and offline tile archives. It requires visible attribution, valid browser referrers and honoring caching headers; there is no service guarantee. **Do not use it to download an Ireland offline map.** [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).

MapTiler documents direct MapLibre integration using a style URL and API key, and origin restrictions for browser keys. A key does not make map content open or unrestricted; its hosting terms and attribution still apply. Select a plan only when the team defines expected usage; no paid account or key was created during this research. [MapTiler integration](https://docs.maptiler.com/maplibre/), [key restrictions](https://docs.maptiler.com/guides/credentials/api-key/), [map attribution](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/), [cloud terms](https://www.maptiler.com/terms/cloud/).

PMTiles stores a tile pyramid in one read-only archive and reads needed tiles using HTTP Range requests. A locally hosted archive can support an offline environment if the tile data, styles, fonts, sprites and application assets are also available locally. Its source-data licence and attribution remain applicable. [PMTiles concepts](https://docs.protomaps.com/pmtiles/).

The downloaded `.osm.pbf` is original OSM geographic data, **not an MVT tile archive or styled basemap**. It may feed later POI extraction, network processing or tile generation. Offline service-data ingestion and offline map rendering are separate requirements.

## Decision to define before implementation

Recommended default: **MapLibre + bounded GeoJSON service layers + configurable hosted basemap**, with SQLite/PostgreSQL chosen independently. Leaflet remains a reasonable time-limited demo alternative. Define the common records and viewport API first; then implement a small representative parsing batch with points, lines, polygons and a nonspatial market table before scaling the whole collection. Do not install a frontend map or choose a paid tile provider during this research stage.
