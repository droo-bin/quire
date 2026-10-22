// Builds dist/: a copy of src/ plus a service worker that lists every file (with a content hash), so the
// app installs and works offline and updates only download what changed. No dependencies:
//
//   node scripts/build.mjs
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src'), dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(src, dist, { recursive: true });

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!/(^|\/)(LICENSE|LICENCE|NOTICE)/i.test(name) && !name.endsWith('.txt')) files.push(p);
  }
};
walk(dist);
const hash = createHash('sha256');
let bytes = 0;
const list = [];
for (const f of files.sort()) {
  const b = readFileSync(f);
  const rel = './' + relative(dist, f);
  const h = createHash('sha256').update(b).digest('hex').slice(0, 12);
  hash.update(rel); hash.update(h); bytes += b.length;
  if (rel !== './sw.js') list.push([rel, h]);
  if (rel === './index.html') list.push(['./', h]);
}
const version = hash.digest('hex').slice(0, 12);
const sw = readFileSync(join(root, 'scripts/sw.template.js'), 'utf8').replace('%%VERSION%%', version).replace('%%FILES%%', JSON.stringify(list));
writeFileSync(join(dist, 'sw.js'), sw);
writeFileSync(join(dist, 'version.txt'), version + '\n');
console.log(`built dist/ (${list.length} files, ${(bytes / 1e6).toFixed(1)} MB, version ${version})`);
