#!/usr/bin/env bun
// The protected Brand layer: a party's registered marks, logos and provider buttons, which nobody draws but the
// registered component. brand.json (in the design repo) names each asset: its package and component, an example
// call (the playground's Brand page), and the words that belong to it ("Authenticate with …"). Only `register` writes
// it, from a Distiller record that shows the party proved ownership; an asset's `also` names the brand's own places
// that may draw or say it (its proof app), (authenticated, its domain checked), so no one
// registers someone else's brand. brand.lock keeps the registry's hash and each asset drawing's fingerprints.
//
//   bun tools/brand.mjs register <design dir> --record <run>/ownership.json --brand brand.draft.json
//   bun tools/brand.mjs check <dir> [--design <design dir>]     any app or the design repo; exit 1 on a finding
//   bun tools/brand.mjs icon <design dir> <name> <file>:<line>  register a drawing that is not a brand asset
//   bun tools/brand.mjs look <playground dir> [--design <design dir>]  each asset as drawn now against its reference
//
// register --playground <dir> also captures the references: each asset drawn on the playground's Brand page, light and
// dark (brand-references/, their hashes in brand.lock). look draws them again and fails on more than 0.5% of a cell's
// pixels differing (8% colour fuzz), so an asset that renders differently from its registration fails.
//
// check fails when
//   - brand.json or a registered asset's drawing changed without a new registration (brand.lock),
//   - a registered asset's drawing (its SVG fingerprint) or its words appear outside its registered package,
//   - a piece draws an SVG that is neither a registered asset nor a registered icon (icons.json): a new drawing is
//     registered on purpose, so a mark drawn by hand (a smiley in place of the logo) cannot slip in.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

const RULE = 'REFUSED by brand (agent-ui-kit starter/README.md, "Brand layer": a mark, logo or provider button comes only from its registered component)';
const SKIP = new Set(['node_modules', 'target', 'dist', '.exact', '.git']);
const sha = (s) => createHash('sha256').update(s).digest('hex');

function contracts(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('dist.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) contracts(p, out);
    else if (name.endsWith('.contract') && !name.endsWith('.test.contract')) out.push(p);
  }
  return out;
}

/** Every `svg` node in a contract file: its line and the fingerprint of what it draws (its children, normalised). */
export function drawings(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)svg\b/.exec(line);
    if (!m) return;
    const indent = m[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '' || l.trim().startsWith('//')) continue;
      if (l.length - l.trimStart().length <= indent) break;
      body.push(l.trim().replace(/\s+/g, ' ').replace(/\s*testId=\S+/g, ''));
    }
    out.push({ line: i + 1, fingerprint: sha(body.join('\n')).slice(0, 16) });
  });
  return out;
}

/** The body of `component <name>` in a package directory, and the fingerprints of its drawings. */
function componentDrawings(pkgDir, name) {
  for (const f of contracts(pkgDir)) {
    const text = readFileSync(f, 'utf8');
    const start = text.search(new RegExp(`^component ${name}\\b`, 'm'));
    if (start < 0) continue;
    const startLine = text.slice(0, start).split('\n').length;
    const next = text.slice(start + 1).search(/^component /m);
    const endLine = next < 0 ? Infinity : text.slice(0, start + 1 + next).split('\n').length;
    return drawings(f).filter((d) => d.line > startLine && d.line < endLine).map((d) => d.fingerprint);
  }
  return null;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function lockOf(design, brand) {
  return {
    registry: sha(JSON.stringify(brand)),
    assets: Object.fromEntries(brand.assets.map((a) => [a.id, componentDrawings(resolve(design, a.dir), a.component) ?? []])),
  };
}

const SIZE = '1280x900';
/** The playground's Brand page drawn once: its screenshot and each asset cell's box in it. */
function renderBrand(play, brand, out) {
  const ids = brand.assets.flatMap((a) => ['light', 'dark'].map((s) => `brand-${a.id}-${s}`));
  const shot = join(out, 'brand-page.png');
  const ops = ['clock data', 'type page brand', 'clock settle', ...ids.map((i) => `layout ${i}`), `screenshot ${shot}`];
  const r = spawnSync('bun', ['exact.mjs', 'agent', 'web', '--json', '--size', SIZE, ...ops], { cwd: play, encoding: 'utf8', maxBuffer: 1 << 30 });
  const rects = {};
  const find = (o) => {
    if (!o || typeof o !== 'object') return;
    if (ids.includes(o.testId) && o.space?.viewport) rects[o.testId] = o.space.viewport;
    for (const v of Object.values(o)) if (typeof v === 'object') find(v);
  };
  for (const line of (r.stdout ?? '').split('\n')) {
    try { find(JSON.parse(line)); } catch {}
  }
  if (!existsSync(shot) || ids.some((i) => !rects[i])) throw new Error(`brand: the Brand page did not draw every asset (${ids.filter((i) => !rects[i]).join(', ') || 'no screenshot'})`);
  return { shot, rects, ids };
}
const cropOf = (r) => `${Math.round(r.w)}x${Math.round(r.h)}+${Math.round(r.x)}+${Math.round(r.y)}`;

function capture(play, design, brand) {
  const out = mkdtempSync(join(tmpdir(), 'brand-'));
  const { shot, rects, ids } = renderBrand(play, brand, out);
  const dir = join(design, 'brand-references');
  mkdirSync(dir, { recursive: true });
  const refs = {};
  for (const id of ids) {
    const to = join(dir, `${id}.png`);
    spawnSync('magick', [`${shot}[${cropOf(rects[id])}]`, '+repage', '-strip', to]);
    refs[id] = sha(readFileSync(to));
  }
  rmSync(out, { recursive: true, force: true });
  return refs;
}

function look(play, design) {
  const brand = readJson(join(design, 'brand.json'));
  const lock = readJson(join(design, 'brand.lock'));
  const out = mkdtempSync(join(tmpdir(), 'brand-look-'));
  const { shot, rects, ids } = renderBrand(play, brand, out);
  const bad = [];
  for (const id of ids) {
    const ref = join(design, 'brand-references', `${id}.png`);
    if (!existsSync(ref) || sha(readFileSync(ref)) !== lock.references?.[id]) { bad.push(`${id}: no registered reference`); continue; }
    const r = rects[id];
    const now = join(out, `${id}.png`);
    spawnSync('magick', [`${shot}[${cropOf(r)}]`, '+repage', '-strip', now]);
    const c = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '8%', ref, now, join(out, `${id}.diff.png`)], { encoding: 'utf8' });
    const differing = Number.parseFloat((c.stderr || '').trim().split(/\s/)[0]);
    const share = differing / (r.w * r.h);
    if (!Number.isFinite(share)) bad.push(`${id}: drawn at another size than its reference`);
    else if (share > 0.005) bad.push(`${id}: ${(share * 100).toFixed(2)}% of its pixels differ from the registered reference`);
  }
  if (!bad.length) rmSync(out, { recursive: true, force: true });
  return { bad, out };
}

