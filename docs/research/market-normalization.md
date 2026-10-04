# Market normalization implementation

Observed and locally verified 4 October 2026. `src/common/adapters/market.ts` provides four offline JSON-stat adapters to the common-schema runner. Adapter tests passed (six tests, 26 assertions); TypeScript checking passed. Counts below came from complete generator scans of the frozen raw cubes. Database import and live API checks are separate root integration steps.

| Adapter | Input cells | Accepted observations | Excluded cells | Quarantined |
| --- | ---: | ---: | ---: | ---: |
| `rtb-rent` / RIQ02 | 1,367,436 | 376,988 | 990,448 | 0 |
| `purchase-hpm02` | 2,321,136 | 10,746 | 2,310,390 | 0 |
| `purchase-hpm07` | 379,008 | 15,792 | 363,216 | 0 |
| `purchase-hpm08` | 1,263,360 | 52,640 | 1,210,720 | 0 |

The new adapters expose **456,166** monetary observations. They preserve immutable raw assets and `value/N` locators. Stable identities include source, scope and every original dimension code, including the statistic. Dimension labels, table identity, periods and source values are retained. No prices are averaged and no geography is joined to a town by name.

## Renting

[RIQ02](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en) contains 73 quarters from 2007Q4 to 2025Q4, seven bedroom classes, six property classes and 446 location codes. Its [specific catalogue metadata](https://data.gov.ie/api/3/action/package_show?id=riq02-rtb-average-monthly-rent-report) establishes CC BY 4.0 for this resource; the successful metadata body is retained at `data/raw/rtb-cso/2026-10-04/license-evidence.json`. This permission is scoped to RIQ02, and does not imply permission for other RTB reports or workbooks.

Every nonmissing RIQ02 observation is represented as a published arithmetic mean in EUR/month. The source is titled “RTB Average Monthly Rent Report”; it is not relabelled as a standardised rent index or an advertised rent. `bedroomClass` keeps the original codes: `01`, `02`, `03` populate exact numeric bedrooms; `-`, `06`, `07`, `08` keep numeric bedrooms null. The ranges “1 to 2 bed”, “1 to 3 bed” and “Four plus bed” cannot satisfy an exact four-bedroom query. Detached/semi-detached/terraced retain their original type dimensions and share common `house`; apartments map to `apartment`; “Other flats” maps to `unknown` with the original label preserved.

The frozen cube has **990,448 null cells, zero numeric-zero cells and no JSON-stat status flags**. Nulls are excluded with `source_missing_no_published_observation`, and manifest counts account for all of them. API absence therefore means unknown, not free rent or unaffordability. A future numeric zero remains a record with null amount and `source_zero_unverified`; recognised suppression flags also retain null amounts and their original status in dimensions. Unsupported status flags quarantine explicitly. RTB's [dataset page](https://rtb.ie/data-insights/rtb-data-hub/rtb-esri-rent-index-data-set/) explains that displayed zero values indicate insufficient data.

Demo query after import: `/market-context?geographyCode=120500&geographyCodeSystem=CSO_RIQ02_C03004V03625&tenure=rent&period=2025Q4&propertyType=apartment&bedrooms=2`. The original two-bedroom apartment observation for Dublin is **€2,283.59/month**, with no published sample size in this cube. This is historical context, not a current listing or a guarantee.

## Buying

[HPM02](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM02/JSON-stat/2.0/en) retains monthly mean/median cells for household buyers, market sales, executions and all dwelling statuses. A published Volume of Sales cell with identical other dimensions supplies `sampleSize`; total Value of Sales is not treated as a property price. [HPM07](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM07/JSON-stat/2.0/en) and [HPM08](https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/HPM08/JSON-stat/2.0/en) retain the publisher's moving 12-month mean/median for all household buyer types, executions and all dwelling statuses. Their period identifies the window-ending month; these statistics are never manufactured by averaging monthly means or medians. CSO's [copyright policy](https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/) supplies the licence evidence retained with the source.

All codes and labels of excluded buyer/status/event/sale cells remain in the original cube. Exclusion counters are ordered and exhaustive: first outside dwelling status, then event, then buyer, then sale type, then nonprice statistic. Counts are not overlapping.

| Cube | Exclusion reason | Cells |
| --- | --- | ---: |
| HPM02 | Other dwelling statuses | 1,547,424 |
| HPM02 | Other stamp-duty event | 386,856 |
| HPM02 | Other buyer types | 322,380 |
| HPM02 | Other sale types | 42,984 |
| HPM02 | Volume retained only as sample size | 5,373 |
| HPM02 | Value of Sales is not a price | 5,373 |
| HPM07 | Other dwelling statuses | 252,672 |
| HPM07 | Other stamp-duty event | 63,168 |
| HPM07 | Other buyer types | 47,376 |
| HPM08 | Other dwelling statuses | 842,240 |
| HPM08 | Other stamp-duty event | 210,560 |
| HPM08 | Other buyer types | 157,920 |

There are no missing cells in these selected buying scopes. Geographic code systems are `CSO_HPM02_C02339V02812`, `CSO_HPM07_C03348V04035` and `CSO_HPM08_C03349V04063`. Original county/RPPI/Eircode output regions remain separate. Purchase observations have no bedroom classification; HPM02/07/08 observations cover all dwelling types. Existing HPM05 remains the house/apartment-specific monthly adapter.

## Property Price Register: separate transaction model

The frozen PPR ZIP has a Windows-1252 CSV with date of sale, address, county, Eircode, price, non-full-market flag, VAT-exclusive flag, description and categorical property-size description. It has no coordinates, exact bedrooms or publisher transaction identifier. PPR rows cannot enter `market_context`, whose statistic means a published aggregate. Its [publisher information](https://www.propertypriceregister.ie/website/npsra/ppr-home-en.html) describes combined/bundled transactions and tax differences; a row is not necessarily one uniquely identified home.

PPR now has a distinct `property_transaction` adapter; see [PPR normalization](ppr-normalization.md). It retains reported price/date, original market/VAT flags, county, descriptions and source address/Eircode with null geometry. Identity includes frozen ZIP hash, member name and source row so repeated/corrected rows are not silently deduplicated. Address/Eircode remain outside the aggregate market-context response. A separate explicitly labelled statistical process would be needed to derive any purchase summary, with documented market, VAT, bundle and revision rules. None is invented here.

[PSRA's reuse policy](https://www.psr.ie/re-use-of-public-sector-information/) permits free reuse subject to attribution, accurate reproduction and limits on misleading/promotional use; it is a custom reuse policy, not verified CC BY. Its distinct transaction adapter is implemented, with database import verified separately during root integration. The buying market-context adapters serve the original CSO summaries, while the RIQ02 raw group is parsed fully for all published nonmissing categories. The CSO raw group is partially parsed because other buyer/status/event breakdowns are deliberately excluded. Newer RTB report/XLSX permissions remain a separate gate.
