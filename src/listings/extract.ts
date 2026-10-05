export type Provider = 'daft' | 'myhome';
type ObjectValue = Record<string, unknown>;
export interface Payload { name: string; locator: string; value: unknown }
export interface ListingPage {
  kind: 'search' | 'listing';
  payloads: Payload[];
  listingUrls: string[];
  nextUrl: string | null;
  paginationLimited?: boolean;
}

function object(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function providerFor(input: string): Provider {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Use a public HTTPS Daft.ie or MyHome.ie URL without credentials or a port');
  }
  if (['daft.ie', 'www.daft.ie'].includes(url.hostname)) return 'daft';
  if (['myhome.ie', 'www.myhome.ie'].includes(url.hostname)) return 'myhome';
  throw new Error('Only Daft.ie and MyHome.ie URLs are supported');
}

export function publicUrl(input: string, base?: string): string {
  const url = new URL(input, base);
  const provider = providerFor(url.href);
  if (base && providerFor(base) !== provider) throw new Error('Cross-provider link refused');
  const allowed = provider === 'daft'
    ? /^\/(?:property-for-(?:sale|rent)|for-sale|for-rent|new-home-for-sale|sharing)(?:\/|$)/
    : /^\/(?:residential|rentals|commercial|new-homes)(?:\/|$)/;
  if (!allowed.test(url.pathname)) throw new Error('Only public property search and listing paths are supported');
  for (const key of url.searchParams.keys()) {
    if (/token|cookie|session|auth|api.?key|password/i.test(key)) throw new Error('Credential query parameters are not supported');
  }
  url.hostname = `www.${provider}.ie`;
  url.hash = '';
  return url.href;
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
    .exec(attributes)?.slice(1).find(value => value !== undefined);
}

function scripts(html: string): { id?: string; value: unknown }[] {
  const result: { id?: string; value: unknown }[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/^application\/(?:ld\+)?json$/i.test(attribute(match[1]!, 'type') ?? '')) continue;
    try {
      result.push({ id: attribute(match[1]!, 'id'), value: JSON.parse(match[2]!) });
    } catch {
      throw new Error('Invalid JSON in provider page; no snapshot marked successful');
    }
  }
  return result;
}

function safeLink(input: unknown, base: string): string | null {
  if (typeof input !== 'string' || !input) return null;
  try { return publicUrl(input.replace(/&amp;/g, '&'), base); } catch { return null; }
}

function htmlLinks(html: string, base: string): { listings: string[]; next: string | null } {
  const listings = new Set<string>();
  let next: string | null = null;
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = match[1]!;
    const url = safeLink(attribute(attrs, 'href'), base);
    if (!url) continue;
    const path = new URL(url).pathname;
    if (/^\/(?:for-sale|for-rent|new-home-for-sale|sharing)\/.+\/\d+\/?$/.test(path)
      || /\/brochure\/.+\/\d+\/?$/.test(path)) listings.add(url);
    if ((attribute(attrs, 'rel') ?? '').split(/\s+/).includes('next')
      || attribute(attrs, 'data-testid') === 'next-page-link') next = url;
  }
  return { listings: [...listings], next };
}

export function extractPage(html: string, input: string): ListingPage {
  const url = publicUrl(input);
  const provider = providerFor(url);
  const blocks = scripts(html);
  const links = htmlLinks(html, url);
  const payloads: Payload[] = [];
  let kind: ListingPage['kind'];
  let nextUrl = links.next;
  let paginationLimited = false;
  if (provider === 'daft') {
    const state = blocks.find(block => block.id === '__NEXT_DATA__')?.value;
    const props = object(state) && object(state.props) ? state.props.pageProps : null;
    if (!object(props)) throw new Error('Daft __NEXT_DATA__.props.pageProps missing (blocked page or provider format change)');
    if (object(props.listing)) {
      kind = 'listing';
      for (const name of ['listing', 'amenities']) {
        if (props[name] !== undefined) payloads.push({ name, locator: `__NEXT_DATA__.props.pageProps.${name}`, value: props[name] });
      }
    } else if (Array.isArray(props.listings)) {
      kind = 'search';
      for (const name of ['listings', 'showcaseListings', 'paging']) {
        if (props[name] !== undefined) payloads.push({ name, locator: `__NEXT_DATA__.props.pageProps.${name}`, value: props[name] });
      }
      for (const entry of [...props.listings, ...(Array.isArray(props.showcaseListings) ? props.showcaseListings : [])]) {
        const listing = object(entry) && object(entry.listing) ? entry.listing : entry;
        const link = object(listing) ? safeLink(listing.seoFriendlyPath, url) : null;
        if (link) links.listings.push(link);
      }
      const paging = props.paging;
      paginationLimited = props.hasReachedPaginationLimit === true;
      if (object(paging) && typeof paging.currentPage === 'number' && typeof paging.totalPages === 'number') {
        if (paging.currentPage < paging.totalPages) {
          const next = new URL(url);
          next.searchParams.delete('from');
          next.searchParams.set('page', String(paging.currentPage + 1));
          nextUrl = next.href;
        } else nextUrl = null;
      }
    } else throw new Error('Daft listing payload missing (blocked page or provider format change)');
  } else {
    const state = blocks.find(block => block.id === 'ng-state')?.value;
    if (!object(state)) throw new Error('MyHome ng-state missing (blocked page or provider format change)');
    const resolver = Object.entries(state).find(([key, value]) =>
      key.startsWith('BROCHURE_RESOLVER:') && object(value) && object(value.Brochure));
    const search = Object.entries(state).find(([key, value]) =>
      key.startsWith('SEARCH_RESOLVER:') && object(value) && Array.isArray(value.SearchResults));
    if (resolver && object(resolver[1])) {
      kind = 'listing';
      payloads.push({ name: 'brochure', locator: `ng-state[${JSON.stringify(resolver[0])}].Brochure`, value: resolver[1].Brochure });
    } else if (search && object(search[1])) {
      kind = 'search';
      const value = search[1];
      payloads.push({ name: 'search-results', locator: `ng-state[${JSON.stringify(search[0])}].SearchResults`, value: value.SearchResults });
      // Preserve publisher paging fields, excluding Request.ApiKey and account state.
      const paging = Object.fromEntries(['ResultCount', 'Page', 'PageSize', 'HasResults', 'SeoUrl']
        .filter(key => value[key] !== undefined).map(key => [key, value[key]]));
      payloads.push({ name: 'paging', locator: `ng-state[${JSON.stringify(search[0])}] (paging fields)`, value: paging });
      if (object(value.SeoDetails)) nextUrl = safeLink(value.SeoDetails.NextUrl, url) ?? nextUrl;
      const count = value.ResultCount, page = value.Page, size = value.PageSize;
      if (typeof count === 'number' && typeof page === 'number' && typeof size === 'number' && size > 0) {
        if (page * size >= count) nextUrl = null;
        else if (!nextUrl) {
          const next = new URL(url);
          next.searchParams.set('page', String(page + 1));
          nextUrl = next.href;
        }
      }
    } else throw new Error('MyHome listing resolver missing (blocked page or provider format change)');
  }
  return { kind, payloads, listingUrls: kind === 'search' ? [...new Set(links.listings)] : [], nextUrl: kind === 'search' && !paginationLimited ? nextUrl : null, paginationLimited };
}
