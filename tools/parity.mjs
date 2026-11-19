#!/usr/bin/env bun
// The parity check: each cell of the state matrix (every Screen's, and the pieces named) drawn on the web and on
// macOS, in light and dark, compared on colour, type, spacing and corners, with the numbers. It drives the
// generated playground (tools/matrix.mjs; `bun play.mjs gen` first), which filters to one cell at a time
// (the "find" field), so each node with a testId is read once on each host, and the cell's pixels compared.
//
//   bun tools/parity.mjs <playground dir> [--pieces A,B] [--rows all|resting] [--out <dir>] [--hosts web,macos]
//
// Writes <out>/parity.json and <out>/parity.md (a table per cell), screenshots per host, and exits 1 when a
// number differs beyond its tolerance: colour 2/255 per channel, type and lengths 0.5px, or more than 0.5% of a
// cell's pixels differ by more than 8%.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RULE = 'REFUSED by the parity check (agent-ui-kit starter/README.md, "Parity")';
const SIZE = '1280x900';
const TOL = { colour: 2, length: 0.5, pixels: 0.005 };

function opt(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

// The cells: from the generated app's own lines (page, row and cell ids), never guessed.
function cellsOf(app, pieces, rows) {
  const out = [];
  let page = '';
  let label = '';
  for (const line of app.split('\n')) {
    const p = /^ {6}if page == "([^"]+)"/.exec(line);
    if (p) page = p[1];
    const r = /MatrixRow\(label="([^"]*)", testId="([^"]+)"\)/.exec(line);
    if (r) label = r[1];
    const c = /(?:Matrix|Screen)Cell\(scheme="(light|dark)", testId="([^"]+)"\)/.exec(line);
    if (!c || !page) continue;
    const name = page.replace(/^(components|blocks|screens|wip)-/, '');
    const screen = page.startsWith('screens-');
    if (!screen && !pieces.includes(name)) continue;
    if (rows === 'resting' && label !== 'resting') continue;
    out.push({ page, piece: name, row: label, mode: c[1], id: c[2], nav: `nav-${page.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });
  }
  return out;
}

function agent(dir, host, ops) {
  const r = spawnSync('bun', ['exact.mjs', 'agent', host, '--json', '--size', SIZE, ...ops], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, EXACT_SHOW_SIMULATOR: '0' } });
  const replies = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
  if (r.status !== 0) throw new Error(`agent ${host} failed: ${(r.stderr || '').split('\n').filter(Boolean).slice(-3).join(' / ')}`);
  return replies;
}

const hex = (s, mode) => {
  if (s == null) return null;
  let v = String(s).trim();
  const ld = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  if (ld) v = mode === 'dark' ? ld[2] : ld[1];
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v);
  if (m) return m[4] !== undefined && Number(m[4]) === 0 ? 'transparent' : `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
  if (/^#[0-9a-f]{6}00$/i.test(v)) return 'transparent';
  if (/^#[0-9a-f]{6}/i.test(v)) return v.slice(0, 7).toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  if (v === 'transparent' || v === '#00000000') return 'transparent';
  return v;
};
const num = (s) => (s == null ? null : typeof s === 'number' ? s : Number.parseFloat(String(s)));

const COLOURS = ['text_color', 'background_color', 'border_color_top', 'border_color_left'];
const LENGTHS = ['font_size', 'padding_top', 'padding_left', 'padding_right', 'padding_bottom', 'row_gap', 'column_gap', 'border_radius_top_left', 'border_radius_bottom_right', 'border_width_top', 'border_width_left'];
const GROUP = (k) => (k.includes('color') ? 'colour' : k.startsWith('font') || k === 'line_height' ? 'type' : k.startsWith('border_radius') ? 'corners' : 'spacing');

// One node's numbers on one host.
function numbers(node, mode, text) {
  const st = node.style ?? {};
  const val = (k) => st[k]?.computed ?? st[k]?.value;
  const out = {};
  // Type and ink only where text is drawn: a container's inherited font size draws nothing (16px on the web,
  // 13px on macOS, Exact 51002ee77).
  for (const k of COLOURS) if (text || k !== 'text_color') out[k] = hex(val(k), mode);
  for (const k of LENGTHS) if (text || k !== 'font_size') out[k] = num(val(k));
  if (text) out.font_weight = num(val('font_weight'));
  const size = node.space?.local ?? node.frame;
  out.width = num(size?.w);
  out.height = num(size?.h);
  return out;
}

function compare(a, b) {
  const rows = [];
  for (const k of Object.keys(a)) {
    const [x, y] = [a[k], b[k]];
    if (x == null && y == null) continue;
    let ok;
    let delta;
    if (k.includes('color')) {
      if (x === y) { ok = true; delta = 0; } else if (/^#/.test(String(x)) && /^#/.test(String(y))) {
        const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        delta = Math.max(...p(x).map((c, i) => Math.abs(c - p(y)[i])));
        ok = delta <= TOL.colour;
      } else { ok = false; delta = null; }
    } else {
      delta = x == null || y == null ? null : Math.abs(x - y);
      ok = delta != null && delta <= (k === 'font_weight' ? 0 : TOL.length);
    }
    // A frame's size is reported, not judged: each host measures the border box its own way; the pixels decide.
    if (k === 'width' || k === 'height') ok = true;
    rows.push({ property: k, group: k === 'width' || k === 'height' ? 'size' : GROUP(k), web: x, macos: y, delta, ok });
  }
  return rows;
}

function pixels(a, b, rect, out) {
  if (!existsSync(a) || !existsSync(b) || !rect) return null;
  const crop = `${Math.round(rect.w)}x${Math.round(rect.h)}+${Math.round(rect.x)}+${Math.round(rect.y)}`;
  const r = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '8%', `${a}[${crop}]`, `${b}[${crop}]`, out], { encoding: 'utf8' });
  const differing = Number.parseFloat((r.stderr || '').trim().split(/\s/)[0]);
  if (!Number.isFinite(differing)) return null;
  return { differing, share: differing / (rect.w * rect.h) };
}

function main(argv) {
  const dir = argv[0] && resolve(argv[0]);
  if (!dir || !existsSync(join(dir, 'app.contract'))) {
    console.error('usage: bun tools/parity.mjs <playground dir> [--pieces A,B] [--rows all|resting] [--out <dir>] [--hosts web,macos]');
    return 2;
  }
  const pieces = opt(argv, '--pieces', '').split(',').filter(Boolean);
  const rows = opt(argv, '--rows', 'resting');
  const hosts = opt(argv, '--hosts', 'web,macos').split(',');
  const out = resolve(opt(argv, '--out', join(dir, '.exact', 'parity')));
  mkdirSync(out, { recursive: true });
  const cells = cellsOf(readFileSync(join(dir, 'app.contract'), 'utf8'), pieces, rows);
  if (!cells.length) { console.error('parity: no cells match'); return 2; }

  // 1. Which nodes each cell has (the web's tree; both hosts draw the same plan).
  const shown = (c) => [`tap ${c.nav}`, `type find ${c.id}`, 'clock data', 'clock settle'];
  const trees = agent(dir, 'web', ['clock data', ...cells.flatMap((c) => [...shown(c), `tree ${c.id}`])]).filter((r) => r.nodes);
  cells.forEach((c, i) => {
    const ids = (trees[i]?.nodes ?? []).map((n) => n.props?.testId).filter(Boolean);
    c.targets = [...new Set(ids)];
  });

  // 2. Each host: the cell alone, its screenshot, every node's layout.
  const seen = {};
  for (const host of hosts) {
    mkdirSync(join(out, host), { recursive: true });
    const ops = ['clock data', ...cells.flatMap((c) => [...shown(c), `screenshot ${join(out, host, `${c.id}.png`)}`, ...c.targets.map((t) => `layout ${t}`)])];
    const replies = agent(dir, host, ops).filter((r) => r.node);
    seen[host] = replies.map((r) => r.node);
  }

  // 3. Compare, node by node.
  const report = [];
  let k = 0;
  for (const c of cells) {
    const nodes = c.targets.map((t) => ({ t, web: seen.web?.[k], macos: seen.macos?.[k++] }));
    const lines = [];
    let rect = null;
    for (const n of nodes) {
      if (!n.web || !n.macos) continue;
      if (n.t === c.id) rect = n.web.space?.viewport;
      const text = n.web.type === 'Text';
      for (const r of compare(numbers(n.web, c.mode, text), numbers(n.macos, c.mode, text))) lines.push({ node: n.t, ...r });
    }
    const px = pixels(join(out, 'web', `${c.id}.png`), join(out, 'macos', `${c.id}.png`), rect, join(out, `${c.id}.diff.png`));
    const bad = lines.filter((l) => !l.ok);
    report.push({ cell: c.id, piece: c.piece, row: c.row, mode: c.mode, compared: lines.length, differing: bad.length, pixels: px, lines });
  }
  writeFileSync(join(out, 'parity.json'), `${JSON.stringify(report, null, 2)}\n`);
  const md = ['# Parity: web and macOS', '', `Size ${SIZE}. Tolerance: colour ${TOL.colour}/255 per channel, lengths ${TOL.length}px, pixels ${TOL.pixels * 100}% over 8%.`, '',
    '| Cell | Mode | Numbers compared | Differ | Colour | Type | Spacing | Corners | Pixels differing |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of report) {
    const g = (name) => { const l = r.lines.filter((x) => x.group === name); return `${l.filter((x) => x.ok).length}/${l.length}`; };
    md.push(`| ${r.piece} · ${r.row} | ${r.mode} | ${r.compared} | ${r.differing} | ${g('colour')} | ${g('type')} | ${g('spacing')} | ${g('corners')} | ${r.pixels ? `${(r.pixels.share * 100).toFixed(2)}%` : 'n/a'} |`);
  }
  const worst = report.flatMap((r) => r.lines.filter((l) => !l.ok).map((l) => ({ cell: r.cell, ...l })));
  if (worst.length) {
    md.push('', '## Numbers that differ', '', '| Cell | Node | Property | Web | macOS | Δ |', '|---|---|---|---|---|---|');
    for (const w of worst.slice(0, 200)) md.push(`| ${w.cell} | ${w.node} | ${w.property} | ${w.web} | ${w.macos} | ${w.delta ?? '–'} |`);
  }
  writeFileSync(join(out, 'parity.md'), `${md.join('\n')}\n`);
  const pxBad = report.filter((r) => r.pixels && r.pixels.share > TOL.pixels);
  console.log(`parity: ${report.length} cells, ${report.reduce((s, r) => s + r.compared, 0)} numbers, ${worst.length} differ; ${pxBad.length} cells over the pixel tolerance. ${join(out, 'parity.md')}`);
  if (worst.length || pxBad.length) {
    console.error(`${RULE}: web and macOS differ. Read ${join(out, 'parity.md')}; fix the piece (or report an Exact gap), never the numbers.`);
    return 1;
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
