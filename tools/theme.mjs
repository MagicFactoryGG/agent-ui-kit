#!/usr/bin/env bun
// A Theme is configuration: one token file (theme.json) that a relying party edits. This tool checks it
// and writes what each kind of app reads from it:
//   theme.forma   the Exact package's design (tokens named theme.…), for Exact apps
//   theme.css     CSS custom properties with light-dark(), for any web app
//   tailwind.css  a Tailwind v4 `@theme inline` block over theme.css, for React apps
//
//   bun tools/theme.mjs build <theme.json> <theme package dir>   write the three files
//   bun tools/theme.mjs check <theme.json> <theme package dir>   fail when the file is wrong or the three are stale
//   bun tools/theme.mjs from-distiller <distilled.json> <design dir> [--base <theme.json>] [--apply-proposed]
//                                       the Distiller's output (brand-intake/theme@1) as theme.json (Harmonised) and
//                                       presets/<app>.json (each app as it is today). A pair under 4.5:1 stays as the
//                                       brand has it and is listed in $open (an owner decision); --apply-proposed
//                                       takes the Distiller's proposals and derives the rest, each listed in $derived
//
// Rules it holds (each a failing check, never prose):
//   - every colour has a light and a dark value; a token with one value fails;
//   - every name the components read is present (REQUIRED below), and no unknown group;
//   - text pairs reach 4.5:1 in both modes (PAIRS below);
//   - lengths are px numbers, durations ms numbers, easings CSS keywords or cubic-bezier().
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RULE = 'REFUSED by theme check (agent-ui-kit starter/README.md, "Theme")';

export const REQUIRED = {
  color: [
    'page', 'surface', 'raised', 'ink', 'ink-muted', 'line', 'fill', 'hover',
    'accent', 'accent-ink', 'focus', 'positive', 'caution', 'critical', 'critical-ink',
    'positive-text', 'caution-text', 'critical-text',
  ],
  type: ['title', 'heading', 'body', 'label', 'caption'],
  space: ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'],
  radius: ['control', 'card', 'pill'],
  line: ['width'],
  motion: ['fast', 'base'],
};

