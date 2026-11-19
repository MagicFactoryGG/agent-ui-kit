// The library gate, in the form of Exact's scripts/library-gate.test.mjs:
// apps/library-gate places every exported component of packages/*, once per
// value of each variant prop (one varied at a time, the others at their first
// value; a bool's first is false), and a component with no variant props
// once. The exports and their variants are the compiler's (`contract forma
// ir`'s `library`), not a read of the sources. Cells whose id starts `sample-`
// show other states and are held only to being placed. Every cell renders (no
// `if`, `for` or `match` in the view), every slot holds its marker, ids are
// unique, and every export is placed. It reads cells with Exact's own helpers
// (scripts/library-gate.mjs in the Exact checkout).
//
//   bun tools/library-gate.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const GATE = join(ROOT, "apps/library-gate");
const own = /process\.env\.EXACT2 \?\? "([^"]+)"/.exec(readFileSync(join(GATE, "exact.mjs"), "utf8"))?.[1];
const EXACT = process.env.EXACT ?? process.env.EXACT2 ?? resolve(GATE, own);
const { cellsFor, conditional, markedSlot, option, placements } = await import(join(EXACT, "scripts/library-gate.mjs"));

const problems = [];
const expect = (what, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// The compiler's library: each exported component, its variants.
const dir = mkdtempSync(join(tmpdir(), "agent-library-gate-"));
const out = join(dir, "ir.json");
const r = spawnSync("bun", ["exact.mjs", "contract", "forma", "ir", ".", "-o", out], { cwd: GATE, encoding: "utf8" });
if (r.status !== 0) {
  console.log(`library-gate: contract forma ir failed: ${r.stderr || r.stdout}`);
  process.exit(1);
}
const library = JSON.parse(readFileSync(out, "utf8")).library.filter((c) => c.library);
rmSync(dir, { recursive: true, force: true });
const names = library.map((c) => c.name);

// Every component the packages export (their index files' `use` lines that
// name components) is a library component in the IR.
const exported = readdirSync(join(ROOT, "packages")).flatMap((pkg) => {
  const files = readdirSync(join(ROOT, "packages", pkg)).filter((f) => f.endsWith(".contract"));
  const comps = files.flatMap((f) => [...readFileSync(join(ROOT, "packages", pkg, f), "utf8").matchAll(/^component (\w+)/gm)].map((m) => m[1]));
  const index = readFileSync(join(ROOT, "packages", pkg, "index.contract"), "utf8");
  const used = [...index.matchAll(/^use (.+) from/gm)].flatMap(([, n]) => n.split(",").map((x) => x.trim()));
  return comps.filter((c) => used.includes(c));
});
expect("exported components the IR lists", [...names].sort(), [...exported].sort());

// Components with a slot, by their sources.
const slotted = readdirSync(join(ROOT, "packages")).flatMap((pkg) =>
  readdirSync(join(ROOT, "packages", pkg)).filter((f) => f.endsWith(".contract")).flatMap((f) =>
    readFileSync(join(ROOT, "packages", pkg, f), "utf8").split(/^(?=component )/m).filter((b) => /^  slot\s*$/m.test(b.split(/^  view\s*$/m)[0])).map((b) => /^component (\w+)/.exec(b)?.[1]).filter(Boolean)));

const app = readFileSync(join(GATE, "app.contract"), "utf8");
expect("components in the gate app", [...app.matchAll(/^component (\w+)/gm)].map((m) => m[1]), ["App"]);
expect("control flow in the view", conditional(app), []);
const placed = placements(app, names);
expect("placements with no id", placed.filter((p) => !p.id).map((p) => p.name), []);
for (const c of library) {
  const mine = placed.filter((p) => p.name === c.name);
  const cells = mine.filter((p) => !p.id.startsWith("sample-"));
  const want = cellsFor(c.variants).map((v) => JSON.stringify(v)).sort();
  const got = cells.map((p) => JSON.stringify(Object.fromEntries(c.variants.map((v) => [v.prop, option(p.values[v.prop])])))).sort();
  expect(`${c.name}'s cells`, got, want);
  if (slotted.includes(c.name)) for (const p of mine) expect(`${p.id}'s slot marker`, markedSlot(p), true);
}
const ids = placed.map((p) => p.id);
expect("duplicate ids", ids.filter((id, i) => ids.indexOf(id) !== i), []);

for (const p of problems) console.log(`library-gate: ${p}`);
console.log(`library-gate: ${library.length} components, ${placed.length} placements, ${slotted.length} with a slot, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
