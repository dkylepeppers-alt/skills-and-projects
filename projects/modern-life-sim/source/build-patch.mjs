import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { patchBundle } from './android-auth-patch.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node build-patch.mjs <original-package-dir> <output-dir>');
const source = await readFile(join(input, 'server.mjs'), 'utf8');
const patched = patchBundle(source);
const manifest = JSON.parse(await readFile(join(input, 'manifest.json'), 'utf8'));
if (manifest.id !== 'modern-life-sim' || manifest.version !== '0.3.2') throw new Error('Wrong package version');
const declaration = manifest.files.find(file => file.path === 'server.mjs');
if (!declaration) throw new Error('Missing server declaration');
declaration.sha256 = createHash('sha256').update(patched).digest('hex');
declaration.bytes = Buffer.byteLength(patched);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'server.mjs'), patched);
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built local Android-auth patch at ${resolve(output)} (${declaration.sha256})`);
