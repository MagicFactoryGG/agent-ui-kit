#!/usr/bin/env bun
// The Distiller, native fallback: when no build of a native app can be launched, read its theme from source.
// Lower confidence than a running app: it shows what the code asks for, not what the screen draws.
// Config entry: { id, root, tokenCss, darkSelector, sourceDirs:[...] }
// Usage: bun collect-native-source.mjs <brand.json> <out-dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "./lib/color.mjs";
import { walkCss, schemeOf } from "./lib/css.mjs";
import { loadConfig } from "./lib/config.mjs";

const [cfgPath, outDir] = process.argv.slice(2);
const cfg = loadConfig(cfgPath);
mkdirSync(join(outDir, "native"), { recursive: true });
for (const n of cfg.nativeSource ?? []) {
  const res = { product: n.id, kind: "source", tokens: { light: {}, dark: {} }, literals: [], fonts: {} };
  if (n.tokenCss) {
    walkCss(readFileSync(join(n.root, n.tokenCss), "utf8"), n.tokenCss, d => {
      const sc = d.prop.startsWith("--") && schemeOf(d, n.darkSelector ?? ".dark");
      if (sc) res.tokens[sc][d.prop] = d.value;
    });
  }
  const files = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === "node_modules") continue; statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(f) && files.push(p); } };
  for (const d of n.sourceDirs ?? []) walk(join(n.root, d));
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return; // comments hold issue numbers like #976
      for (const m of line.matchAll(/['"`](#[0-9a-fA-F]{3,8})['"`]/g)) if (parse(m[1])) res.literals.push({ value: m[1].toLowerCase(), at: `${relative(n.root, f)}:${i + 1}`, line: line.trim().slice(0, 140) });
      for (const m of line.matchAll(/fontFamily:\s*['"]([^'"]+)/g)) res.fonts[m[1]] = (res.fonts[m[1]] ?? 0) + 1;
    });
  }
  writeFileSync(join(outDir, "native", `${n.id}.source.json`), JSON.stringify(res, null, 1));
  console.log(`native source ${n.id}: tokens light ${Object.keys(res.tokens.light).length} dark ${Object.keys(res.tokens.dark).length}, literals ${res.literals.length}, fonts ${Object.keys(res.fonts).join(", ")}`);
}
