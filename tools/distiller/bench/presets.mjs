#!/usr/bin/env bun
// Starting presets from published design systems: each system's own published token values, mapped to the
// Theme's names, in light and dark, with the system's licence (shown, and accepted before use) and where each
// value came from. Style values (colour, spacing, corners, type scale) are marked "style"; a named font, icon,
// component or trademark is "copied" and keeps its licence wherever it goes.
//   bun bench/presets.mjs [<system id> …]   → presets/<id>.json
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../lib/color.mjs";
import { fetchPackage, readTruth } from "../lib/truth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "presets");
mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2);
for (const f of readdirSync(join(HERE, "systems")).filter(f => f.endsWith(".json"))) {
  const sys = JSON.parse(readFileSync(join(HERE, "systems", f), "utf8"));
  if (ids.length && !ids.includes(sys.id)) continue;
  const pkg = await fetchPackage(sys.package, join(HERE, ".cache"));
  // the system's main theme per scheme: the first truth entry for each scheme
  const pick = m => sys.truth.find(e => e.scheme === m)?.theme ?? "default";
  const read = t => readTruth(sys.truth.filter(e => (e.theme ?? "default") === t || !e.theme).map(e => ({ ...e, dir: pkg.dir })));
  const light = read(pick("light")).light, dark = read(pick("dark")).dark;
  const tokens = {};
  for (const [role, name] of Object.entries(sys.roles)) {
    const v = { light: light[name], dark: dark[name] };
    if (!C.parse(v.light ?? "") || !C.parse(v.dark ?? "")) continue;
    const solid = (x, m) => (C.parse(x).alpha < 1 ? C.over(x, C.toHex(m === "light" ? light[sys.roles.background] : dark[sys.roles.background])) : C.toHex(x));
    tokens[`color.${role}`] = { light: solid(v.light, "light"), dark: solid(v.dark, "dark"), origin: "style", from: name };
  }
  const font = sys.font ? light[sys.font] : sys.fontLiteral?.value;
  if (font) tokens["font.sans"] = { light: font, dark: font, origin: "copied", from: sys.font ?? sys.fontLiteral.source, note: "a font name: the font's own licence applies to its files" };
  const preset = {
    $schema: "brand-intake/preset@1",
    name: sys.system,
    source: { package: `${sys.package}@${pkg.version}`, themes: { light: pick("light"), dark: pick("dark") } },
    licence: { spdx: pkg.licence, url: sys.licenceUrl, notice: `Values from ${sys.system} (${sys.package}@${pkg.version}), ${pkg.licence}.`, acceptBeforeUse: true },
    tokens,
  };
  writeFileSync(join(OUT, `${sys.id}.json`), `${JSON.stringify(preset, null, 1)}\n`);
  console.log(`${sys.id}: ${Object.keys(tokens).length} tokens, ${pkg.licence}`);
}
