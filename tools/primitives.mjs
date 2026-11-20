#!/usr/bin/env bun
// Primitives only: a design system's blocks and screens are made of its primitives (its components layer), never a
// control of their own. A block or screen that draws its own button, field, menu, chip, switch, checkbox, radio or tab
// is refused, loudly, at its file and line, naming the primitive to use. A truly new shape becomes a declared
// primitive in the components layer; there are no silent exceptions.
//
// Every design system the kit makes gets this check, and so does every app built on one (the app's own pieces are
// its blocks and screens).
//
// What counts as a control drawn by hand (in blocks/ and screens/, comments and strings aside):
//   button     a `button` element                                    -> the components layer's button
//   field      an `input` (text, number, search, date…), `textarea`, `select`, outside a Field's slot -> its Field
//   check      an `input type="checkbox"` (a switch too)             -> its switch or checkbox
//   radio      an `input type="radio"` or role radio                 -> its choice (Segment, a radio group)
//   menu       a popover, or role menu or listbox                    -> its Menu
//   tab        role tab or tablist                                   -> its tabs (Segment)
// A native field inside a Field's slot is how Field is meant to be used, and passes.
//
// primitives.json beside the design (optional) names each kind's primitive, for the message:
//   { "button": "ActionButton", "field": "Field", "check": "SwitchRow", "radio": "Segment", "menu": "Menu", "tab": "Segment" }
// primitives-baseline.json beside it lists what each file draws by hand today ({"blocks/x.contract": {"button": 2}}):
// a count may only go down. A file over its count fails; one under it fails too, until the baseline is lowered (it
// only shrinks). A design system with no hand-drawn controls has an empty baseline, or none.
//
//   bun tools/primitives.mjs check <design dir>         the check
//   bun tools/primitives.mjs list <design dir>          every hand-drawn control, file and line
//   bun tools/primitives.mjs baseline <design dir>      write today's counts as the baseline (once, when adopting it)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RULE =
  "REFUSED by primitives (agent-ui-kit tools/primitives.mjs): a block or screen draws no control of its own; it uses the design's primitive";
const LAYERS = ["blocks", "screens"];
const GENERIC = {
  button: "the components layer's button (ActionButton)",
  field: "the components layer's Field",
  check: "the components layer's switch or checkbox",
  radio: "the components layer's choice (Segment)",
  menu: "the components layer's Menu",
  tab: "the components layer's tabs (Segment)",
};

const indentOf = (l) => l.length - l.trimStart().length;

// The kind of hand-drawn control a line is, or null.
export function kindOf(line) {
  const t = line.trim();
  if (t.startsWith("//")) return null;
  const el = /^(button|input|textarea|select|column|row|box|list)\b/.exec(t)?.[1];
  if (el === "button") return "button";
  if (el === "input") {
    if (/\btype="checkbox"/.test(t)) return "check";
    if (/\btype="radio"/.test(t)) return "radio";
    return "field";
  }
  if (el === "textarea" || el === "select") return "field";
  if (el && /\bpopover=/.test(t)) return "menu";
  if (el && /\brole="(menu|listbox)"/.test(t)) return "menu";
  if (el && /\brole="(tab|tablist)"/.test(t)) return "tab";
  if (el && /\brole="(radio|radiogroup)"/.test(t)) return "radio";
  return null;
}

// Whether a line sits in a Field's slot: the nearest line above it with less indent places a Field.
function inFieldSlot(lines, i) {
  const own = indentOf(lines[i]);
  for (let j = i - 1; j >= 0; j--) {
    if (!lines[j].trim()) continue;
    if (indentOf(lines[j]) < own) return /^\s*Field\(/.test(lines[j]);
  }
  return false;
}

export function findings(designDir) {
  const out = [];
  for (const layer of LAYERS) {
    const dir = join(designDir, layer);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".contract")).sort()) {
      const lines = readFileSync(join(dir, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        const kind = kindOf(line);
        if (!kind) return;
        if (kind === "field" && inFieldSlot(lines, i)) return;
        out.push({ file: `${layer}/${f}`, line: i + 1, kind, text: line.trim().slice(0, 90) });
      });
    }
  }
  return out;
}

const counts = (found) => {
  const c = {};
  for (const x of found) {
    c[x.file] ??= {};
    c[x.file][x.kind] = (c[x.file][x.kind] ?? 0) + 1;
  }
  return c;
};

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

export function check(designDir) {
  const found = findings(designDir);
  const now = counts(found);
  const base = readJson(join(designDir, "primitives-baseline.json"), {});
  const names = { ...GENERIC, ...readJson(join(designDir, "primitives.json"), {}) };
  const over = [];
  const under = [];
  for (const file of new Set([...Object.keys(now), ...Object.keys(base)])) {
    for (const kind of new Set([...Object.keys(now[file] ?? {}), ...Object.keys(base[file] ?? {})])) {
      const n = now[file]?.[kind] ?? 0;
      const b = base[file]?.[kind] ?? 0;
      if (n > b) over.push({ file, kind, n, b });
      else if (n < b) under.push({ file, kind, n, b });
    }
  }
  return { found, now, base, names, over, under };
}

function main([verb, dir]) {
  const designDir = resolve(dir ?? ".");
  if (verb === "list") {
    for (const x of findings(designDir)) console.log(`${x.file}:${x.line}: ${x.kind}: ${x.text}`);
    return 0;
  }
  if (verb === "baseline") {
    const now = counts(findings(designDir));
    writeFileSync(join(designDir, "primitives-baseline.json"), `${JSON.stringify(now, null, 2)}\n`);
    const total = Object.values(now).reduce((s, k) => s + Object.values(k).reduce((a, b) => a + b, 0), 0);
    console.log(`primitives: baseline written: ${total} hand-drawn controls in ${Object.keys(now).length} files; it may only shrink`);
    return 0;
  }
  if (verb === "check") {
    const { found, names, over, under, now } = check(designDir);
    const total = Object.values(now).reduce((s, k) => s + Object.values(k).reduce((a, b) => a + b, 0), 0);
    if (over.length) {
      console.error(`${RULE}: ${over.length} new hand-drawn control kind${over.length === 1 ? "" : "s"} beyond the baseline.`);
      for (const o of over) {
        console.error(`  ${o.file}: ${o.n} ${o.kind} (the baseline allows ${o.b}); use ${names[o.kind]}:`);
        for (const x of found.filter((f) => f.file === o.file && f.kind === o.kind)) console.error(`    ${x.file}:${x.line}: ${x.text}`);
      }
    }
    if (under.length) {
      console.error(`primitives: fewer hand-drawn controls than the baseline: lower primitives-baseline.json (it only shrinks):`);
      for (const u of under) console.error(`  ${u.file}: ${u.kind} ${u.b} -> ${u.n}`);
    }
    if (over.length || under.length) return 1;
    console.log(`primitives: ${total} hand-drawn control${total === 1 ? "" : "s"} left in the baseline, none new`);
    return 0;
  }
  console.error("usage: bun tools/primitives.mjs check|list|baseline <design dir>");
  return 2;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
