import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectListings, type CollectOptions } from '../src/listings/collect';
import { extractPage, publicUrl } from '../src/listings/extract';
import { parseOptions } from '../src/listings/cli';

const daftSearch = 'https://www.daft.ie/property-for-sale/dublin-city?salePrice_to=500000';
const daftDetail = 'https://www.daft.ie/for-sale/example-house/123';
const myhomeSearch = 'https://www.myhome.ie/residential/dublin/property-for-sale?minbeds=3';
const myhomeDetail = 'https://www.myhome.ie/residential/brochure/example-house/456';
function nextData(props: unknown) {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script>`;
}
function ngData(state: unknown, links = '') {
  return `<script type='application/json' id='ng-state'>${JSON.stringify(state)}</script>${links}`;
}
const daftListing = { id: 123, description: 'Original description', point: { latitude: 53.1, longitude: -6.1 }, media: { images: [{ url: 'https://example.test/photo.jpg' }] }, seoFriendlyPath: '/for-sale/example-house/123' };
const brochure = {
  Property: { PropertyId: 456, BrochureContent: { Description: 'Original brochure' }, BrochureMap: { Latitude: 53.2, Longitude: -6.2 }, Photos: [{ Url: 'https://example.test/photo.jpg' }] },
  Features: ['Parking'], PriceChanges: [{ Price: 500000 }],
};

describe('publisher payload extraction', () => {
  test('Daft retains complete property fields but excludes session state', () => {
    const page = extractPage(nextData({ listing: daftListing, amenities: ['Parking'], session: { token: 'DO-NOT-SAVE' }, daftCookies: 'DO-NOT-SAVE' }), daftDetail);
    expect(page.kind).toBe('listing');
    expect(page.payloads[0]!.value).toEqual(daftListing);
    expect(JSON.stringify(page)).not.toContain('DO-NOT-SAVE');
    expect(page.payloads[1]!.value).toEqual(['Parking']);
  });

  test('Daft keeps raw card wrappers and follows publisher paging with filters', () => {
    const cards = [{ listing: daftListing, savedAd: false }];
    const page = extractPage(nextData({ listings: cards, showcaseListings: cards, paging: { currentPage: 1, totalPages: 2 } }), daftSearch);
    expect(page.payloads[0]!.value).toEqual(cards);
    expect(page.listingUrls).toEqual([daftDetail]);
    expect(new URL(page.nextUrl!).searchParams.get('salePrice_to')).toBe('500000');
    expect(new URL(page.nextUrl!).searchParams.get('page')).toBe('2');
  });

  test('MyHome saves brochure fields, excluding account and application data', () => {
    const page = extractPage(ngData({ [`BROCHURE_RESOLVER:${new URL(myhomeDetail).pathname}`]: { Brochure: brochure, UserId: 'DO-NOT-SAVE', RentalApplications: ['DO-NOT-SAVE'] } }), myhomeDetail);
    expect(page.payloads[0]!.value).toEqual(brochure);
    expect(JSON.stringify(page)).not.toContain('DO-NOT-SAVE');
  });

  test('MyHome search retains card data, decodes links, and excludes request API keys', () => {
    const page = extractPage(ngData({ 'SEARCH_RESOLVER:/residential/dublin/property-for-sale': {
      SearchResults: [brochure], Page: 1, PageSize: 20, ResultCount: 40,
      Request: { ApiKey: 'DO-NOT-SAVE' }, SeoDetails: { NextUrl: '/residential/dublin/property-for-sale?minbeds=3&page=2' },
    } }, `<a href="/residential/brochure/example-house/456">House</a>`), myhomeSearch);
    expect(page.listingUrls).toEqual([myhomeDetail]);
    expect(new URL(page.nextUrl!).searchParams.get('minbeds')).toBe('3');
    expect(JSON.stringify(page)).not.toContain('DO-NOT-SAVE');
  });

  test('challenge pages and malformed state are failures', () => {
    expect(() => extractPage('<h1>Verify you are human</h1>', daftSearch)).toThrow('missing');
    expect(() => extractPage('<script type="application/json" id="ng-state">broken</script>', myhomeSearch)).toThrow('Invalid JSON');
  });

  test('restricts requests to public provider routes and excludes credentials', () => {
    for (const url of ['http://daft.ie/for-sale/a/123', 'https://daft.ie.evil.test/for-sale/a/123', 'https://www.daft.ie/api/listings', 'https://user:secret@www.daft.ie/for-sale/a/123', `${daftSearch}&apiKey=secret`]) {
      expect(() => publicUrl(url)).toThrow();
    }
    expect(() => publicUrl(myhomeSearch, daftSearch)).toThrow('Cross-provider');
    expect(publicUrl('https://daft.ie/for-sale/a/123#photo')).toBe('https://www.daft.ie/for-sale/a/123');
  });
});

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function options(overrides: Partial<CollectOptions> = {}): Promise<CollectOptions> {
  const output = await mkdtemp(join(tmpdir(), 'listing-collector-test-'));
  temporary.push(output);
  // Direct module tests use no delay; CLI requires at least 1000 ms.
  return { urls: [daftSearch], output, maxSearchPages: 2, maxListings: 5, delayMs: 0, timeoutMs: 500, ...overrides };
}
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(url), init))) as typeof fetch;
}

describe('raw snapshot workflow', () => {
  test('walks search pages and fetches duplicate listing details once; saves only JSON', async () => {
    const requests: string[] = [];
    const result = await collectListings(await options(), mockFetch(url => {
      requests.push(url);
      if (url === daftDetail) return new Response(nextData({ listing: daftListing }));
      return new Response(nextData({ listings: [{ listing: daftListing }], paging: { currentPage: new URL(url).searchParams.has('page') ? 2 : 1, totalPages: 2 } }));
    }));
    expect(requests.filter(url => url === daftDetail)).toHaveLength(1);
    expect(result.status).toBe('collected');
    expect(result.savedPages).toBe(3);
    const manifest = await Bun.file(result.manifest).json();
    expect(manifest.inventoryCompleteness).toBe('unverified');
    const detail = manifest.attempts.find((attempt: { kind: string }) => attempt.kind === 'listing');
    expect(await Bun.file(join(result.directory, detail.files[0].path)).json()).toEqual(daftListing);
    const files = await readdir(join(result.directory, 'daft'));
    expect(files.every(file => file.endsWith('.json'))).toBe(true);
    const rerun = await collectListings(await options({ urls: [daftDetail], output: result.directory }), mockFetch(() => new Response(nextData({ listing: daftListing }))));
    expect(rerun.directory).not.toBe(result.directory);
    expect(await Bun.file(result.manifest).exists()).toBe(true);
  });

  test('bounded search/card-only runs record skipped pages and details', async () => {
    const result = await collectListings(await options({ maxSearchPages: 1, maxListings: 0 }), mockFetch(() => new Response(nextData({ listings: [{ listing: daftListing }], paging: { currentPage: 1, totalPages: 2 } }))));
    expect(result.status).toBe('bounded-snapshot');
    const manifest = await Bun.file(result.manifest).json();
    expect(manifest.skipped.map((entry: { reason: string }) => entry.reason)).toEqual(['max-search-pages', 'max-listings']);
  });

  test('stops a blocked provider but still collects the other provider', async () => {
    const requests: string[] = [];
    const result = await collectListings(await options({ urls: [daftSearch, daftDetail, myhomeDetail] }), mockFetch(url => {
      requests.push(url);
      return url.includes('daft.ie') ? new Response('Blocked', { status: 403 }) : new Response(ngData({ 'BROCHURE_RESOLVER:/example': { Brochure: brochure } }));
    }));
    expect(requests).toEqual([daftSearch, myhomeDetail]);
    expect(result.failed).toBe(1);
    expect(result.savedPages).toBe(1);
    expect(result.status).toBe('incomplete');
  });

  test('does not follow redirects outside allowed public routes', async () => {
    let calls = 0;
    const result = await collectListings(await options(), mockFetch((_url, init) => {
      expect(init?.redirect).toBe('manual');
      calls++;
      return new Response(null, { status: 302, headers: { Location: 'https://example.test/private' } });
    }));
    expect(calls).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('a challenge with HTTP 200 stops subsequent provider requests', async () => {
    let calls = 0;
    const result = await collectListings(await options({ urls: [daftSearch, daftDetail] }), mockFetch(() => {
      calls++;
      return new Response('<h1>Verify you are human</h1>');
    }));
    expect(calls).toBe(1);
    expect(result.failed).toBe(1);
    const manifest = await Bun.file(result.manifest).json();
    expect(manifest.skipped[0].reason).toBe('provider-blocked');
  });

  test('request timeouts preserve an explicit failed manifest', async () => {
    const result = await collectListings(await options({ timeoutMs: 10 }), mockFetch((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true });
    })));
    expect(result.status).toBe('incomplete');
    const manifest = await Bun.file(result.manifest).json();
    expect(manifest.attempts[0].error).toBe('Request aborted');
    expect(manifest.attempts[0].files).toBeUndefined();
  });

  test('local HTML extraction never fetches linked pages', async () => {
    const opts = await options();
    const html = join(opts.output, 'input.html');
    await Bun.write(html, nextData({ listings: [{ listing: daftListing }], paging: { currentPage: 1, totalPages: 2 } }));
    const result = await collectListings({ ...opts, html }, mockFetch(() => { throw new Error('Unexpected network request'); }));
    expect(result.savedPages).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('bounded-snapshot');
  });

  test('provider commands have nationwide seeds and remove collector caps', async () => {
    const daft = (await parseOptions(['--provider', 'daft', '--all']))!;
    expect(daft.urls).toEqual(['https://www.daft.ie/property-for-sale/ireland', 'https://www.daft.ie/property-for-rent/ireland']);
    expect(daft.maxSearchPages).toBe(Number.MAX_SAFE_INTEGER);
    expect(daft.maxListings).toBe(Number.MAX_SAFE_INTEGER);
    const myhome = (await parseOptions(['--provider', 'myhome', '--all']))!;
    expect(myhome.urls).toEqual(['https://www.myhome.ie/residential/ireland/property-for-sale', 'https://www.myhome.ie/rentals/ireland/property-to-rent']);
    expect(await parseOptions(['--provider', 'daft', '--all', '--max-listings', '1'])).toMatchObject({ maxListings: 1 });
    expect(await parseOptions(['--provider', 'daft', '--all', '--resume', '/tmp/example'])).toMatchObject({ urls: [] });
    expect(parseOptions(['--provider', 'unknown'])).rejects.toThrow();
  });

  test('resumes bounded snapshots, fetching only missing pages and details', async () => {
    const opts = await options();
    const responder = mockFetch(url => url === daftDetail ? new Response(nextData({ listing: daftListing })) : new Response(nextData({ listings: [{ listing: daftListing }], paging: { currentPage: new URL(url).searchParams.has('page') ? 2 : 1, totalPages: 2 } })));
    const first = await collectListings({ ...opts, maxSearchPages: 1, maxListings: 0 }, responder);
    const manifest = await Bun.file(first.manifest).json();
    const originalPath = join(first.directory, manifest.attempts[0].files[0].path);
    const original = await Bun.file(originalPath).text();
    const requests: string[] = [];
    const resumed = await collectListings({ ...opts, urls: [], resume: first.directory }, mockFetch((url, init) => {
      requests.push(url);
      return responder(url, init);
    }));
    expect(resumed.directory).toBe(first.directory);
    expect(resumed.savedPages).toBe(3);
    expect(resumed.status).toBe('collected');
    expect(requests).toHaveLength(2);
    expect(requests).not.toContain(daftSearch);
    expect(await Bun.file(originalPath).text()).toBe(original);
  });

  test('reconstructs interrupted work from independent JSON checkpoints', async () => {
    const opts = await options({ urls: [daftDetail] });
    const first = await collectListings(opts, mockFetch(() => new Response(nextData({ listing: daftListing }))));
    const manifest = await Bun.file(first.manifest).json();
    await Bun.write(first.manifest, JSON.stringify({ ...manifest, status: 'running', attempts: [], finishedAt: '' }));
    await Bun.write(join(first.directory, 'collector-lock.json'), JSON.stringify({ pid: 2147483647 }));
    const resumed = await collectListings({ ...opts, resume: first.manifest }, mockFetch(() => { throw new Error('Already saved page must not be refetched'); }));
    expect(resumed.failed).toBe(0);
    expect(resumed.savedPages).toBe(1);
    expect(await Bun.file(join(first.directory, 'collector-lock.json')).exists()).toBe(false);
  });

  test('resume refuses altered JSON and cross-provider snapshots', async () => {
    const opts = await options({ urls: [daftDetail] });
    const first = await collectListings(opts, mockFetch(() => new Response(nextData({ listing: daftListing }))));
    const manifest = await Bun.file(first.manifest).json();
    await Bun.write(join(first.directory, manifest.attempts[0].files[0].path), '{}');
    await expect(collectListings({ ...opts, resume: first.directory }, mockFetch(() => { throw new Error('No refetch'); }))).rejects.toThrow('integrity check failed');
    await expect(collectListings({ ...opts, provider: 'myhome', resume: first.directory })).rejects.toThrow('provider does not match');
  });

  test('reports a provider pagination cap without requesting inaccessible next pages', async () => {
    const page = extractPage(nextData({ listings: [], paging: { currentPage: 100, totalPages: 500 }, hasReachedPaginationLimit: true }), daftSearch);
    expect(page.paginationLimited).toBe(true);
    expect(page.nextUrl).toBeNull();
    const result = await collectListings(await options(), mockFetch(() => new Response(nextData({ listings: [], paging: { currentPage: 100, totalPages: 500 }, hasReachedPaginationLimit: true }))));
    expect(result.status).toBe('bounded-snapshot');
    expect((await Bun.file(result.manifest).json()).skipped[0].reason).toBe('provider-pagination-limit');
  });

  test('CLI rejects unknown options, invalid caps and excessive request rates', async () => {
    expect(parseOptions(['--delay-ms', '0'])).rejects.toThrow('>= 1000');
    expect(parseOptions(['--max-search-pages', '0'])).rejects.toThrow();
    expect(parseOptions(['--max-listings', 'Infinity'])).rejects.toThrow();
    expect(parseOptions(['--no-such-flag', 'yes'])).rejects.toThrow('Unknown');
    expect(parseOptions(['--url'])).rejects.toThrow('Missing value');
    expect(await parseOptions(['--url', daftSearch, '--max-listings', '0'])).toMatchObject({ urls: [daftSearch], maxListings: 0 });
  });
});
