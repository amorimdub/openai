# Which transport, boundary, and address sources make the map feasible?

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: transport_location_research
Parent: ../map.md
Blocked by:

## Question

Which official Irish open sources support nationwide public transport stops and schedules, administrative/census boundaries, and town/city selection (with optional home/work anchors)? Verify static GTFS versus realtime access, download/API/resource URLs, formats, coordinates, license/access gates and offline feasibility. Check geocoding/Eircode constraints and identify a low-risk demo input fallback. Distinguish stop proximity from frequency and travel time. Recommend sources and expose gaps.

## Answer

Use national offline NTA stops/schedules and the 867 CSO/Tailte 2022 urban areas for town-first selection; map pins support rural places and optional home/work anchors. National stop JSON and complete town GeoJSON were fetched and parsed; full national GTFS has HTTP availability proof, with LUAS schema/calendar parsing as the sample. Real-time access and precise Eircode lookup have separate gates.

Findings: [Ireland transport, places and location research](../../../docs/research/ireland-transport-location.md).