// Foreground on background, both modes: at least 4.5:1 (WCAG 2.2, 1.4.3, normal text).
export const PAIRS = [
  ['ink', 'page'], ['ink', 'surface'], ['ink', 'raised'], ['ink-muted', 'surface'], ['ink-muted', 'page'],
  ['accent-ink', 'accent'], ['critical-ink', 'critical'],
  // Status as words has its own colours: a fill (positive, caution, critical) need not read as text, and one red
  // cannot both carry white words and read as words on a dark page.
  ['positive-text', 'surface'], ['caution-text', 'surface'], ['critical-text', 'surface'],
  ['positive-text', 'page'], ['caution-text', 'page'], ['critical-text', 'page'],
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const EASING = /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\))$/;
const FAMILY = /^[A-Za-z0-9 ,"'-]+$/;

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Every problem in one pass, each one line: where, what, what to do.
export function problems(theme) {
  const out = [];
  const say = (where, what) => out.push(`${where}: ${what}`);
  if (typeof theme !== 'object' || theme === null) return ['theme.json: not a JSON object'];
  if (typeof theme.name !== 'string' || theme.name.trim() === '') say('name', 'give the theme a name');
  for (const group of Object.keys(theme)) {
    if (group !== 'name' && !group.startsWith('$') && group !== 'family' && group !== 'fonts' && group !== 'options' && !(group in REQUIRED)) say(group, `unknown group; the groups are name, family, ${Object.keys(REQUIRED).join(', ')}`);
  }
  if (typeof theme.family !== 'string' || !FAMILY.test(theme.family)) say('family', 'a font stack such as "system-ui, sans-serif"');
  for (const [group, names] of Object.entries(REQUIRED)) {
    const g = theme[group];
    if (typeof g !== 'object' || g === null) { say(group, 'missing'); continue; }
    for (const name of names) if (!(name in g)) say(`${group}.${name}`, 'missing: the components read it');
    for (const [name, v] of Object.entries(g)) {
      const at = `${group}.${name}`;
      if (!/^[a-z][a-z0-9-]*$/.test(name)) { say(at, 'a name is lower case letters, digits and hyphens'); continue; }
      if (group === 'color') {
        if (typeof v !== 'object' || v === null || !('light' in v) || !('dark' in v)) {
          say(at, 'needs a light and a dark value ({"light": "#…", "dark": "#…"}); light and dark are built in everywhere');
          continue;
        }
        for (const mode of ['light', 'dark']) if (!HEX.test(String(v[mode]))) say(`${at}.${mode}`, `"${v[mode]}" is not a hex colour`);
      } else if (group === 'type') {
        if (typeof v !== 'object' || v === null) { say(at, 'needs size (px), weight and line'); continue; }
        if (!(Number.isFinite(v.size) && v.size >= 9 && v.size <= 96)) say(`${at}.size`, 'a px number from 9 to 96');
        if (!([100, 200, 300, 400, 500, 600, 700, 800, 900].includes(v.weight))) say(`${at}.weight`, 'a weight from 100 to 900, in hundreds');
        if (!(Number.isFinite(v.line) && v.line >= 1 && v.line <= 2)) say(`${at}.line`, 'a line height from 1 to 2 (a multiple of the size)');
      } else if (group === 'motion') {
        if (typeof v !== 'object' || v === null) { say(at, 'needs duration (ms) and easing'); continue; }
        if (!(Number.isInteger(v.duration) && v.duration >= 0 && v.duration <= 2000)) say(`${at}.duration`, 'whole ms from 0 to 2000');
        if (!EASING.test(String(v.easing))) say(`${at}.easing`, 'linear, ease, ease-in, ease-out, ease-in-out or cubic-bezier(a, b, c, d)');
      } else if (!(Number.isFinite(v) && v >= 0 && v <= 999)) {
        say(at, 'a px number from 0 to 999');
      }
    }
  }
  // Option groups: each choice a name and what it changes (family, type, space, radius, line); the first is the
  // theme's own. The playground gives each group a dropdown (a mode axis).
  for (const [group, choices] of Object.entries(theme.options ?? {})) {
    if (typeof choices !== 'object' || Object.keys(choices).length < 2) { say(`options.${group}`, 'two or more choices, the first being the theme\'s own ({})'); continue; }
    for (const [choice, change] of Object.entries(choices)) {
      for (const key of Object.keys(change ?? {})) if (!['family', 'type', 'space', 'radius', 'line'].includes(key)) say(`options.${group}.${choice}.${key}`, 'an option changes family, type, space, radius or line');
    }
  }
  for (const [family, faces] of Object.entries(theme.fonts ?? {})) {
    if (!/^[A-Za-z0-9 -]+$/.test(family)) say(`fonts.${family}`, 'a family name is letters, digits, spaces and hyphens');
    for (const [weight, file] of Object.entries(faces ?? {})) {
      if (!/^[1-9]00( italic)?$/.test(weight)) say(`fonts.${family}.${weight}`, 'a face is a weight (400, 600) or a weight and italic ("400 italic")');
      if (!/^[\w.-]+\.(ttf|otf)$/.test(String(file))) say(`fonts.${family}.${weight}`, 'a TTF or OTF file name in the theme package\'s assets/fonts/');
    }
  }
  const c = theme.color ?? {};
  for (const [fg, bg] of PAIRS) {
    for (const mode of ['light', 'dark']) {
      const a = c[fg]?.[mode];
      const b = c[bg]?.[mode];
      if (!HEX.test(String(a)) || !HEX.test(String(b))) continue;
      const r = contrast(a, b);
      const open = (theme.$open ?? []).some((o) => o.pair === `${fg} on ${bg}` && o.mode === mode);
      if (r < 4.5 && !open) say(`color.${fg} on color.${bg} (${mode})`, `${r.toFixed(2)}:1, under 4.5:1; change one of the two, or list it in $open (not decided yet)`);
    }
  }
  return out;
}

const px = (n) => `${n}px`;
// Type sizes are px on purpose: the same look on every host. Measured at Exact 51002ee77: a rem is 16px on the
// web and 13px on macOS, so a 20px title in rem draws 16.25px on a Mac. Exact warns of px type (forma-type-fixed):
// it does not follow the person's text size. That is the price of parity, recorded here, not hidden.
const HEADER = (kind) => `${kind} Generated by agent-ui-kit tools/theme.mjs from theme.json. Do not edit: edit theme.json and run the build.`;
const pairOf = Object.fromEntries(PAIRS.map(([fg, bg]) => [fg, bg]));

export function forma(t) {
  const lines = [`// ${HEADER('').trim()}`, `// Theme: ${t.name}`, 'forma theme', '', 'theme'];
  for (const [name, v] of Object.entries(t.color)) {
    const pair = pairOf[name] ? `  pair=theme.color.${pairOf[name]}` : '';
    lines.push(`  theme.color.${name} = light-dark(${v.light}, ${v.dark})${pair}`);
  }
  lines.push(`  theme.family: family = ${t.family}`);
  for (const [name, v] of Object.entries(t.type)) lines.push(`  theme.type.${name}: type = ${v.weight} ${px(v.size)}/${v.line} ${t.family}`);
  for (const group of ['space', 'radius', 'line']) for (const [name, v] of Object.entries(t[group])) lines.push(`  theme.${group}.${name}: length = ${px(v)}`);
  for (const [name, v] of Object.entries(t.motion)) {
    lines.push(`  theme.motion.${name}: duration = ${v.duration}ms`);
    lines.push(`  theme.motion.${name}-easing: easing = ${v.easing}`);
  }
  return `${lines.join('\n')}\n`;
}

export function css(t) {
  const v = [];
  for (const [name, c] of Object.entries(t.color)) v.push(`  --theme-color-${name}: light-dark(${c.light}, ${c.dark});`);
  v.push(`  --theme-family: ${t.family};`);
  for (const [name, x] of Object.entries(t.type)) {
    v.push(`  --theme-type-${name}-size: ${px(x.size)};`, `  --theme-type-${name}-weight: ${x.weight};`, `  --theme-type-${name}-line: ${x.line};`);
  }
  for (const group of ['space', 'radius', 'line']) for (const [name, x] of Object.entries(t[group])) v.push(`  --theme-${group}-${name}: ${px(x)};`);
  for (const [name, m] of Object.entries(t.motion)) v.push(`  --theme-motion-${name}: ${m.duration}ms;`, `  --theme-motion-${name}-easing: ${m.easing};`);
  return [
    `/* ${HEADER('').trim()} */`,
    `/* Theme: ${t.name}. Light and dark follow the system; .light or .dark on an element picks one (setScheme in Exact). */`,
    ':root {',
    '  color-scheme: light dark;',
    ...v,
    '}',
    '.light, [data-scheme="light"] { color-scheme: light; }',
    '.dark, [data-scheme="dark"] { color-scheme: dark; }',
    '',
  ].join('\n');
}

export function tailwind(t) {
  const v = [];
  for (const name of Object.keys(t.color)) v.push(`  --color-${name}: var(--theme-color-${name});`);
  v.push('  --font-sans: var(--theme-family);');
  for (const name of Object.keys(t.type)) {
    v.push(`  --text-${name}: var(--theme-type-${name}-size);`, `  --text-${name}--line-height: var(--theme-type-${name}-line);`, `  --text-${name}--font-weight: var(--theme-type-${name}-weight);`);
  }
  for (const name of Object.keys(t.space)) v.push(`  --spacing-${name}: var(--theme-space-${name});`);
  for (const name of Object.keys(t.radius)) v.push(`  --radius-${name}: var(--theme-radius-${name});`);
  for (const name of Object.keys(t.motion)) v.push(`  --ease-${name}: var(--theme-motion-${name}-easing);`);
  return [
    `/* ${HEADER('').trim()} */`,
    '/* Tailwind v4: import theme.css first, then this file. Utilities: bg-page, text-ink, rounded-card, p-lg, text-body. */',
    '@theme inline {',
    ...v,
    '}',
    '',
  ].join('\n');
}

// The brand's own faces, bundled: Exact draws a family the same on every host only when the app ships its files, under
// the app's own assets/fonts/ (vendor.mjs and the playground copy them there).
const FONTS_OPEN = '// <fonts> generated from theme.json by tools/theme.mjs: the brand\'s own faces, bundled, so every host draws them.';
const FONTS_CLOSE = '// </fonts>';
export function fontBlock(theme) {
  const lines = [FONTS_OPEN];
  // Option groups: each choice a name and what it changes (family, type, space, radius, line); the first is the
  // theme's own. The playground gives each group a dropdown (a mode axis).
  for (const [group, choices] of Object.entries(theme.options ?? {})) {
    if (typeof choices !== 'object' || Object.keys(choices).length < 2) { say(`options.${group}`, 'two or more choices, the first being the theme\'s own ({})'); continue; }
    for (const [choice, change] of Object.entries(choices)) {
      for (const key of Object.keys(change ?? {})) if (!['family', 'type', 'space', 'radius', 'line'].includes(key)) say(`options.${group}.${choice}.${key}`, 'an option changes family, type, space, radius or line');
    }
  }
  for (const [family, faces] of Object.entries(theme.fonts ?? {})) {
    lines.push(`font "${family}"`);
    for (const [weight, file] of Object.entries(faces)) lines.push(`  ${weight} = "assets/fonts/${file}"`);
  }
  lines.push(FONTS_CLOSE);
  return lines.join('\n');
}
export function withFonts(index, theme) {
  const block = fontBlock(theme);
  const a = index.indexOf(FONTS_OPEN);
  const b = index.indexOf(FONTS_CLOSE);
  if (a >= 0 && b > a) return index.slice(0, a) + block + index.slice(b + FONTS_CLOSE.length);
  const at = index.search(/^(fn|component) /m);
  return at < 0 ? `${index}\n${block}\n` : `${index.slice(0, at)}${block}\n\n${index.slice(at)}`;
}

export function outputs(theme) {
  return { 'theme.forma': forma(theme), 'theme.css': css(theme), 'tailwind.css': tailwind(theme) };
}

export function load(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { __error: `${file}: ${error.message}` };
  }
}

