import { createHash } from 'node:crypto';
import { mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { extractPage, providerFor, publicUrl, type Provider } from './extract';

export interface CollectOptions {
  urls: string[];
  output: string;
  maxSearchPages: number;
  maxListings: number;
  delayMs: number;
  timeoutMs: number;
  html?: string;
  resume?: string;
  provider?: Provider;
}
interface Attempt {
  url: string;
  finalUrl?: string;
  fetchedAt: string;
  httpStatus?: number;
  kind?: string;
  responseSha256?: string;
  files?: { path: string; locator: string; sha256: string; bytes: number }[];
  discoveredListingUrls?: string[];
  nextUrl?: string | null;
  error?: string;
  paginationLimited?: boolean;
}

const checkpointSchema = z.object({
  url: z.string(), finalUrl: z.string().optional(), fetchedAt: z.string(),
  httpStatus: z.number().optional(), kind: z.enum(['search', 'listing']).optional(),
  responseSha256: z.string().optional(),
  files: z.array(z.object({ path: z.string(), locator: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() })).optional(),
  discoveredListingUrls: z.array(z.string()).optional(), nextUrl: z.string().nullable().optional(),
  error: z.string().optional(), paginationLimited: z.boolean().optional(),
});
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
async function writeJson(path: string, value: unknown) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, JSON.stringify(value, null, 2) + '\n');
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
async function verifyFiles(directory: string, attempt: Attempt) {
  if (!attempt.files?.length || !attempt.kind) throw new Error(`Successful checkpoint missing payload files: ${attempt.url}`);
  for (const file of attempt.files) {
    if (isAbsolute(file.path) || file.path.split(/[\\/]/).some(part => ['..', ''].includes(part))) throw new Error('Unsafe checkpoint file path');
    const bytes = await Bun.file(join(directory, file.path)).bytes();
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Saved JSON integrity check failed: ${file.path}`);
  }
}
async function acquireLock(directory: string) {
  const path = join(directory, 'collector-lock.json');
  if (await Bun.file(path).exists()) {
    const owner = z.object({ pid: z.number().int().positive() }).parse(await Bun.file(path).json());
    try {
      process.kill(owner.pid, 0);
      throw new Error(`Collection already running with PID ${owner.pid}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    await rm(path);
  }
  const file = await open(path, 'wx');
  try { await file.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n'); }
  finally { await file.close(); }
  return path;
}

export async function collectListings(options: CollectOptions, fetcher: typeof fetch = fetch) {
  let previous: { options: { urls: string[] }; startedAt: string; attempts: Attempt[] } | undefined;
  let directory: string;
  if (options.resume) {
    const input = resolve(options.resume);
    directory = input.endsWith('/manifest.json') ? dirname(input) : input;
    previous = z.object({
      version: z.literal(1), stage: z.literal('raw-only'), startedAt: z.string(),
      options: z.object({ urls: z.array(z.string()).min(1), html: z.string().optional() }),
      attempts: z.array(checkpointSchema),
    }).parse(await Bun.file(join(directory, 'manifest.json')).json());
    if ('html' in previous.options) throw new Error('Local HTML snapshots cannot be resumed as HTTP collections');
  } else {
    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
    directory = resolve(options.output, runId);
  }
  const seeds = [...new Set((previous?.options.urls ?? options.urls).map(url => publicUrl(url)))];
  if (options.provider && seeds.some(url => providerFor(url) !== options.provider)) throw new Error('Resume/seed provider does not match --provider');
  if (!seeds.length) throw new Error('Provide at least one --url or --urls-file');
  if (options.html && seeds.length !== 1) throw new Error('--html requires exactly one --url');
  await mkdir(directory, { recursive: true });
  const lock = await acquireLock(directory);
  try {
    const completed = new Map<string, Attempt>();
    const checkProvider = (attempt: Attempt) => {
      attempt.url = publicUrl(attempt.url);
      if (!seeds.some(seed => providerFor(seed) === providerFor(attempt.url))) throw new Error('Checkpoint provider differs from seeds');
      if (attempt.finalUrl) publicUrl(attempt.finalUrl, attempt.url);
      if (attempt.nextUrl) attempt.nextUrl = publicUrl(attempt.nextUrl, attempt.url);
      attempt.discoveredListingUrls = attempt.discoveredListingUrls?.map(url => publicUrl(url, attempt.url));
      return attempt;
    };
    for (const attempt of previous?.attempts ?? []) {
      if (!attempt.error) completed.set(attempt.url, checkProvider(attempt));
    }
    const checkpoints = join(directory, 'requests');
    await mkdir(checkpoints, { recursive: true });
    if (previous) {
      for (const name of await readdir(checkpoints)) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        const attempt = checkProvider(checkpointSchema.parse(await Bun.file(join(checkpoints, name)).json()));
        if (name !== `${hash(attempt.url)}.json`) throw new Error('Checkpoint URL/hash mismatch');
        if (!attempt.error) completed.set(attempt.url, attempt);
      }
    }
    const manifest = {
      version: 1,
      stage: 'raw-only',
      startedAt: previous?.startedAt ?? new Date().toISOString(),
      resumedAt: previous ? new Date().toISOString() : null,
      finishedAt: '',
      status: 'running',
      inventoryCompleteness: 'unverified',
      note: 'Publisher property JSON fields are retained without a common-schema transform. Search cards are not full listing details. No claim of all-site inventory or current availability.',
      mode: options.html ? 'local-html' : 'public-http',
      options: { ...options, urls: seeds },
      checkpointDirectory: 'requests',
      attempts: [] as Attempt[],
      skipped: [] as { url: string; reason: string }[],
    };
    // Keep the live manifest small. Each page is checkpointed independently, avoiding
    // rewriting a growing inventory after every request on nationwide runs.
    const saveManifest = (finished = false) => writeJson(join(directory, 'manifest.json'), {
      ...manifest,
      attempts: finished ? manifest.attempts : [],
      skipped: finished ? manifest.skipped : [],
      progress: { processedPages: manifest.attempts.length, savedPages: manifest.attempts.filter(attempt => !attempt.error).length, failedPages: manifest.attempts.filter(attempt => attempt.error).length, skippedUrls: manifest.skipped.length },
    });
    await saveManifest();
    console.log(JSON.stringify({ event: previous ? 'collection-resumed' : 'collection-started', directory, manifest: join(directory, 'manifest.json') }));
    const queued = seeds.map(url => ({ url, searchDepth: 1, detail: false }));
    const visited = new Set<string>();
    const scheduled = new Set(seeds);
    const blocked = new Set<Provider>();
    let detailCount = 0;
    let lastRequestAt = 0;
    const enqueue = (url: string, searchDepth: number, detail: boolean) => {
      if (scheduled.has(url)) return;
      if (detail && detailCount >= options.maxListings) {
        manifest.skipped.push({ url, reason: 'max-listings' });
        return;
      }
      scheduled.add(url);
      if (detail) detailCount++;
      queued.push({ url, searchDepth, detail });
    };
    const followLinks = (job: { url: string; searchDepth: number }, attempt: Attempt) => {
      if (!options.html) {
        if (attempt.paginationLimited) manifest.skipped.push({ url: job.url, reason: 'provider-pagination-limit' });
        if (attempt.nextUrl) {
          if (job.searchDepth < options.maxSearchPages) enqueue(attempt.nextUrl, job.searchDepth + 1, false);
          else manifest.skipped.push({ url: attempt.nextUrl, reason: 'max-search-pages' });
        }
        for (const url of attempt.discoveredListingUrls ?? []) enqueue(url, job.searchDepth, true);
      } else if (attempt.nextUrl || attempt.discoveredListingUrls?.length) {
        manifest.skipped.push({ url: job.url, reason: 'local-html does not fetch linked pages' });
      }
    };
    for (let index = 0; index < queued.length; index++) {
      const job = queued[index]!;
      if (visited.has(job.url)) continue;
      visited.add(job.url);
      const provider = providerFor(job.url);
      const saved = completed.get(job.url);
      if (saved) {
        await verifyFiles(directory, saved);
        manifest.attempts.push(saved);
        followLinks(job, saved);
        await writeJson(join(checkpoints, `${hash(job.url)}.json`), saved);
        continue;
      }
      if (blocked.has(provider)) {
        manifest.skipped.push({ url: job.url, reason: 'provider-blocked' });
        continue;
      }
      const attempt: Attempt = { url: job.url, fetchedAt: new Date().toISOString() };
      manifest.attempts.push(attempt);
      try {
        let html: string;
        let pageUrl = job.url;
        if (options.html) html = await Bun.file(options.html).text();
        else {
          await Bun.sleep(Math.max(0, options.delayMs - (Date.now() - lastRequestAt)));
          lastRequestAt = Date.now();
          attempt.fetchedAt = new Date().toISOString();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), options.timeoutMs);
          try {
            let response: Response | undefined;
            let target = job.url;
            for (let redirects = 0; redirects <= 5; redirects++) {
              // Validate each Location before fetching it; fetch's automatic redirects could leave the provider.
              response = await fetcher(target, {
                headers: { 'User-Agent': 'IrelandRawListingsCollector/1.0', Accept: 'text/html' },
                redirect: 'manual', signal: controller.signal,
              });
              if (![301, 302, 303, 307, 308].includes(response.status)) break;
              const location = response.headers.get('location');
              await response.body?.cancel();
              if (!location || redirects === 5) throw new Error('Missing redirect location or too many redirects');
              target = publicUrl(location, target);
            }
            attempt.httpStatus = response!.status;
            attempt.finalUrl = target;
            pageUrl = target;
            if ([401, 403, 429].includes(response!.status)) blocked.add(provider);
            if (!response!.ok) {
              await response!.body?.cancel();
              throw new Error(`HTTP ${response!.status}; response not saved as listing JSON`);
            }
            html = await response!.text();
          } finally { clearTimeout(timer); }
        }
        let page;
        try { page = extractPage(html, pageUrl); }
        catch (error) {
          // A challenge page or format change is not an invitation to keep requesting this provider.
          blocked.add(provider);
          throw error;
        }
        if (job.detail && page.kind !== 'listing') throw new Error('Detail URL returned a search page; detail completeness unverified');
        attempt.kind = page.kind;
        attempt.responseSha256 = createHash('sha256').update(html).digest('hex');
        attempt.files = [];
        const urlId = createHash('sha256').update(job.url).digest('hex').slice(0, 16);
        await mkdir(join(directory, provider), { recursive: true });
        for (const payload of page.payloads) {
          const path = `${provider}/${String(index + 1).padStart(5, '0')}-${urlId}-${payload.name}.json`;
          const contents = JSON.stringify(payload.value, null, 2) + '\n';
          await Bun.write(join(directory, path), contents);
          attempt.files.push({ path, locator: payload.locator, sha256: createHash('sha256').update(contents).digest('hex'), bytes: Buffer.byteLength(contents) });
        }
        attempt.discoveredListingUrls = page.listingUrls;
        attempt.nextUrl = page.nextUrl;
        attempt.paginationLimited = page.paginationLimited;
        followLinks(job, attempt);
        console.log(JSON.stringify({ provider, url: job.url, kind: page.kind, savedFiles: attempt.files.length }));
      } catch (error) {
        attempt.error = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({ provider, url: job.url, error: attempt.error }));
      }
      await writeJson(join(checkpoints, `${hash(job.url)}.json`), attempt);
      await saveManifest();
    }
    const failed = manifest.attempts.filter(attempt => attempt.error).length;
    manifest.status = failed ? 'incomplete' : manifest.skipped.length ? 'bounded-snapshot' : 'collected';
    manifest.finishedAt = new Date().toISOString();
    await saveManifest(true);
    return { directory, manifest: join(directory, 'manifest.json'), status: manifest.status, failed, savedPages: manifest.attempts.filter(attempt => !attempt.error).length };
  } finally { await rm(lock, { force: true }); }
}
