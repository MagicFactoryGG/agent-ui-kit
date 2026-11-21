#!/usr/bin/env bun
// One create step, as `exact new` is for an app: a relying party's own design repo and playground, wired to this
// kit, with the guards on. Only the theme file holds the brand.
//
//   bun tools/create.mjs --title "Acme" --scope @acme --design <dir> --playground <dir> [--theme <theme.json>]
//                        [--presets <dir>] [--bundle-id <reverse.dns>] [--into]
//
// --design      the design repo: theme.json, theme/, components/, blocks/, screens/, frame/, tools/
// --playground  the playground: an Exact app generated from the design repo, wip/, play.mjs, and journeys/blocks
//               and journeys/screens (each piece in a small real use, for its both-doors cases)
// --theme       the brand's theme file (default: the starter's neutral one); checked: light and dark, 4.5:1
// --presets     a folder of preset theme files (each app's look today, Harmonised, …), copied to presets/
// --into        allow an existing design repo: add the starter's files, never overwrite one
//
// Needs Exact (EXACT, else the checkout this kit's apps name) and Bun 1.4.2.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A path with its links resolved, even before it exists (the nearest existing folder's real path, then the rest):
// the playground's package paths are written relative, and a relative path between a link (macOS's /tmp) and the
// folder it names does not resolve.
function real(p) {
  const abs = resolve(p);
  if (existsSync(abs)) return realpathSync(abs);
  const up = dirname(abs);
  return up === abs ? abs : join(real(up), basename(abs));
}

const KIT = real(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const STARTER = join(KIT, 'starter');
const TOOLS = ['theme.mjs', 'matrix.mjs', 'ui-guard.mjs', 'parity.mjs', 'vendor.mjs'];

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (k === 'into') out.into = true;
    else out[k] = argv[++i];
  }
  return out;
}

