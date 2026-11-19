#!/usr/bin/env bun
// The Distiller's benchmark: distil a published design system from its public site as if it were unknown (no
// guide, no package), then score the result against the system's own published tokens. Run it after each change
// to the Distiller; the scores say whether the change helped.
//   bun bench/bench.mjs [<system id> …]          (default: every bench/systems/*.json)
// Writes bench/runs/<id>/ (the run, ignored by git) and prints one line per system; bench/scores.json keeps the
// latest score per system.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../lib/color.mjs";
import { fetchPackage, readTruth } from "../lib/truth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ids = process.argv.slice(2).filter(a => !a.startsWith("--"));
const systems = (ids.length ? ids : readdirSync(join(HERE, "systems")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)))
  .map(id => JSON.parse(readFileSync(join(HERE, "systems", `${id}.json`), "utf8")));

export function score(sys, truth, theme) {
  const rows = [];
  for (const [role, name] of Object.entries(sys.roles)) for (const m of ["light", "dark"]) {
    const t = truth[m][name] && C.parse(truth[m][name]) ? C.parse(truth[m][name]).alpha < 1 ? C.over(truth[m][name], C.toHex(truth[m][sys.roles.background])) : C.toHex(truth[m][name]) : null;
    if (!t) continue;
    const got = theme.presets.harmonised.tokens[`color.${role}`]?.[m];
    const g = got && C.parse(got) ? C.toHex(got) : null;
    const dE = g ? C.deltaE(g, t) : null;
    rows.push({ role, scheme: m, truth: t, distilled: g, dE: dE == null ? null : +dE.toFixed(3), result: dE == null ? "missing" : dE < 0.02 ? "hit" : dE < 0.05 ? "near" : "miss" });
  }
  const want = sys.font ? truth.light[sys.font] : sys.fontLiteral?.value;
  // one family: "Mona Sans VF" (a variable font file) is Mona Sans
const first = f => f?.split(",")[0].replace(/["']/g, "").trim().toLowerCase().replace(/\s+(vf|variable)$/, "");
  const font = want ? { truth: first(want), distilled: first(theme.tokens["font.sans"]?.light), hit: first(want) === first(theme.tokens["font.sans"]?.light) } : null;
  const n = rows.length, hits = rows.filter(r => r.result === "hit").length, near = rows.filter(r => r.result === "near").length;
  const present = rows.filter(r => r.dE != null);
  return { colours: { n, hits, near, missing: rows.filter(r => r.result === "missing").length, meanDE: present.length ? +(present.reduce((s, r) => s + r.dE, 0) / present.length).toFixed(3) : null }, font, score: +((hits + 0.5 * near + (font?.hit ? 1 : 0)) / (n + (font ? 1 : 0))).toFixed(3), rows };
}

const scoresFile = join(HERE, "scores.json");
const scores = existsSync(scoresFile) ? JSON.parse(readFileSync(scoresFile, "utf8")) : {};
for (const sys of systems) {
  const pkg = await fetchPackage(sys.package, join(HERE, ".cache"));
  // a system may publish several themes per scheme (truth entries with "theme"); each scheme is scored against
  // the published theme whose background is closest to what was distilled
  const themes = [...new Set(sys.truth.map(e => e.theme ?? "default"))];
  const byTheme = Object.fromEntries(themes.map(t => [t, readTruth(sys.truth.filter(e => (e.theme ?? "default") === t || !e.theme).map(e => ({ ...e, dir: pkg.dir })))]));
  const run = join(HERE, "runs", sys.id);
  mkdirSync(run, { recursive: true });
  const cfg = { brand: sys.system, ownership: { mode: "published-system", package: sys.package, licence: sys.licence, domains: sys.domains }, web: sys.sites };
  writeFileSync(join(run, "brand.json"), JSON.stringify(cfg, null, 1));
  const skip = process.argv.includes("--reuse") && existsSync(join(run, "out/web/pages.json")) ? ["--skip-web"] : [];
  const p = Bun.spawnSync(["bun", join(ROOT, "distill.mjs"), join(run, "brand.json"), join(run, "out"), ...skip], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) { console.log(`${sys.id}: distill failed: ${p.stderr.toString().trim().split("\n").at(-1)}`); continue; }
  const theme = JSON.parse(readFileSync(join(run, "out/theme.json"), "utf8"));
  const truth = { light: {}, dark: {} }, chosenTheme = {};
  for (const m of ["light", "dark"]) {
    const got = theme.presets.harmonised.tokens["color.background"]?.[m];
    const cands = themes.filter(t => sys.truth.some(e => (e.theme ?? "default") === t && e.scheme === m) && C.parse(byTheme[t][m][sys.roles.background] ?? ""));
    const best = cands.sort((a, b) => (got ? C.deltaE(byTheme[a][m][sys.roles.background], got) - C.deltaE(byTheme[b][m][sys.roles.background], got) : 0))[0] ?? themes[0];
    truth[m] = byTheme[best][m]; chosenTheme[m] = best;
  }
  const s = { ...score(sys, truth, theme), truthTheme: chosenTheme };
  writeFileSync(join(run, "score.json"), JSON.stringify({ system: sys.system, package: `${sys.package}@${pkg.version}`, ...s }, null, 1));
  scores[sys.id] = { system: sys.system, package: `${sys.package}@${pkg.version}`, score: s.score, colours: s.colours, font: s.font, truthTheme: chosenTheme, at: new Date().toISOString() };
  console.log(`${sys.id}: score ${s.score}  colours ${s.colours.hits} hit, ${s.colours.near} near, ${s.colours.missing} missing of ${s.colours.n} (mean ΔE ${s.colours.meanDE})  font ${s.font ? (s.font.hit ? "hit" : `miss (${s.font.distilled} vs ${s.font.truth})`) : "-"}  against ${chosenTheme.light}/${chosenTheme.dark}`);
}
writeFileSync(scoresFile, JSON.stringify(scores, null, 1));