function register(design, recordPath, draftPath, play) {
  // The Distiller run's ownership record (distill.mjs writes <run>/ownership.json): the doors it passed.
  const record = readJson(recordPath);
  const draft = readJson(draftPath);
  const domain = String(draft.owner?.domain ?? '').toLowerCase();
  const refuse = (why) => {
    console.error(`${RULE}: ${why}`);
    process.exit(1);
  };
  const doors = record.doors ?? {};
  const checks = doors.checks ?? [];
  // Section 14: the party proved the domain. provider: authenticated and the domain proved at the provider; dns-txt:
  // the domain's TXT record; first-party: the operator's own brand, on its own list. A guest draft never registers.
  const proved =
    (doors.mode === 'provider' && checks.some((c) => c.door === 'domain' && c.domain === domain)) ||
    (doors.mode === 'dns-txt' && checks.some((c) => c.door === 'dns-txt' && c.domain === domain)) ||
    (doors.mode === 'first-party' && checks.some((c) => c.door === 'first-party' && (c.domains ?? []).includes(domain)));
  if (!domain) refuse('the registry names no owner domain');
  if (!proved) refuse(`the Distiller record ${record.id ?? '(no id)'} does not prove ${domain} (doors: ${doors.mode ?? 'none'})`);
  for (const a of draft.assets ?? []) {
    if (!componentDrawings(resolve(design, a.dir), a.component)) refuse(`${a.id}: no component ${a.component} in ${a.dir}`);
  }
  const brand = { ...draft, owner: { ...draft.owner, proof: { record: record.id, mode: doors.mode, at: record.at } } };
  writeFileSync(join(design, 'brand.json'), `${JSON.stringify(brand, null, 2)}\n`);
  const lock = lockOf(design, brand);
  if (play) lock.references = capture(play, design, brand);
  writeFileSync(join(design, 'brand.lock'), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`brand: registered ${brand.assets.length} assets for ${domain} (Distiller record ${record.id}, ${doors.mode})`);
}

