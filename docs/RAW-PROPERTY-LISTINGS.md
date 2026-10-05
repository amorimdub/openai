# Raw property listing snapshots

`bun run data:listings` saves public Daft.ie and MyHome.ie property JSON locally. It does not change the frontend, normalize records, load PostGIS, or plot properties. Coordinates supplied by a publisher remain in its original fields for a later stage.

## Commands

Two reusable Bash commands collect nationwide **residential sale and rental listings** from the corresponding provider:

```sh
bash scripts/collect-daft.sh
bash scripts/collect-myhome.sh
```

They also run as `bun run data:listings:daft` and `bun run data:listings:myhome`. The scripts find the repository from their own location, so invoking them by absolute path works from any directory. Bun and repository dependencies must be installed first.

The commands start at each provider's national sale/rental searches, follow every reachable search page and discovered detail page, and save the publisher property JSON. Both use `--all`, which removes collector-imposed caps. This scope covers residential sales and rentals, including sites/developments returned by those searches; it does not cover commercial listings, room sharing, sold archives, account data, or all material on either website. Photo URLs and metadata are saved; image/PDF/video binaries are not downloaded. Provider-imposed pagination limits are recorded and respected; full nationwide coverage remains unverified.

Default outputs are separate dated archives under `data/raw/property-listings/daft/` and `data/raw/property-listings/myhome/`. Run a command again for a new snapshot, or continue an interrupted/bounded snapshot using its printed run directory or manifest path:

```sh
bash scripts/collect-daft.sh --resume /absolute/path/to/previous-daft-run
bash scripts/collect-myhome.sh --resume /absolute/path/to/previous-myhome-run/manifest.json
```

Successful pages are reused after file-size and SHA-256 checks. Failed/unrequested pages are attempted again; previous successful JSON is retained. Resume reconstructs the queue from per-page `requests/<url-sha256>.json` checkpoints, including after an abrupt interruption when the live manifest has only summary progress. A process lock prevents concurrent collectors writing to the same run; stale locks are recovered only when their process is no longer running. Snapshots resumed much later can mix capture times; individual request timestamps remain available. An existing snapshot's seed URLs are retained on resume.

For a small trial, explicitly add limits after the command (these override `--all`):

```sh
bash scripts/collect-daft.sh --max-search-pages 1 --max-listings 2
bash scripts/collect-myhome.sh --max-search-pages 1 --max-listings 2
```

These commands prepare raw data for a future database adapter/import. No database or frontend is changed. They use public pages; an authorized feed can be configured separately if that is the chosen access method. Run them within the scope of your provider authorization.

Install the repository dependencies once:

```sh
bun install --frozen-lockfile
```

Save specific listing detail pages (repeat `--url` to include both providers):

```sh
bun run data:listings --url 'https://www.daft.ie/for-sale/REPLACE-WITH-LISTING-SLUG/REPLACE-WITH-ID'
```

Replace the example with a real URL copied from the provider. MyHome detail URLs have the form `https://www.myhome.ie/residential/brochure/<slug>/<id>` (rentals use their own channel).

Save search cards and fetch their full detail pages from both sources:

```sh
bun run data:listings \
  --url 'https://www.daft.ie/property-for-sale/dublin-city?salePrice_to=500000&numBeds_from=3' \
  --url 'https://www.myhome.ie/residential/dublin/property-for-sale?maxprice=500000&minbeds=3' \
  --max-search-pages 2 \
  --max-listings 80
```

The example's filters are illustrative. Use the provider's own search URL for your selected area and criteria. The default is **one search page per seed and at most 20 discovered detail URLs across the run**. Explicit listing seeds always run. Set `--max-listings 0` to save search cards only; those cards do not contain every detail field. Increase both limits to expand a collection. The command uses publisher pagination and does not infer nationwide completeness.

Keep repeatable inputs in a UTF-8 text file, one full public URL per line, with optional `#` comments:

```sh
bun run data:listings --urls-file /absolute/path/listing-urls.txt --max-search-pages 5 --max-listings 200
```

`--delay-ms` defaults to 1500 and must be at least 1000. Requests are sequential. `--timeout-ms` defaults to 30000. Each invocation creates a fresh timestamp/UUID directory unless `--resume` is provided. There is no recurring scheduler or background service.

For HTML already saved locally from a public page:

```sh
bun run data:listings --url 'https://www.myhome.ie/residential/dublin/property-for-sale' --html /absolute/path/page.html
```

This extracts one file and makes no network requests, including for linked listings or pagination.

## Saved data

The default destination is `data/raw/property-listings/<UTC-timestamp>-<run-id>/`, already ignored by Git. Override it with `--out PATH`. Only JSON output is created:

```text
manifest.json
requests/<url-sha256>.json
daft/00001-<url-hash>-listings.json
daft/00001-<url-hash>-paging.json
daft/00003-<url-hash>-listing.json
myhome/00002-<url-hash>-search-results.json
myhome/00004-<url-hash>-brochure.json
```

Property payloads retain original publisher field names, nesting and values, including descriptions, prices, features, agents, photo URLs, and coordinates where present. Photos themselves are not downloaded. JSON is parsed and pretty-printed; this is a value-preserving extraction, not a byte-for-byte archive of the HTML or embedded script. Daft search wrappers and showcase payloads are retained, along with detail `listing` and `amenities`; MyHome retains `SearchResults` and detail `Brochure`. Session/cookie state, API keys in MyHome's request metadata, and account/application state outside property payloads are excluded. No private API is called.

The manifest stores seed URLs and options to repeat the collection, timestamps, response and file hashes, JSON payload locators, public listing links, pagination, skipped work and errors. `collected` means queued work succeeded; `bounded-snapshot` means limits or offline mode left work unrequested; `incomplete` means at least one request/extraction failed. `inventoryCompleteness` always remains `unverified`: provider search counts, promoted cards, duplicate results, changing inventory, and pagination limits prevent an all-site coverage claim. A successful exit does not prove every house is still available. HTTP/extraction failures return exit code 1 and preserve successful files plus the failure manifest.

HTTP 401/403/429 stops further work for that provider. Missing/malformed publisher state also stops it, covering challenge pages and format changes. The other provider can finish independently. Redirects are validated before following; only public property routes on these two providers are accepted. There are no credential options, account login, challenge bypasses, proxy rotation or hidden endpoints.

## Provider conditions and current verification

The earlier [link feasibility research](research/ireland-property-search-links.md) concerned outbound links only. This command is a separately requested raw collection workflow. Daft's published conditions restrict automated extraction/database population, and provider conditions are not an open-data licence. Local storage does not establish reuse rights. Consult [Daft's terms](https://support.daft.ie/hc/en-ie/articles/5127313728273-Terms-and-Conditions-of-use-of-Daft) and [MyHome's terms](https://news.myhome.ie/uncategorized/terms-and-conditions-36589) when choosing a permitted source/use.

On 5 October 2026, public search and detail HTML from each provider was inspected: Daft used `__NEXT_DATA__.props.pageProps`, and MyHome used `ng-state` search/brochure resolvers. These are observed page formats, not versioned provider contracts. Missing payloads fail explicitly so a site change cannot silently produce an empty successful archive.
