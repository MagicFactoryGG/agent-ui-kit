// Every recipe runs. Each docs/recipes/*.md holds one `contract` block (an
// app over this repo's packages) and one `contract-test` block (its tests).
// This check writes each into one scratch app, `.recipes/run` (ignored by
// git), one recipe after another, and runs its tests on the host. One app for
// all, so a native host builds and installs once.
//
//   bun tools/recipes.mjs [web|macos|ios] [<recipe name>…]
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const [host = "web", ...only] = process.argv.slice(2);
const RUN = join(ROOT, ".recipes/run");
const GALLERY = join(ROOT, "apps/agent-gallery");

/** The fenced blocks of a Markdown file, by info string. */
function blocks(md) {
  const out = [];
  const re = /^```([\w-]*)[^\n]*\n([\s\S]*?)^```\s*$/gm;
  for (let m; (m = re.exec(md)); ) out.push({ info: m[1], body: m[2] });
  return out;
}

// The scratch app: the gallery's runner, manifest and data module, the
// packages by path.
mkdirSync(RUN, { recursive: true });
copyFileSync(join(GALLERY, "exact.mjs"), join(RUN, "exact.mjs"));
copyFileSync(join(GALLERY, "app.ts"), join(RUN, "app.ts"));
const manifest = JSON.parse(readFileSync(join(GALLERY, "app.json"), "utf8"));
delete manifest.intents;
Object.assign(manifest, { name: "Recipe", short_name: "Recipe", id: "com.example.agent-ui-kit.recipe" });
manifest.app = { id: "com.example.agent-ui-kit.recipe", name: "Recipe" };
writeFileSync(join(RUN, "app.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const pkg = JSON.parse(readFileSync(join(GALLERY, "package.json"), "utf8"));
pkg.name = "recipe";
writeFileSync(join(RUN, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
if (!existsSync(join(RUN, "node_modules"))) spawnSync("bun", ["install"], { cwd: RUN, stdio: "ignore" });

const problems = [];
const recipes = readdirSync(join(ROOT, "docs/recipes")).filter((f) => f.endsWith(".md")).filter((f) => !only.length || only.includes(f.replace(/\.md$/, "")));
for (const f of recipes) {
  const all = blocks(readFileSync(join(ROOT, "docs/recipes", f), "utf8"));
  const app = all.filter((b) => b.info === "contract");
  const test = all.filter((b) => b.info === "contract-test");
  if (app.length !== 1 || test.length !== 1) {
    problems.push(`${f}: needs one contract block and one contract-test block (has ${app.length} and ${test.length})`);
    continue;
  }
  writeFileSync(join(RUN, "app.contract"), app[0].body);
  writeFileSync(join(RUN, "app.test.contract"), test[0].body);
  const r = spawnSync("bun", ["exact.mjs", "test", host], { cwd: RUN, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  const lines = r.stdout.split("\n").filter((l) => /^test "|passed/.test(l));
  console.log(`recipes: ${f}: ${lines.at(-1) ?? "no result"}`);
  if (r.status !== 0) problems.push(`${f}: ${[...lines.filter((l) => !l.endsWith(": ok")), (r.stderr || r.stdout).split("\n").filter((l) => /\[[a-z-]+\]|FAIL|expected/.test(l)).slice(0, 6).join("\n  ")].join("\n  ")}`);
}

for (const p of problems) console.log(`recipes: ${p}`);
console.log(`recipes: ${recipes.length} recipes, ${problems.length} problems (${host})`);
process.exit(problems.length ? 1 : 0);