export function check(dir, design = dir) {
  const findings = [];
  const say = (where, what) => findings.push(`${where}: ${what}`);
  const brandFile = join(design, 'brand.json');
  const iconsFile = join(design, 'icons.json');
  const brand = existsSync(brandFile) ? readJson(brandFile) : { assets: [] };
  // Before the first registration, brand.draft.json names the set the Distiller will register: its packages are set
  // aside (and said so), nothing else is.
  const draftFile = join(design, 'brand.draft.json');
  const pending = !existsSync(brandFile) && existsSync(draftFile) ? readJson(draftFile).assets ?? [] : [];
  if (pending.length) console.log(`brand: pending registration by the Distiller: ${pending.map((a) => a.id).join(', ')} (${[...new Set(pending.map((a) => a.dir))].join(', ')} set aside)`);
  const icons = existsSync(iconsFile) ? readJson(iconsFile) : {};
  const iconPrints = new Set(Object.values(icons));
  const own = new Map(); // fingerprint → asset id
  // An asset's package, and the brand's own places it names in `also` (its proof app, say).
  const registeredDirs = [...brand.assets, ...pending].flatMap((a) => [a.dir, ...(a.also ?? [])]).map((d) => resolve(design, d));
  if (existsSync(brandFile)) {
    const lockFile = join(design, 'brand.lock');
    if (!existsSync(lockFile)) say(relative(dir, brandFile) || 'brand.json', 'has no brand.lock: only `brand.mjs register` writes the registry');
    else {
      const lock = readJson(lockFile);
      const now = lockOf(design, brand);
      if (lock.registry !== now.registry) say('brand.json', 'changed without a registration (its hash is not brand.lock\'s)');
      for (const a of brand.assets) {
        if (JSON.stringify(lock.assets?.[a.id] ?? []) !== JSON.stringify(now.assets[a.id])) say(`${a.dir}#${a.component}`, `the registered ${a.id} is drawn differently from its registration`);
        for (const f of now.assets[a.id]) own.set(f, a.id);
      }
      // References live in the design repo; an app's vendored copy has none to compare.
      if (existsSync(join(design, 'brand-references'))) for (const [id, h] of Object.entries(lock.references ?? {})) {
        const ref = join(design, 'brand-references', `${id}.png`);
        if (!existsSync(ref) || sha(readFileSync(ref)) !== h) say(`brand-references/${id}.png`, 'is not the registered reference (only register captures references)');
      }
    }
  }
  const words = brand.assets.flatMap((a) => (a.words ?? []).map((w) => [w.toLowerCase(), a]));
  const files = [...contracts(dir), ...(existsSync(join(dir, 'samples.json')) ? [join(dir, 'samples.json')] : [])];
  for (const f of files) {
    const inRegistered = registeredDirs.some((d) => resolve(f).startsWith(`${d}/`));
    const rel = relative(dir, f);
    if (f.endsWith('.contract') && !inRegistered) {
      for (const d of drawings(f)) {
        const asset = own.get(d.fingerprint);
        if (asset) say(`${rel}:${d.line}`, `draws the registered ${asset} itself: use its component from the brand package`);
        else if (!iconPrints.has(d.fingerprint)) say(`${rel}:${d.line}`, `draws an SVG that is not registered (${d.fingerprint}): a brand's mark comes from its brand package; any other drawing is registered as an icon: bun tools/brand.mjs icon <design dir> <name> ${rel}:${d.line}`);
      }
    }
    if (inRegistered) continue;
    const text = readFileSync(f, 'utf8').toLowerCase();
    const lines = text.split('\n');
    for (const [w, a] of words) {
      // The words on a line that calls the registered component are that asset's own label.
      const at = lines.findIndex((l) => l.includes(w) && !l.trim().startsWith('//') && !l.includes(`${a.component.toLowerCase()}(`));
      if (at >= 0) say(`${rel}:${at + 1}`, `says "${w}", the words of the registered ${a.id}: use ${a.component} from ${a.package}`);
    }
  }
  return findings;
}

function icon(design, name, where) {
  const [file, line] = where.split(':');
  const d = drawings(resolve(design, file)).find((x) => x.line === Number(line));
  if (!d) {
    console.error(`brand: no svg at ${where}`);
    process.exit(1);
  }
  const iconsFile = join(design, 'icons.json');
  const icons = existsSync(iconsFile) ? readJson(iconsFile) : {};
  icons[name] = d.fingerprint;
  writeFileSync(iconsFile, `${JSON.stringify(Object.fromEntries(Object.entries(icons).sort()), null, 2)}\n`);
  console.log(`brand: icon ${name} = ${d.fingerprint}`);
}

if (import.meta.main) {
  const [cmd, dir, ...rest] = process.argv.slice(2);
  const opt = (k) => {
    const i = rest.indexOf(k);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (cmd === 'register' && dir) register(resolve(dir), opt('--record'), opt('--brand'), opt('--playground') && resolve(opt('--playground')));
  else if (cmd === 'look' && dir) {
    const { bad, out } = look(resolve(dir), resolve(opt('--design') ?? join(dir, '..', 'accord')));
    if (bad.length) {
      console.error(`${RULE}\n${bad.join('\n')}\n(the crops and diffs: ${out})`);
      process.exit(1);
    }
    console.log('brand: every registered asset draws as registered, light and dark');
  }
  else if (cmd === 'icon' && dir && rest.length >= 2) icon(resolve(dir), rest[0], rest[1]);
  else if (cmd === 'check' && dir) {
    const findings = check(resolve(dir), resolve(opt('--design') ?? dir));
    if (findings.length) {
      console.error(`${RULE}\n${findings.join('\n')}`);
      process.exit(1);
    }
    console.log(`brand: ${basename(resolve(dir))}: marks and provider buttons only from their registered components`);
  } else {
    console.error('usage: bun tools/brand.mjs register|check|icon … (see the header)');
    process.exit(2);
  }
}
