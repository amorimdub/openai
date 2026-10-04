import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, mkdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// Inventory original bytes only. This command does not parse source records.
const root = resolve(process.argv[2] ?? 'data/raw');
const output = join(root, 'inventory.json');
await mkdir(root, { recursive: true });
const files: { path: string; bytes: number; sha256: string }[] = [];
const incomplete: string[] = [];
async function visit(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && path !== output) {
      if (/\.(part|tmp)$/.test(entry.name)) {
        incomplete.push(relative(root, path));
        continue;
      }
      const before = await stat(path);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      const after = await stat(path);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw new Error(`File changed during inventory: ${path}`);
      }
      files.push({ path: relative(root, path), bytes: after.size, sha256: hash.digest('hex') });
    }
  }
}
await visit(root);
files.sort((a, b) => a.path.localeCompare(b.path));
const inventory = {
  version: 1,
  generatedAt: new Date().toISOString(),
  stage: 'raw-only',
  note: 'Local byte inventory. Consult source manifests for licence and download completeness; file presence does not certify national coverage.',
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  incomplete,
  files,
};
await Bun.write(output, JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ output, fileCount: inventory.fileCount, totalBytes: inventory.totalBytes, incomplete }));
