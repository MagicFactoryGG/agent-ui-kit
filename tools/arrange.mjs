#!/usr/bin/env bun
// Promote an arrangement made on the playground's Arrange page into the design repo, as a new Block or Screen.
//
//   bun tools/arrange.mjs promote <design dir> <playground dir> <Name> --as block|screen --spec "<layout>|Piece:cell,…"
//
// The spec is the Arrange page's line (or its readArrangement tool's answer). The new component draws, in order, each
// piece in the state chosen on the page: as a Screen, inside the chosen layout; as a Block, in a column. Each piece's
// words, values and actions become the new component's props (<piece><n>_<prop>), and their samples go into the
// playground's samples.json, so the playground shows it at once. A piece's enum props are fixed to the chosen state,
// except a state axis (interaction, outcome, data, agent) that every piece having it declares with the same values:
// that one is the new component's own. A Block must keep at least one axis (the matrix rule); without one, promote it
// as a Screen. Then `bun run check` in the design repo judges it like any piece, and a person looks at it at 390 px.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { AXES, cellName, cells, pieces } from './matrix.mjs';

const RULE = 'REFUSED by arrange (agent-ui-kit ARRANGE: arrangement is made in the playground and promoted)';
const refuse = (why) => {
  console.error(`${RULE}: ${why}`);
  process.exit(1);
};
const enumValues = (type) => {
  const m = /^enum<(.+)>$/.exec(type);
  return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : null;
};
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