function exactPath() {
  if (process.env.EXACT) return resolve(process.env.EXACT);
  for (const app of ['apps/agent-gallery', 'apps/library-gate']) {
    const f = join(KIT, app, 'exact.mjs');
    if (!existsSync(f)) continue;
    const m = /process\.env\.EXACT2 \?\? "([^"]+)"/.exec(readFileSync(f, 'utf8'));
    if (m) return resolve(KIT, app, m[1]);
  }
  return null;
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.exact' || n === 'bun.lock') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Copy a template folder, filling the placeholders; an existing file is kept (and listed) unless allowed.
function lay(from, to, fill, { into }) {
  const kept = [];
  for (const src of walk(from)) {
    const dest = join(to, relative(from, src));
    if (existsSync(dest)) {
      if (!into) throw new Error(`${dest} exists: pass --into to add to an existing repo (no file is overwritten)`);
      kept.push(relative(to, dest));
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    const text = readFileSync(src, 'utf8');
    writeFileSync(dest, fill(text));
  }
  return kept;
}

const run = (cmd, a, cwd, env = {}) => {
  const r = spawnSync(cmd, a, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} failed in ${cwd}`);
};

function main() {
  const o = args(process.argv.slice(2));
  if (!o.title || !o.scope || !o.design || !o.playground || !/^@[a-z0-9-]+$/.test(o.scope)) {
    console.error('usage: bun tools/create.mjs --title "Acme" --scope @acme --design <dir> --playground <dir> [--theme <file>] [--presets <dir>] [--bundle-id <id>] [--into]');
    return 2;
  }
  const exact = exactPath();
  if (!exact || !existsSync(join(exact, 'scripts/exact.mjs'))) {
    console.error('create: no Exact checkout: set EXACT to one (this kit is tested at the commit its README names)');
    return 2;
  }
  const design = real(o.design);
  const play = real(o.playground);
  const name = o.scope.slice(1);
  const relDesign = relative(play, design) || '.';
  const fill = (t) => t.replaceAll('__SCOPE__', o.scope).replaceAll('__NAME__', name).replaceAll('__TITLE__', o.title).replaceAll('__DESIGN__', relDesign).replaceAll('__KIT__', relative(play, KIT) || '.');

  // 1. The design repo: the layers, the frame, the tools, the theme.
  mkdirSync(design, { recursive: true });
  const kept = lay(join(STARTER, 'design'), design, fill, o);
  mkdirSync(join(design, 'tools'), { recursive: true });
  const kit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: KIT, encoding: 'utf8' }).stdout?.trim() || 'unknown';
  for (const t of TOOLS) {
    const src = join(KIT, 'tools', t);
    const dest = join(design, 'tools', t);
    if (existsSync(src)) writeFileSync(dest, readFileSync(src, 'utf8').replace(/^(#!.*\n)?/, (m) => `${m}// From agent-ui-kit ${kit}. Update with the kit's create step (--into keeps your files) or copy it again.\n`));
  }
  if (o.theme) copyFileSync(resolve(o.theme), join(design, 'theme.json'));
  if (o.presets) cpSync(resolve(o.presets), join(design, 'presets'), { recursive: true });
  const designPkg = JSON.parse(readFileSync(join(design, 'package.json'), 'utf8'));
  designPkg.scripts = { ...(designPkg.scripts ?? {}), parity: `bun tools/parity.mjs ${relative(design, play)}` };
  writeFileSync(join(design, 'package.json'), `${JSON.stringify(designPkg, null, 2)}\n`);
  run('bun', ['tools/theme.mjs', 'build', 'theme.json', 'theme'], design);
  run('bun', ['install'], design);

  // 2. The playground: an Exact app, then the starter's files over it.
  if (!existsSync(join(play, 'app.json'))) {
    const id = o['bundle-id'] ?? `com.example.${name.replace(/[^a-z0-9]/g, '')}.playground`;
    run('bun', [join(exact, 'scripts/exact.mjs'), 'new', play, '--name', `${o.title} playground`, '--bundle-id', id, '--with', 'mac'], KIT);
  }
  lay(join(STARTER, 'playground'), play, fill, { into: true });
  // `exact new` wrote its own AGENTS.md; the playground's rules go below it (the guard's lines among them).
  const rules = fill(readFileSync(join(STARTER, 'playground', 'AGENTS.md'), 'utf8'));
  const agents = join(play, 'AGENTS.md');
  if (!readFileSync(agents, 'utf8').includes(rules.split('\n')[0])) writeFileSync(agents, `${readFileSync(agents, 'utf8').trimEnd()}\n\n${rules}`);
  const pkgFile = join(play, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  pkg.dependencies = { ...(pkg.dependencies ?? {}) };
  for (const layer of ['theme', 'components', 'blocks', 'screens', 'frame']) pkg.dependencies[`${o.scope}/${layer}`] = `file:${relDesign}/${layer}`;
  pkg.dependencies[`${o.scope}/wip`] = 'file:./wip';
  pkg.scripts = { ...(pkg.scripts ?? {}), play: 'bun play.mjs', check: 'bun play.mjs check' };
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  const app = JSON.parse(readFileSync(join(play, 'app.json'), 'utf8'));
  app.host = { web: {}, macos: { minimumOS: '14.0', window: { width: 1280, height: 860 } }, ios: { minimumOS: '17.0', deviceFamily: ['iphone', 'ipad'] } };
  delete app.deploy; // nothing ships from a playground
  writeFileSync(join(play, 'app.json'), `${JSON.stringify(app, null, 2)}\n`);
  const ignore = join(play, '.gitignore');
  for (const line of ['/app.contract.d.ts', '/assets/fonts/']) {
    if (!readFileSync(ignore, 'utf8').split('\n').includes(line)) writeFileSync(ignore, `${readFileSync(ignore, 'utf8')}${line}\n`);
  }
  // No `bun install` here: play.mjs links each design package into node_modules, so a save there is live.
  run('bun', ['play.mjs', 'gen'], play);
  run('bun', ['play.mjs', 'check'], play);

  console.log(`\ncreate: ${o.title}'s design repo at ${design}${kept.length ? ` (kept ${kept.length} existing file${kept.length === 1 ? '' : 's'})` : ''}`);
  console.log(`create: ${o.title}'s playground at ${play}; start it: cd ${play} && bun play.mjs`);
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`create: ${error.message}`);
  process.exit(1);
}
