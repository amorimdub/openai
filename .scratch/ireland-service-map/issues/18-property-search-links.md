# Can selected areas and housing filters open Irish property websites directly?

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: property_search_research
Parent: ../map.md
Blocked by:

## Question

Can the existing Ireland location prototype pass a selected area, rent/buy, minimum bedrooms and the corresponding optional euro budget to MyHome.ie, Daft.ie and another Irish property-search website through an ordinary outbound search URL? Verify current public URL/filter behavior, supported and unsupported geography/criteria, rent units, persistence on direct navigation, and relevant first-party terms. No listing collection, private APIs, accounts or application implementation. Distinguish technical feasibility from contractual permission and observed UI behavior from inferred URL syntax.

Research asset: `docs/research/ireland-property-search-links.md`.

## Context

The user explicitly requests pre-filtered links to view homes on the external website rather than fetching its listing data. Existing prototype state has `scope`, `placeId`, `location`, minimum `bedrooms`, `tenure`, and `budgets.rent` (monthly euros) / `budgets.buy` (total euros). CSO urban geometries do not establish the providers' search boundaries or IDs. The primary provider name is awaiting clarification; research both MyHome and Daft independently of that answer.

## Answer

Checked 4 October 2026 using first-party terms and ordinary public browser controls. Daft and Property.ie sale/rental links preserve selected area, minimum bedrooms and maximum budget after reload; Daft rental links also passed direct new-tab navigation. MyHome sale links passed direct navigation and rental links passed reload, but its terms section 11 restrict links to its homepage. Recommend Daft as the initial filtered destination, Property.ie as an alternative under the same terms umbrella, and MyHome homepage-only unless permission is established. Daft/Property linking permission has conditions, including no implied affiliation, no framing and no links established to directly compete and redirect traffic; this research is not legal approval of a commercial product.

Evidence, captured URLs, supported units and unverified cases: [Irish property search links](../../../docs/research/ireland-property-search-links.md). No inventory was collected or saved and no application source changed. Follow-on human decision: [How should assessed areas map to external property searches?](19-property-search-area-contract.md).
