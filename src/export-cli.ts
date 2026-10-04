import { exportSource, type SourceKey } from './exporter';
const [key,path]=process.argv.slice(2);
if(!key || !path) throw new Error('Usage: bun run data:fetch <pobal|towns> path.ndjson');
console.log(JSON.stringify(await exportSource(key as SourceKey,path)));
