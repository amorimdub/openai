import {generateMarketGeographies} from './market-geographies-cli';
import { PostgisRepository } from './postgis';
import { z } from 'zod';

const runIndexSchema = z.object({
  version: z.literal(2),
  results: z.array(z.object({ source: z.string(), files: z.object({records:z.string()}).passthrough() }).passthrough()).min(1),
}).passthrough();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required; see .env.example');
const index = runIndexSchema.parse(await Bun.file(process.argv[2] ?? 'data/canonical/last-run.json').json());
const repository = new PostgisRepository(url, process.env.RAW_ROOT ?? 'data/raw');
try {
  await repository.initialize();
  for (const result of index.results) console.log(JSON.stringify({source:result.source,...await repository.importFile(result.files.records)}));
  await generateMarketGeographies();
  console.log(JSON.stringify({status:'complete',recordCount:(await repository.status()).recordCount}));
} finally {
  await repository.close();
}
