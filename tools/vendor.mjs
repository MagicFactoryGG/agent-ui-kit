#!/usr/bin/env bun
// Vendor the design repo's packages into an app that cannot reach the design repo when it builds (another
// repository, a CI sandbox): a copy under <app>/vendor/<layer>/, and vendor/MANIFEST.json with each file's
// sha256 and the design repo's commit. tools/ui-guard.mjs fails when a vendored file differs from the
// manifest, so the copy is never edited by hand: change the design repo, then vendor again.
//
//   bun tools/vendor.mjs <app dir> [--layers theme,components,blocks,screens] [--also <package dir>]…
//
// The app's package.json then names each as "file:./vendor/<layer>"; vendor/ui-guard.mjs (with its .d.mts) is the
// guard, for the app's own tests.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'bun.lock' || n === '.DS_Store') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function main(argv) {
  const app = argv[0] && resolve(argv[0]);
  if (!app || !existsSync(join(app, 'package.json'))) {
    console.error('usage: bun tools/vendor.mjs <app dir> [--layers theme,components,blocks,screens] [--also <package dir>]…');
    return 2;
  }
  const at = argv.indexOf('--layers');
  const layers = (at > 0 ? argv[at + 1] : 'theme,components,blocks,screens').split(',');
  const also = argv.flatMap((a, i) => (a === '--also' ? [resolve(argv[i + 1])] : []));
  const dirs = [...layers.map((l) => join(DESIGN, l)), ...also];
  const vendor = join(app, 'vendor');
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: DESIGN, encoding: 'utf8' }).stdout?.trim() || 'unknown';
  const dirty = spawnSync('git', ['status', '--porcelain', '--', ...dirs], { cwd: DESIGN, encoding: 'utf8' }).stdout?.trim();
  const files = {};
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  pkg.dependencies = { ...(pkg.dependencies ?? {}) };
  for (const dir of dirs) {
    const name = basename(dir);
    const to = join(vendor, name);
    rmSync(to, { recursive: true, force: true });
    mkdirSync(to, { recursive: true });
    cpSync(dir, to, { recursive: true, filter: (src) => !/node_modules|bun\.lock|\.DS_Store|assets\/fonts/.test(src) });
    // A workspace's own links become peers, which the app's own file: entries satisfy: one copy of each package
    // (two copies of the theme would ship one design twice, which Exact refuses: forma-package-name).
    const pj = join(to, 'package.json');
    const p = JSON.parse(readFileSync(pj, 'utf8'));
    for (const [dep, spec] of Object.entries(p.dependencies ?? {})) {
      if (String(spec).startsWith('workspace:') || String(spec).startsWith('file:')) {
        p.peerDependencies = { ...(p.peerDependencies ?? {}), [dep]: '*' };
        delete p.dependencies[dep];
      }
    }
    if (p.dependencies && Object.keys(p.dependencies).length === 0) delete p.dependencies;
    writeFileSync(pj, `${JSON.stringify(p, null, 2)}\n`);
    pkg.dependencies[p.name] = `file:./vendor/${name}`;
    for (const f of walk(to)) files[relative(vendor, f)] = createHash('sha256').update(readFileSync(f)).digest('hex');
  }
  // The theme's bundled faces go where Exact reads them: the app's own assets/fonts/ (listed as ../assets/fonts/…).
  const fonts = join(DESIGN, 'theme', 'assets', 'fonts');
  if (layers.includes('theme') && existsSync(fonts)) {
    mkdirSync(join(app, 'assets', 'fonts'), { recursive: true });
    for (const f of readdirSync(fonts)) {
      writeFileSync(join(app, 'assets', 'fonts', f), readFileSync(join(fonts, f)));
      files[`../assets/fonts/${f}`] = createHash('sha256').update(readFileSync(join(fonts, f))).digest('hex');
    }
  }
  // The guard travels with the packages, so the app's own tests can hold it (import { guard } from vendor/ui-guard.mjs).
  const guardSrc = join(DESIGN, 'tools', 'ui-guard.mjs');
  if (existsSync(guardSrc)) {
    writeFileSync(join(vendor, 'ui-guard.mjs'), readFileSync(guardSrc));
    writeFileSync(join(vendor, 'ui-guard.d.mts'), 'export interface Finding {\n  file: string;\n  line: number;\n  what: string;\n}\nexport function guard(app: string): Finding[];\n');
    for (const f of ['ui-guard.mjs', 'ui-guard.d.mts']) files[f] = createHash('sha256').update(readFileSync(join(vendor, f))).digest('hex');
  }
  // The Brand layer: the registry, its lock and the icon list, with the check the guard runs (tools/brand.mjs).
  for (const f of ['brand.json', 'brand.lock', 'icons.json', 'tools/brand.mjs']) {
    const src = join(DESIGN, f);
    if (!existsSync(src)) continue;
    const to = basename(f);
    writeFileSync(join(vendor, to), readFileSync(src));
    files[to] = createHash('sha256').update(readFileSync(join(vendor, to))).digest('hex');
  }
  writeFileSync(join(vendor, 'MANIFEST.json'), `${JSON.stringify({ from: 'the design repo (agent-ui-kit starter)', commit: dirty ? `${commit} with uncommitted changes` : commit, files }, null, 2)}\n`);
  writeFileSync(join(app, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`vendor: ${dirs.length} packages, ${Object.keys(files).length} files, from ${commit}${dirty ? ' (uncommitted changes: commit the design repo first)' : ''} into ${vendor}`);
  return dirty ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
