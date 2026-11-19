// Every check of this repository, on one host, in order; a line for each and
// a total. Exits 1 when any fails.
//
//   bun tools/check.mjs [web|macos|ios]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const host = process.argv[2] ?? "web";
const gallery = "apps/agent-gallery";
const steps = [
  ["words", ["bun", "tools/words.mjs"], ROOT],
  ["library-gate", ["bun", "tools/library-gate.mjs"], ROOT],
  ["library-gate tests", ["bun", "exact.mjs", "test", host], resolve(ROOT, "apps/library-gate")],
  ["gallery tests", ["bun", "exact.mjs", "test", host], resolve(ROOT, gallery)],
  ["both-doors", ["bun", "tools/both-doors.mjs", gallery, host], ROOT],
  ["palette-link", ["bun", "tools/palette-link.mjs", gallery, host], ROOT],
  ["modes", ["bun", "tools/modes.mjs", gallery, host], ROOT],
  ["tree-only", ["bun", "tools/tree-only.mjs", gallery, host], ROOT],
  ["recipes", ["bun", "tools/recipes.mjs", host], ROOT],
];

let failed = 0;
for (const [name, [cmd, ...rest], cwd] of steps) {
  const r = spawnSync(cmd, rest, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const last = r.stdout.trim().split("\n").filter((l) => l.trim()).at(-1) ?? "";
  console.log(`check: ${name}: ${r.status === 0 ? "ok" : "FAILED"}: ${last}`);
  if (r.status !== 0) {
    failed++;
    console.log(r.stdout.split("\n").filter((l) => /FAILED|problems|^\S+: [^"]/.test(l)).slice(-15).map((l) => `  ${l}`).join("\n"));
  }
}
console.log(`check: ${steps.length - failed} of ${steps.length} passed (${host})`);
process.exit(failed ? 1 : 0);
