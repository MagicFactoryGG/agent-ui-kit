#!/usr/bin/env bun
// Harmonise from a chosen reference set, on a saved run (no browsing): any apps, and the guide or not. Apps
// outside the set are still measured against it.
//   bun harmonise.mjs <brand.json> <run-dir> [--reference a,b] [--guide on|off] [--json] [--save "<name>"]
// --json   stdout is exactly { name, reference: { apps, guide }, tokens: { <token>: { light, dark } }, divergences }
// --save   keeps the result as presets.saved[<name>] = { reference, tokens } in <run-dir>/theme.json
// An unknown source id: one line on stderr, exit 2.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { distil } from "./lib/distil.mjs";
import { harmoniseArgs } from "./lib/args.mjs";

const [cfgPath, runDir] = process.argv.slice(2);
if (!cfgPath || !runDir) { console.error("usage: harmonise.mjs <brand.json> <run-dir> [--reference a,b] [--guide on|off] [--json] [--save name]"); process.exit(2); }
let args, out;
try {
  args = harmoniseArgs(process.argv);
  out = await distil({ cfg: loadConfig(cfgPath), runDir, reference: args.reference, useGuide: args.useGuide });
} catch (e) { console.error(String(e.message ?? e).split("\n")[0]); process.exit(2); }
const h = out.theme.presets.harmonised;
const result = { name: args.save ?? h.name, reference: h.reference, tokens: h.tokens, divergences: out.divergences };
if (args.save) {
  const file = join(runDir, "theme.json");
  if (!existsSync(file)) { console.error(`no ${file}: run distill.mjs first`); process.exit(2); }
  const theme = JSON.parse(readFileSync(file, "utf8"));
  (theme.presets.saved ??= {})[args.save] = { reference: h.reference, tokens: h.tokens };
  writeFileSync(file, JSON.stringify(theme, null, 1));
}
if (args.json) process.stdout.write(JSON.stringify(result));
else console.log(`${result.name}: ${Object.keys(result.tokens).length} tokens, ${result.divergences.length} divergences${args.save ? `, saved in ${join(runDir, "theme.json")}` : ""}`);
