# Property Price Register normalization

Observed and implemented 4 October 2026. `src/common/adapters/transactions.ts` exports `transactionAdapters`, including `property-transactions`, and an incremental logical CSV-row generator. Five tests and 18 assertions pass; TypeScript checking passes. Full offline scanning of the frozen ZIP accepts all **809,014** sale-register rows with **zero quarantines**; the header is one explicit exclusion, so input accounting is 809,015 logical rows. Database import and live API verification remain separate integration checks.

The [official bulk ZIP](https://www.propertypriceregister.ie/website/npsra/ppr/npsra-ppr.nsf/Downloads/PPR-ALL.zip/$FILE/PPR-ALL.zip) is preserved in `data/raw/ppr/2026-10-04/PPR-ALL.zip`. It contains one `PPR-ALL.csv` member of 110,734,515 bytes, decoded as Windows-1252. The parser processes rows incrementally without creating an array of 809,014 transactions. Its ZIP bytes and decompressed CSV remain memory resident; estimated canonical output is approximately **1.08 GB**, based on the first 1,000 records. Streaming file writing and indexed database import are required for the complete release.

| Observed source property | Count or range |
| --- | ---: |
| Accepted sale-register rows | 809,014 |
| Earliest/latest sale date | 2010-01-01 / 2026-09-25 |
| Non-full-market flag is Yes | 41,209 |
| VAT-exclusive flag is Yes | 142,598 |
| Nonempty source Eircode | 251,675 |
| Excluded header | 1 |

The common kind is `property_transaction`, category `property_transactions`. Each record retains original price in EUR, sale date, address, county, optional source Eircode, non-full-market and VAT-exclusive flags, dwelling-description and optional categorical size-description. Prices are not converted to gross/net values; “house /Apartment” descriptions do not become a house/apartment classification, and categorical size descriptions do not become exact square metres. Calendar dates are checked for impossible day/month combinations. Unexpected monetary syntax, flags or field cardinality are quarantined with raw locators.

Geographic identity remains the original county label under `PSRA:county-label`. Geometry is null, observation status is unlocated, and no town join or geocoding is inferred. The record's raw locator is `zip:PPR-ALL.csv/csv:N`, where N is the logical CSV row including header row zero; quoted embedded newlines do not change row indexing. Identity includes the raw ZIP SHA256, member name and logical row, so similar-looking source rows are preserved separately and revised future downloads get new identities. The label identifies the register row, county and date; it does not infer owners or occupants.

Example query after import: `/context?categories=property_transactions&geographyCode=Dublin&geographyCodeSystem=PSRA%3Acounty-label&limit=10`. This returns original register information. `/market-context` continues to return published CSO/RTB aggregates, keeping transactions separate from means/medians.

[PSRA's register information](https://www.propertypriceregister.ie/website/npsra/ppr-home-en.html) identifies VAT differences, combined apartment transactions and source filing errors. A register row does not necessarily identify one dwelling, and these transactions cannot become available listings, exact bedrooms or current affordability evidence. No aggregate is derived from this dataset here.

The licence is `custom-reuse` with source/copyright attribution. [PSRA's reuse policy](https://www.psr.ie/re-use-of-public-sector-information/) permits free reuse subject to accurate, acknowledged and nonmisleading reproduction, including restrictions on principally promotional use; this is not relabelled CC BY. The exact saved policy HTML and ZIP provenance participate in manifest asset hashing. No owner names or contact details are generated or collected by this adapter.