// ---- the Distiller's output (agent-ui-kit tools/distiller, brand-intake/theme@1): shadcn's names to the Theme's

export const FROM_SHADCN = {
  page: 'color.background', surface: 'color.card', raised: 'color.popover', ink: 'color.foreground',
  'ink-muted': 'color.muted-foreground', line: 'color.border', fill: 'color.muted', hover: 'color.accent',
  accent: 'color.primary', 'accent-ink': 'color.primary-foreground', focus: 'color.ring', positive: 'color.success',
  caution: 'color.warning', critical: 'color.destructive', 'critical-ink': 'color.destructive-foreground',
  'positive-text': 'color.success-text', 'caution-text': 'color.warning-text', 'critical-text': 'color.destructive-text',
};

const hex6 = (h) => { let x = h.slice(1); if (x.length === 3) x = [...x].map((c) => c + c).join(''); return `#${x.slice(0, 6).toLowerCase()}`; };
const mix = (a, b, t) => { const [p, q] = [rgb(a), rgb(b)]; return `#${p.map((c, i) => Math.round((c + (q[i] - c) * t) * 255).toString(16).padStart(2, '0')).join('')}`; };

// The nearest value that reaches 4.5:1, by stepping a colour toward black or white (its hue kept).
function reach(fg, bg, move) {
  const toward = move === 'fg' ? (luminance(bg) > 0.18 ? '#000000' : '#ffffff') : (luminance(fg) > 0.18 ? '#000000' : '#ffffff');
  for (let t = 0.02; t <= 1; t += 0.02) {
    const next = mix(move === 'fg' ? fg : bg, toward, t);
    if (contrast(move === 'fg' ? next : fg, move === 'fg' ? bg : next) >= 4.5) return next;
  }
  return toward;
}