export function promote(designDir, playDir, name, as, spec) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name ?? '')) refuse('the name is a component name: PascalCase, letters and digits');
  if (!['block', 'screen'].includes(as)) refuse('--as is block or screen');
  const [layoutName, list = ''] = String(spec ?? '').split('|');
  const items = list.split(',').filter(Boolean).map((x) => {
    const at = x.indexOf(':');
    return { piece: x.slice(0, at), cell: x.slice(at + 1) };
  });
  if (!items.length) refuse('the arrangement has no pieces');

  const all = ['components', 'blocks', 'screens'].flatMap((l) => (existsSync(join(designDir, l)) ? pieces(join(designDir, l)) : []));
  const wip = join(playDir, 'wip');
  if (existsSync(join(wip, 'package.json'))) all.push(...pieces(wip));
  const byName = new Map(all.map((p) => [p.name, p]));
  const shapeHome = new Map(all.flatMap((p) => Object.keys(p.shapes ?? {}).map((s) => [s, p.pkg])));
  const layout = as === 'screen' ? byName.get(layoutName) : null;
  if (as === 'screen' && (!layout || !layout.slot)) refuse(`${layoutName} is not a layout with a slot`);
  if (byName.has(name)) refuse(`${name} already exists in the design repo`);

  const samples = existsSync(join(playDir, 'samples.json')) ? JSON.parse(readFileSync(join(playDir, 'samples.json'), 'utf8')) : {};
  const marksOf = (p) => {
    const f = p.layer === 'wip' ? join(wip, 'states.json') : join(designDir, p.layer, 'states.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))[p.name] ?? [] : [];
  };

  // Shared axes: an axis every piece having it declares with the same values.
  const placed = items.map((it, i) => {
    const p = byName.get(it.piece);
    if (!p) refuse(`no piece ${it.piece}`);
    const cell = cells(p, marksOf(p)).find((c) => cellName(p, c) === it.cell);
    if (!cell) refuse(`${it.piece} has no state "${it.cell}"`);
    return { p, cell, n: i + 1, prefix: `${lower(p.name)}${i + 1}` };
  });
  const shared = Object.keys(AXES).filter((axis) => {
    const types = placed.map(({ p }) => p.props.find((x) => x.name === axis)?.type).filter(Boolean);
    return types.length > 0 && types.every((t) => t === types[0]);
  });
  if (as === 'block' && !shared.length) refuse('the pieces share no state axis with the same values, and a Block needs one: promote it as a Screen');

  const props = [];
  const own = {};
  const calls = placed.map(({ p, cell, prefix }) => {
    const args = p.props.map((x) => {
      if (shared.includes(x.name)) return `${x.name}=${x.name}`;
      const values = enumValues(x.type);
      if (values) return `${x.name}=${quote(cell[x.name] ?? values[0])}`;
      const prop = `${prefix}_${x.name}`;
      props.push(`    ${prop}: ${x.type}`);
      const given = samples[`props:${p.name}`]?.[x.name];
      if (given !== undefined) own[prop] = given;
      return `${x.name}=${prop}`;
    });
    return `${p.name}(${args.join(', ')})`;
  });
  for (const axis of shared) props.unshift(`    ${axis}: ${placed.find(({ p }) => p.props.some((x) => x.name === axis)).p.props.find((x) => x.name === axis).type}`);

  // Imports: the pieces, the layout, and every shape a passed prop's type names.
  const home = as === 'block' ? 'blocks' : 'screens';
  const ownPkg = JSON.parse(readFileSync(join(designDir, home, 'package.json'), 'utf8')).name;
  const dir = join(designDir, home, 'arranged');
  // A piece of the new component's own package is imported from its file (the package index imports this one).
  const from = (p) => (p.pkg === ownPkg ? ((r) => (r.startsWith('..') ? r : `./${r}`))(relative(dir, resolve(p.at.split(':')[0]))) : p.pkg);
  const uses = new Map();
  const need = (what, src) => uses.set(src, new Set([...(uses.get(src) ?? []), what]));
  for (const { p } of placed) need(p.name, from(p));
  if (layout) need(layout.name, from(layout));
  for (const line of props) for (const m of line.matchAll(/\b([A-Z][A-Za-z0-9]*)(?=\[\]|$)/g)) if (shapeHome.has(m[1])) need(m[1], shapeHome.get(m[1]));
  const useLines = [...uses].map(([src, set]) => `use ${[...set].sort().join(', ')} from ${quote(src)}`);

  const layoutArgs = layout
    ? layout.props.map((x) => {
        const values = enumValues(x.type);
        if (values) return `${x.name}=${quote(values[0])}`;
        const prop = `layout_${x.name}`;
        props.push(`    ${prop}: ${x.type}`);
        const given = samples[`props:${layout.name}`]?.[x.name];
        if (given !== undefined) own[prop] = given;
        return `${x.name}=${prop}`;
      })
    : [];
  const body = layout
    ? [`    ${layout.name}(${layoutArgs.join(', ')})`, ...calls.map((c) => `      ${c}`)]
    : ['    column gap="theme.space.md"', ...calls.map((c) => `      ${c}`)];
  const text = [
    `// ${name}: arranged in the playground (Arrange page) and promoted with agent-ui-kit tools/arrange.mjs.`,
    `// Arrangement: ${spec}`,
    'use Swatch from "@accord/theme"',
    ...useLines,
    '',
    `component ${name}`,
    '  props',
    ...props,
    '  view',
    ...body,
    '',
  ].join('\n');

  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${lower(name)}.contract`);
  writeFileSync(file, text);
  const index = join(designDir, home, 'index.contract');
  writeFileSync(index, `${readFileSync(index, 'utf8').replace(/\n*$/, '\n')}use ${name} from "./arranged/${lower(name)}.contract"\n`);
  samples[`props:${name}`] = own;
  writeFileSync(join(playDir, 'samples.json'), `${JSON.stringify(samples, null, 2)}\n`);
  console.log(`arrange: ${name} written to ${file}; exported from ${home}/index.contract; its samples are in samples.json. Now: bun run check in the design repo, regenerate the playground, and look at it at 390 px before committing.`);
}

if (import.meta.main) {
  const [verb, design, play, name, ...rest] = process.argv.slice(2);
  const opt = (k) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
  if (verb === 'promote' && design && play) promote(resolve(design), resolve(play), name, opt('--as'), opt('--spec'));
  else {
    console.error('usage: bun tools/arrange.mjs promote <design dir> <playground dir> <Name> --as block|screen --spec "<layout>|Piece:cell,…"');
    process.exit(2);
  }
}
