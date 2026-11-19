#!/usr/bin/env bun
// The Distiller, guide step: reads the brand's official CSS (its design-system source of truth) without a
// browser. Gives the custom properties per scheme and every literal value per selector, with file:line.
// Usage: bun collect-guide.mjs <brand.json> <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { walkCss as walk, schemeOf } from "./lib/css.mjs";
import { loadConfig } from "./lib/config.mjs";

const [cfgPath, outDir] = process.argv.slice(2);
const cfg = loadConfig(cfgPath);
const g = cfg.guide;
if (!g) { console.log("no guide in config; skipping"); process.exit(0); }
const darkSel = g.darkSelector ?? ".dark";

const out = { id: g.id, root: g.root, tokens: { light: {}, dark: {} }, themeAliases: {}, literals: [], keyframes: {} };
for (const rel of g.css) {
  const file = join(g.root, rel);
  walk(readFileSync(file, "utf8"), rel, d => {
    const inKeyframes = d.context.find(c => c.startsWith("@keyframes"));
    if (inKeyframes) { (out.keyframes[inKeyframes.slice(11).trim()] ??= []).push({ at: d.selector, [d.prop]: d.value }); return; }
    if (d.prop.startsWith("--")) {
      const sc = schemeOf(d, darkSel);
      if (sc) out.tokens[sc][d.prop] = { value: d.value, at: d.at };
      else if (d.selector.startsWith("@theme")) out.themeAliases[d.prop] = { value: d.value, at: d.at };
      else out.literals.push(d);
      return;
    }
    out.literals.push(d);
  });
}
mkdirSync(join(outDir, "guide"), { recursive: true });
writeFileSync(join(outDir, "guide", "guide.json"), JSON.stringify(out, null, 1));
console.log(`guide ${g.id}: light ${Object.keys(out.tokens.light).length}, dark ${Object.keys(out.tokens.dark).length}, aliases ${Object.keys(out.themeAliases).length}, literals ${out.literals.length}, keyframes ${Object.keys(out.keyframes).length}`);