function colours(tokens) {
  const out = {};
  for (const [mine, theirs] of Object.entries(FROM_SHADCN)) {
    const v = tokens[theirs];
    if (v) out[mine] = { light: hex6(v.light), dark: hex6(v.dark) };
  }
  return out;
}

export function fromDistiller(d, base, { applyProposed = false } = {}) {
  if (d.$schema !== 'brand-intake/theme@1') throw new Error(`not the Distiller's output (brand-intake/theme@1): ${d.$schema}`);
  const derived = [];
  const tokens = Object.fromEntries(Object.entries(d.tokens).map(([k, v]) => [k, { light: v.light, dark: v.dark }]));
  // The Distiller decides contrast as a system: its values already carry each fix, and `decided` says why.
  for (const [k, v] of Object.entries(d.tokens)) {
    for (const x of v.decided ?? []) derived.push(`${k} (${x.mode}): ${x.was} → ${x.now}. The Distiller: ${x.why}`);
  }
  for (const [k, v] of Object.entries(applyProposed ? d.tokens : {})) {
    for (const p of v.proposed ?? []) {
      tokens[p.token][p.mode] = p.value;
      derived.push(`color ${p.token} (${p.mode}) = ${p.value}: the Distiller's proposal (${p.contrast}:1${p.note ? `, ${p.note}` : ''}); was ${d.tokens[p.token][p.mode]}`);
    }
    void k;
  }
  const color = { ...base.color, ...colours(tokens) };
  // A pair under 4.5:1 stays as the brand has it, listed as an owner decision, unless asked to change it. Asked:
  // text on a surface first (the text moves), then words on a fill: the fill moves, unless that breaks a text pair
  // already settled, and then the words become black or white, whichever reads.
  const open = [];
  const ordered = [...PAIRS.filter(([fg]) => !fg.endsWith('-ink')), ...PAIRS.filter(([fg]) => fg.endsWith('-ink'))];
  for (const [fg, bg] of ordered) {
    for (const mode of ['light', 'dark']) {
      const [a, b] = [color[fg][mode], color[bg][mode]];
      if (contrast(a, b) >= 4.5) continue;
      if (!applyProposed) {
        const proposal = Object.values(d.tokens).flatMap((t) => t.proposed ?? []).find((p) => p.mode === mode && [`color.${FROM_SHADCN[fg]?.slice(6)}`, `color.${FROM_SHADCN[bg]?.slice(6)}`].includes(p.token));
        open.push({ pair: `${fg} on ${bg}`, mode, contrast: +contrast(a, b).toFixed(2), proposal: proposal ? `${proposal.token} = ${proposal.value} (${proposal.contrast}:1)` : 'none from the Distiller' });
        continue;
      }
      const fill = fg.endsWith('-ink');
      if (fill) {
        const next = reach(a, b, 'bg');
        const breaks = PAIRS.filter(([f, g]) => !f.endsWith('-ink') && (f === bg || g === bg)).some(([f, g]) => contrast(f === bg ? next : color[f][mode], g === bg ? next : color[g][mode]) < 4.5);
        if (!breaks) {
          derived.push(`color ${bg} (${mode}) = ${next}: derived so ${fg} on ${bg} reaches 4.5:1 (was ${b}, ${contrast(a, b).toFixed(2)}:1)`);
          color[bg] = { ...color[bg], [mode]: next };
          continue;
        }
        const ink = contrast('#000000', b) >= contrast('#ffffff', b) ? '#000000' : '#ffffff';
        derived.push(`color ${fg} (${mode}) = ${ink}: ${bg} is also text on a surface, so its words change instead (${contrast(ink, b).toFixed(2)}:1; was ${a}, ${contrast(a, b).toFixed(2)}:1)`);
        color[fg] = { ...color[fg], [mode]: ink };
        continue;
      }
      const next = reach(a, b, 'fg');
      derived.push(`color ${fg} (${mode}) = ${next}: derived so ${fg} on ${bg} reaches 4.5:1 (was ${a}, ${contrast(a, b).toFixed(2)}:1)`);
      color[fg] = { ...color[fg], [mode]: next };
    }
  }
  const family = d.tokens['font.sans']?.light?.replace(/"/g, "'") ?? base.family;
  const radius = parseFloat(d.tokens['radius.base']?.light ?? '0') * (String(d.tokens['radius.base']?.light).endsWith('rem') ? 16 : 1);
  const px = (t) => (t?.light ?? []).map((v) => parseFloat(v)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const sizes = px(d.tokens['type.sizes']);
  const type = sizes.length >= 2 ? {
    title: { ...base.type.title, size: sizes.find((n) => n >= 18) ?? sizes.at(-1) },
    heading: { ...base.type.heading, size: sizes[0] },
    body: { ...base.type.body, size: sizes[1] },
    label: { ...base.type.label, size: sizes[1] },
    caption: { ...base.type.caption, size: sizes[0] },
  } : base.type;
  const steps = px(d.tokens['space.scale']);
  const nearest = (v) => steps.reduce((best, n) => (Math.abs(n - v) < Math.abs(best - v) ? n : best), Infinity);
  const space = Object.fromEntries(Object.entries(base.space).map(([k, v]) => [k, Math.abs(nearest(v) - v) <= 2 ? nearest(v) : v]));
  const theme = {
    $label: 'Harmonised (theme.json)',
    $comment: `From the Distiller (${d.brand}, ${d.generated}): Harmonised, with each value it had to change listed in $derived.`,
    $derived: derived,
    $open: open,
    name: d.brand,
    family: FAMILY.test(family) ? family : base.family,
    color,
    type,
    space,
    radius: radius ? { ...base.radius, control: Math.max(radius - 2, 0) } : base.radius,
    line: base.line,
    motion: base.motion,
  };
  const presets = {};
  for (const [app, p] of Object.entries(d.presets?.apps ?? {})) {
    if (!p.tokens) continue;
    // As the app is today: its own colours, nothing fixed (a preset shows, it does not ship).
    presets[app] = { name: `${app} today`, $comment: `${d.brand}'s ${app} as the Distiller read it (${(p.read ?? []).join(', ')}); not checked for contrast.`, family: theme.family, color: { ...color, ...colours(p.tokens) } };
  }
  return { theme, presets };
}

function main(argv) {
  const [verb, file, dir] = argv;
  if (verb === 'from-distiller' && file && dir) {
    const baseAt = argv.indexOf('--base') > 0 ? argv[argv.indexOf('--base') + 1] : join(dir, 'theme.json');
    const base = load(baseAt);
    if (base.__error) { console.error(`theme: a base theme is needed for what the Distiller does not set: ${base.__error}`); return 2; }
    const { theme, presets } = fromDistiller(load(file), base, { applyProposed: argv.includes('--apply-proposed') });
    // What people set by hand stays: the theme's label and its bundled faces (the files are the design repo's).
    if (base.$label) { theme.$label = base.$label; theme.name = base.name ?? theme.name; }
    if (base.fonts) theme.fonts = base.fonts;
    if (base.options) theme.options = base.options;
    const found = problems(theme);
    if (found.length) {
      console.error(`${RULE}: the distilled theme has ${found.length} problem${found.length === 1 ? '' : 's'}.`);
      for (const p of found) console.error(`  ${p}`);
      return 1;
    }
    writeFileSync(join(dir, 'theme.json'), `${JSON.stringify(theme, null, 2)}\n`);
    mkdirSync(join(dir, 'presets'), { recursive: true });
    for (const [app, p] of Object.entries(presets)) {
      // A name people gave a preset ("Studio on iPhone today") is kept; the Distiller's ids are not names.
      const at = join(dir, 'presets', `${app}.json`);
      const had = existsSync(at) ? load(at) : {};
      writeFileSync(at, `${JSON.stringify({ ...p, name: had.name ?? p.name }, null, 2)}\n`);
    }
    console.log(`theme: ${theme.name} from the Distiller: theme.json (Harmonised, ${theme.$derived.length} derived value${theme.$derived.length === 1 ? '' : 's'}) and ${Object.keys(presets).length} presets (${Object.keys(presets).join(', ')})`);
    for (const x of theme.$derived) console.log(`  derived: ${x}`);
    for (const o of theme.$open) console.log(`  open, not decided: ${o.pair} (${o.mode}) ${o.contrast}:1; proposal: ${o.proposal}`);
    return 0;
  }
  if (!['build', 'check'].includes(verb) || !file || !dir) {
    console.error('usage: bun tools/theme.mjs build|check <theme.json> <theme package dir> · from-distiller <distilled.json> <design dir>');
    return 2;
  }
  const theme = load(resolve(file));
  const found = theme.__error ? [theme.__error] : problems(theme);
  if (found.length) {
    console.error(`${RULE}: ${file} has ${found.length} problem${found.length === 1 ? '' : 's'}.`);
    for (const p of found) console.error(`  ${p}`);
    console.error('Fix theme.json, then run: bun tools/theme.mjs build <theme.json> <theme package dir>');
    return 1;
  }
  const want = outputs(theme);
  if (existsSync(join(dir, 'index.contract'))) want['index.contract'] = withFonts(readFileSync(join(dir, 'index.contract'), 'utf8'), theme);
  const missing = Object.values(theme.fonts ?? {}).flatMap((faces) => Object.values(faces)).filter((f) => !existsSync(join(dir, 'assets', 'fonts', f)));
  if (missing.length) {
    console.error(`${RULE}: ${missing.join(', ')} not in ${join(dir, 'assets', 'fonts')}: put each font file there (with its licence).`);
    return 1;
  }
  if (verb === 'build') {
    mkdirSync(dir, { recursive: true });
    // Only what changes is written: a watcher (the playground's) must not see a write that changed nothing.
    for (const [name, text] of Object.entries(want)) {
      if (!existsSync(join(dir, name)) || readFileSync(join(dir, name), 'utf8') !== text) writeFileSync(join(dir, name), text);
    }
    console.log(`theme: ${theme.name}: wrote ${Object.keys(want).join(', ')} in ${dir}`);
    return 0;
  }
  const stale = Object.entries(want).filter(([name, text]) => !existsSync(join(dir, name)) || readFileSync(join(dir, name), 'utf8') !== text).map(([name]) => name);
  if (stale.length) {
    console.error(`${RULE}: ${stale.join(', ')} in ${dir} ${stale.length === 1 ? 'is' : 'are'} not what ${file} makes (edited by hand, or not rebuilt).`);
    console.error('Run: bun tools/theme.mjs build <theme.json> <theme package dir>');
    return 1;
  }
  const open = theme.$open ?? [];
  console.log(`theme: ${theme.name}: clean (light and dark, files current; ${PAIRS.length * 2 - open.length} of ${PAIRS.length * 2} text pairs at 4.5:1 or more${open.length ? `, ${open.length} not decided yet` : ''})`);
  for (const o of open) console.log(`  open, not decided: ${o.pair} (${o.mode}) ${o.contrast}:1; proposal: ${o.proposal}`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
