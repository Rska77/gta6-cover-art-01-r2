// VICE SUNSET Cover Studio — build the submission output.
//
// Node 22+, standard library only. Copies app/ and screenshots/ from beside this
// file into the output directory (MAKEFUN_OUTPUT_DIR, or /output under the
// grader), verifies every copied file's byte size against its source, then
// writes dossier.json with the vendored library's buildDossier.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const TREES = ['app', 'screenshots'];

/** Every regular file under dir, as paths relative to dir, sorted by code unit. */
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(relative(dir, full));
      else throw new Error(`unexpected non-regular file: ${full}`);
    }
  };
  walk(dir);
  return found.sort();
}

mkdirSync(out, { recursive: true });

for (const tree of TREES) {
  const src = join(here, tree);
  const dest = join(out, tree);
  rmSync(dest, { recursive: true, force: true });
  if (!existsSync(src)) continue;
  cpSync(src, dest, { recursive: true });

  const srcFiles = filesUnder(src);
  const destFiles = filesUnder(dest);
  if (destFiles.length !== srcFiles.length) {
    throw new Error(`copy verification failed: ${tree} holds ${destFiles.length} files, source holds ${srcFiles.length}`);
  }
  for (let i = 0; i < srcFiles.length; i++) {
    const path = srcFiles[i]!;
    if (destFiles[i] !== path) {
      throw new Error(`copy verification failed: ${tree}/${path} is missing or extra (found ${destFiles[i] ?? 'nothing'})`);
    }
    const srcBytes = statSync(join(src, path)).size;
    const destBytes = statSync(join(dest, path)).size;
    if (srcBytes !== destBytes) {
      throw new Error(`copy verification failed: ${tree}/${path} is ${destBytes} bytes, source is ${srcBytes}`);
    }
  }
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

let copied = 0;
let copiedBytes = 0;
for (const tree of TREES) {
  const dir = join(out, tree);
  if (!existsSync(dir)) continue;
  for (const path of filesUnder(dir)) {
    copied += 1;
    copiedBytes += statSync(join(dir, path)).size;
  }
}
console.log(
  `copied ${copied} files, ${copiedBytes} bytes; dossier.json ${dossier.length} bytes -> ${join(out, 'dossier.json')}`,
);
