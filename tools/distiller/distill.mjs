#!/usr/bin/env bun
// The Distiller: one command for any brand. Reads the brand config, runs each step, writes the Theme, the
// presets and the divergence report.
//   bun distill.mjs <brand.json> <run-dir> [--skip-web] [--native <udid> <bundle-id> <id>] [--reference a,b] [--guide on|off]
// Steps: doors → guide (official CSS) → web (headless, light and dark) → native source → native app (optional,
// one launch, light and dark) → analyse → report. Each step writes into <run-dir>; a later run is a drift check.
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertOwnership } from "./lib/doors.mjs";
import { loadConfig } from "./lib/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [cfg, run, ...rest] = process.argv.slice(2);
if (!cfg || !run) { console.error("usage: distill.mjs <brand.json> <run-dir> [--skip-web] [--native <udid> <bundle-id> <id>] [--reference a,b] [--guide on|off]"); process.exit(2); }
console.log("doors:", JSON.stringify(await assertOwnership(loadConfig(cfg))));
const step = (file, ...args) => execFileSync("bun", [join(here, file), ...args], { stdio: "inherit" });
step("collect-guide.mjs", cfg, run);
if (!rest.includes("--skip-web")) step("collect-web.mjs", cfg, run);
step("collect-native-source.mjs", cfg, run);
const n = rest.indexOf("--native");
if (n >= 0) step("collect-native.mjs", run, rest[n + 1], rest[n + 2], rest[n + 3]);
const refFlags = ["--reference", "--guide"].flatMap(f => (rest.includes(f) ? [f, rest[rest.indexOf(f) + 1]] : []));
step("analyse.mjs", cfg, run, join(run, "theme.json"), ...refFlags);
step("report.mjs", run, join(run, "theme.json"), join(run, "divergence-report.md"));
