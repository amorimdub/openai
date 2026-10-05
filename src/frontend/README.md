# Find your place — React frontend

React + Vite implementation of the `codex/prototype-home` visual flow, using the live Hono/PostGIS API. Original `src/home-prototype` files remain intact. The original green palette, fonts, profile prompts, service sidebar, region cards, five pillar details and small Leaflet map are retained. Fictional scores, homes and service points are replaced with source evidence and explicit unknown states.

```sh
cd src/frontend
bun install --frozen-lockfile
bun run dev
```

Open `http://127.0.0.1:5173`. The Vite `/api` proxy targets the native macOS Hono container at `http://127.0.0.1:3080`. No frontend CORS exception is needed for local development. `bun run build`, `bun run typecheck` and `bun run test` validate this separate package; root package scripts can delegate to it.

The onboarding follows `codex/prototype-home` at `abc13ad`: choose anywhere that fits or a specific region, household size, one optional age per person, bedrooms, rent/buy, an optional budget, main transport, and car access (skipped for driving). Each question has its own screen, with Back preserving answers. “Save profile” explicitly saves the household and initial search defaults in this browser (`find-your-place.profile.v1`), then opens full-screen service selection. Saved households restore on reload; service priorities remain in memory. “Start again” preserves the previous saved profile until an explicit replacement save. The top-right profile stays fixed while criteria change and offers “Edit saved profile”.

Anywhere searches list all recorded CSO urban areas, without claiming they match the household. Choose a region to open its live evidence and small map. Specific-region searches go directly to that area’s evidence. Map tiles are never requested during onboarding, priority selection, or the anywhere region list. The search radius remains editable alongside dashboard priorities. Select any number of registry criteria with required/preferred importance. Results use `/places`, `/place-anchor`, `/criteria`, `/data-status`, `/layers`, `/assess` and `/features`. The town anchor uses the backend's point-on-surface when available; its fallback is visibly labelled as a source-town boundary anchor. Click the detail map to choose your own point, then update evidence. Distances remain recorded geometry distances, not routed travel times or entrance distances.

Market-region selection uses `/market-geographies` and explicitly chosen publisher codes with `/market-context`; the UI does not infer a town crosswalk. Historical records are unfiltered bedroom context and are never displayed as home listings. Household defaults persist locally after explicit saving; service choices remain in memory for the visit. The backend receives selected criteria and relevant requested parameters and does not save them. Scores, eligibility, available properties and utility connection status remain unknown.

Map tiles come from the standard OpenStreetMap tile endpoint for ordinary interactive use; visible attribution is retained. Offline source layers continue to load even if external base tiles are unavailable. The live map shows source points, lines and polygons; it does not draw fabricated heatmaps or routes.

## Native macOS container demo

From the repository root, start the database and API, then run `bun run containers:frontend`. Open **http://127.0.0.1:5173**. The multi-stage image builds production React assets and serves them with Bun, proxying `/api` to the private API container. No Vite process is required. Recreate the frontend after recreating the API; its startup script discovers the current API address. The three host ports remain loopback-only.
