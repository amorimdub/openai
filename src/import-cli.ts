import { Store } from './store';
const path=process.argv[2];
if(!path) throw new Error('Usage: bun run data:import path.ndjson');
const text=await Bun.file(path).text();
const manifest=await Bun.file(`${path}.manifest.json`).json();
const store=new Store(process.env.DB_PATH??'./data/ireland.prototype.sqlite');
try { console.log(JSON.stringify(store.import(text,manifest))); }
finally { store.close(); }
