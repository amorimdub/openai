# Which map renderer and basemap are easiest for the Ireland service layers?

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: map_stack_research
Parent: ../map.md
Blocked by:

## Question

Compare Leaflet, MapLibre GL JS and OpenLayers using current official documentation for a Hono/Bun backend returning common-schema GeoJSON. Evaluate hackathon implementation effort, points/polygons/lines, selected criteria layers, marker clustering, large national datasets, browser payload bounds, vector tiles, basemap licences/providers/keys, OSM public tile restrictions, offline needs and future growth. Return an evidence-backed recommendation and practical initial map/API contract. Research only; no frontend or data transformation.

## Answer

Leaflet has the smallest bounded town-and-services demo setup. Recommend MapLibre GL JS for the all-Ireland application: built-in GeoJSON point clustering, source/layer styling and direct vector-tile growth. All three accept renderer-independent GeoJSON, so the common schema and database can be defined separately. Existing POST /layers emits per-criterion FeatureCollections but scans all records, uses a radius and caps each layer at 1,000; viewport queries/spatial indexing/tiles are next-stage work. OSM public raster tiles prohibit offline/prefetch downloads, and the saved OSM PBF is raw data rather than a basemap. Basemap hosting/terms/attribution require a separate choice.

Evidence and proposed contract: [Map renderer options](../../../docs/research/map-renderer-options.md). No frontend, parser, database or provider-account changes made.
