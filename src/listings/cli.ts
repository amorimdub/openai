import { collectListings, type CollectOptions } from './collect';

const help = `Save Daft.ie and MyHome.ie property payloads as local JSON snapshots.

Usage: bun run data:listings --url <public-search-or-listing-url> [options]
  --url URL               Repeat for multiple search or listing URLs
  --urls-file PATH        UTF-8 file: one URL per line; blank lines and # comments ignored
  --out PATH              Default: data/raw/property-listings
  --max-search-pages N    Pages per search seed (default 1)
  --max-listings N        Discovered detail pages per run (default 20; 0 = cards only)
  --delay-ms N            Minimum interval between page requests (default 1500; minimum 1000)
  --timeout-ms N          Request and body timeout (default 30000)
  --html PATH             Extract one already saved HTML file; requires one --url; no network
  --provider NAME         daft or myhome; defaults to nationwide sale and rental searches
  --all                   Follow all reachable pages/details without collector caps
  --resume PATH           Resume a run directory or its manifest.json; verifies saved hashes
  --help                  Show this help

Payloads retain publisher field names and values. No frontend or database import.
Explicit listing URL seeds are always fetched; --max-listings caps discovered URLs.
Limits and failures are recorded in manifest.json; no all-site completeness claim.
`;

export async function parseOptions(args: string[]): Promise<CollectOptions | null> {
  if (args.includes('--help')) return null;
  const options: CollectOptions = { urls: [], output: 'data/raw/property-listings', maxSearchPages: 1, maxListings: 20, delayMs: 1500, timeoutMs: 30000 };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--') continue;
    if (flag === '--all') {
      options.maxSearchPages = Number.MAX_SAFE_INTEGER;
      options.maxListings = Number.MAX_SAFE_INTEGER;
      continue;
    }
    if (!['--url', '--urls-file', '--out', '--max-search-pages', '--max-listings', '--delay-ms', '--timeout-ms', '--html', '--provider', '--resume'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--url') options.urls.push(value);
    else if (flag === '--out') options.output = value;
    else if (flag === '--html') options.html = value;
    else if (flag === '--resume') options.resume = value;
    else if (flag === '--provider') {
      if (value !== 'daft' && value !== 'myhome') throw new Error('--provider must be daft or myhome');
      options.provider = value;
    }
    else if (flag === '--urls-file') {
      options.urls.push(...(await Bun.file(value).text()).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')));
    } else {
      const minimum = flag === '--max-listings' ? 0 : flag === '--delay-ms' ? 1000 : 1;
      const numeric = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(numeric) || numeric < minimum) throw new Error(`${flag} requires an integer >= ${minimum}`);
      if (flag === '--max-search-pages') options.maxSearchPages = numeric;
      if (flag === '--max-listings') options.maxListings = numeric;
      if (flag === '--delay-ms') options.delayMs = numeric;
      if (flag === '--timeout-ms') options.timeoutMs = numeric;
    }
  }
  if (options.provider && !options.urls.length && !options.resume) {
    options.urls = options.provider === 'daft'
      ? ['https://www.daft.ie/property-for-sale/ireland', 'https://www.daft.ie/property-for-rent/ireland']
      : ['https://www.myhome.ie/residential/ireland/property-for-sale', 'https://www.myhome.ie/rentals/ireland/property-to-rent'];
  }
  if (options.html && options.resume) throw new Error('--html and --resume cannot be combined');
  return options;
}

if (import.meta.main) {
  try {
    const options = await parseOptions(process.argv.slice(2));
    if (!options) console.log(help);
    else {
      const result = await collectListings(options);
      console.log(JSON.stringify(result, null, 2));
      if (result.failed) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
