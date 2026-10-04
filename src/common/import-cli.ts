import { PostgisRepository } from './postgis';
const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL is required; see .env.example');
const files=process.argv.slice(2);
if(!files.length)throw new Error('Usage: bun run src/common/import-cli.ts <canonical.ndjson> [...]');
const repository=new PostgisRepository(url,process.env.RAW_ROOT);
try {await repository.initialize();for(const file of files)console.log(JSON.stringify(await repository.importFile(file)));} finally {await repository.close();}
