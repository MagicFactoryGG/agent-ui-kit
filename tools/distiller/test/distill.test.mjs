// End to end on two local sites and a small guide: every step, in both schemes.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const fx = join(import.meta.dir, "fixtures");
let a, b, dir, theme, report, divergences;
beforeAll(async () => {
  const site = name => Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(readFileSync(join(fx, name, "index.html")), { headers: { "content-type": "text/html" } }) });
  a = site("site-a"); b = site("site-b");
  dir = mkdtempSync(join(tmpdir(), "distiller-e2e-"));
  writeFileSync(join(dir, "first-party.txt"), "127.0.0.1\nlocalhost\n");
  writeFileSync(join(dir, "brand.json"), JSON.stringify({
    brand: "Test brand",
    ownership: { mode: "first-party", domains: ["127.0.0.1", "localhost"] },
    guide: {
      id: "test-guide", root: fx, css: ["guide/theme.css"], darkSelector: ".dark",
      components: [{ prefix: "brand.button", selector: ".brand-button", why: "the same in both schemes", props: { "face-top": ["background", 0], "face-bottom": ["background", 1], ink: ["color"], height: ["height"] } }],
      keyframes: { "brand.cycle": { name: "brand-cycle", prop: "stop-color" } },
      rules: [{ token: "brand.button failed", selector: "data-status=\"failed\"", prop: "background", rule: "the button never turns red", chosen: "keep it black" }],
    },
    web: [{ id: "site-a", pages: [`http://127.0.0.1:${a.port}/`] }, { id: "site-b", pages: [`http://localhost:${b.port}/`] }],
  }));
  // async: this process serves the two sites while the Distiller reads them
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../distill.mjs"), join(dir, "brand.json"), join(dir, "run")], { stdout: "pipe", stderr: "pipe", env: { ...process.env, DISTILLER_FIRST_PARTY: join(dir, "first-party.txt") } });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(err || out);
  theme = JSON.parse(readFileSync(join(dir, "run/theme.json"), "utf8"));
  report = readFileSync(join(dir, "run/divergence-report.md"), "utf8");
  divergences = JSON.parse(readFileSync(join(dir, "run/divergences.json"), "utf8"));
}, 120000);
afterAll(() => { a?.stop(); b?.stop(); if (dir && !process.env.KEEP) rmSync(dir, { recursive: true, force: true }); else if (dir) console.log("kept", dir); });

test("every token and every preset token has a light and a dark value", () => {
  expect(theme.$schema).toBe("brand-intake/theme@1");
  expect(theme.checks.everyTokenHasLightAndDark.pass).toBe(true);
  expect(theme.checks.everyPresetTokenHasLightAndDark.pass).toBe(true);
});
test("the guide's values win, and live products that agree raise confidence", () => {
  expect(theme.tokens["color.background"]).toMatchObject({ light: "#ffffff", dark: "#000000", confidence: "high" });
  expect(theme.tokens["color.primary"].light).toBe("#0b50da");
});
test("a token the guide gives in one scheme only is derived and marked", () => {
  expect(theme.tokens["color.highlight"].derived).toMatchObject({ mode: "dark", from: "light" });
  expect(theme.derived.map(d => d.token)).toContain("--highlight");
});
test("components and colour cycles come from the config, the same in both schemes", () => {
  expect(theme.tokens["brand.button.face-top"]).toMatchObject({ light: "#2e2e2e", dark: "#2e2e2e" });
  expect(theme.tokens["brand.cycle"].light).toEqual(["#0bfee0", "#028ce4"]);
});
test("divergences: the rule broken by the code, contrast, a product that ignores the scheme, off-scale greys", () => {
  const kinds = new Set(divergences.map(d => d.kind));
  for (const k of ["guide-vs-rule", "contrast", "scheme", "off-scale"]) expect(kinds.has(k)).toBe(true);
  expect(divergences.find(d => d.kind === "scheme").product).toBe("site-b");
  expect(divergences.filter(d => d.kind === "off-brand-hue")).toEqual([]); // site-a's blue primary is the guide's
  // a low-contrast pair is decided, not proposed: same hue, at least 4.5:1, with the reason
  expect(divergences.find(d => d.kind === "contrast" && d.token === "color.muted-foreground")).toBeTruthy();
  expect(theme.tokens["color.muted-foreground"].decided[0]).toMatchObject({ mode: "light", was: "#737373" });
  expect(theme.checks.textContrastAtLeast4_5.pass).toBe(true);
});
test("presets: one per app as it looks today, plus Harmonised", () => {
  expect(Object.keys(theme.presets.apps).sort()).toEqual(["site-a", "site-b"]);
  expect(theme.presets.apps["site-b"].tokens["color.background"]).toMatchObject({ light: "#f6f7f9", dark: "#f6f7f9" });
  expect(theme.presets.apps["site-a"].tokens["color.background"].dark).toBe("#000000");
  expect(theme.presets.harmonised.tokens["color.foreground"]).toEqual({ light: "#000000", dark: "#ffffff" });
});
test("the report has every section and an evidence screenshot per page and scheme", () => {
  for (const h of ["## Notes", "## 1. Guide against its own rules, and what the Distiller decided", "## 2. Products against the guide", "## 3. Product against product", "## 4. Chosen values", "## 5. Presets", "## 6. Derived values"]) expect(report).toContain(h);
  expect(theme.products.flatMap(p => p.evidence).filter(e => e.endsWith(".png")).length).toBe(4);
});

const harmonise = (...args) => spawnSync("bun", [join(import.meta.dir, "../harmonise.mjs"), join(dir, "brand.json"), join(dir, "run"), ...args], { encoding: "utf8" });
test("by default Harmonised comes from the guide and every app", () => {
  expect(theme.presets.harmonised.reference).toEqual({ apps: ["site-a", "site-b"], guide: true });
  expect(theme.harmonise.sources.map(s => s.id)).toEqual(["guide", "site-a", "site-b"]);
});
test("harmonise from one app without the guide: its look wins, the other app is measured against it", () => {
  const r = harmonise("--reference", "site-b", "--guide", "off", "--json");
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(Object.keys(out).sort()).toEqual(["divergences", "name", "reference", "tokens"]);
  expect(out).toMatchObject({ name: "Harmonised: site-b", reference: { apps: ["site-b"], guide: false } });
  expect(out.tokens["color.background"]).toEqual({ light: "#f6f7f9", dark: "#f6f7f9" });
  expect(out.tokens["color.foreground"].light).toBe("#5d6672");
  expect(out.divergences.some(d => d.product === "site-a" && d.inReference === false && d.token === "--background")).toBe(true);
  for (const t of Object.values(out.tokens)) { expect(t.light).toBeDefined(); expect(t.dark).toBeDefined(); }
});
test("a reference set saves as its own preset", () => {
  expect(harmonise("--reference", "site-a", "--save", "Harmonised: site A").status).toBe(0);
  const saved = JSON.parse(readFileSync(join(dir, "run/theme.json"), "utf8")).presets.saved["Harmonised: site A"];
  expect(saved.reference).toEqual({ apps: ["site-a"], guide: true });
  expect(saved.tokens["color.background"]).toEqual({ light: "#ffffff", dark: "#000000" });
});
test("an unknown source: one line on stderr, non-zero exit", () => {
  const r = harmonise("--reference", "nope", "--json");
  expect(r.status).not.toBe(0);
  expect(r.stdout).toBe("");
  expect(r.stderr.trim().split("\n").length).toBe(1);
});
