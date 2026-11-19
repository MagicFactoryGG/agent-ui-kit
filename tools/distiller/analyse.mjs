#!/usr/bin/env bun
// The Distiller, analysis step (lib/distil.mjs does the work).
// Usage: bun analyse.mjs <brand.json> <run-dir> <theme-out.json> [<report-out.md>] [--reference a,b] [--guide on|off]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { distil } from "./lib/distil.mjs";
import { harmoniseArgs } from "./lib/args.mjs";

const [cfgPath, runDir, themeOut] = process.argv.slice(2);
const { reference, useGuide } = harmoniseArgs(process.argv);
const { theme, divergences } = await distil({ cfg: loadConfig(cfgPath), runDir, reference, useGuide });
writeFileSync(themeOut, JSON.stringify(theme, null, 1));
writeFileSync(join(runDir, "divergences.json"), JSON.stringify(divergences, null, 1));
console.log(`tokens ${Object.keys(theme.tokens).length}, divergences ${divergences.length}, derived ${theme.derived.length}, reference ${theme.presets.harmonised.name}, checks ${Object.entries(theme.checks).map(([k, v]) => `${k}=${v.pass ? "pass" : "FAIL"}`).join(" ")}`);
