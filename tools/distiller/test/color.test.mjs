import { test, expect } from "bun:test";
import * as C from "../lib/color.mjs";
import { walkCss, schemeOf } from "../lib/css.mjs";

test("parses every colour form browsers and stylesheets give", () => {
  expect(C.toHex("150 99% 45%")).toBe("#01e473");          // shadcn bare HSL
  expect(C.toHex("oklch(60.6% .25 292.717)")).toBe("#8e51ff"); // Tailwind violet-500
  expect(C.toHex("lab(63.7053% 60.745 31.3109)")).toBe("#ff6467"); // Chromium lab(), Tailwind red-400
  expect(C.toHex("rgba(255, 255, 255, 0.1)")).toBe("#ffffff1a");
  expect(C.over("#ffffff1a", "#000000")).toBe("#1a1a1a");
});

test("contrast follows WCAG", () => {
  expect(C.contrast("#000", "#fff")).toBeCloseTo(21, 1);
  expect(C.contrast("#737373", "#ffffff")).toBeCloseTo(4.74, 1);
});

test("a derived text value keeps its hue and reaches 4.5:1 on the derived surface", () => {
  for (const [ink, surf] of [["#737373", "#ffffff"], ["#1447e6", "#ffffff"], ["#5d6672", "#f6f7f9"]]) {
    const darkSurf = C.deriveOther(surf, { role: "surface" });
    expect(C.oklch(darkSurf).L).toBeLessThan(0.3);
    const darkInk = C.deriveOther(ink, { role: "text", against: darkSurf });
    expect(C.contrast(darkInk, darkSurf)).toBeGreaterThanOrEqual(4.5);
    if (C.oklch(ink).C > 0.04) expect(Math.abs(C.oklch(darkInk).H - C.oklch(ink).H)).toBeLessThan(5);
  }
});

test("the CSS walker sorts tokens into light and dark", () => {
  const got = { light: {}, dark: {} };
  walkCss(":root{--a:#fff}.dark{--a:#000}@media (prefers-color-scheme: dark){:root{--b:#111}}", "x.css", d => { const s = schemeOf(d); if (s) got[s][d.prop] = d.value; });
  expect(got).toEqual({ light: { "--a": "#fff" }, dark: { "--a": "#000", "--b": "#111" } });
});

test("light-dark() resolves for each scheme", () => {
  expect(C.pickScheme("light-dark(#fff, oklch(20% 0 0))", "light")).toBe("#fff");
  expect(C.toHex(C.pickScheme("light-dark(rgb(1, 2, 3), light-dark(#000, #111))", "dark"))).toBe("#111111");
});

test("color-mix() mixes", () => {
  expect(C.toHex("color-mix(in oklch, #ffffff, black 100%)")).toBe("#000000");
  expect(C.oklch(C.toHex("color-mix(in oklch, oklch(0.5772 0.2324 260), black 10%)")).L).toBeLessThan(0.55);
});

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, writeFileSync as wf } from "node:fs";
import { tmpdir } from "node:os";
test("a blend records where each value came from; only copied material keeps a licence", () => {
  const d = mkdtempSync(join(tmpdir(), "blend-"));
  wf(join(d, "a.json"), JSON.stringify({ name: "Ours", tokens: { "color.background": { light: "#ffffff", dark: "#000000" }, "brand.button.face": { light: "#000000", dark: "#000000" }, "font.sans": { light: "Geist", dark: "Geist" } } }));
  wf(join(d, "b.json"), JSON.stringify({ name: "Sys", licence: { spdx: "MIT", notice: "n" }, tokens: { "color.background": { light: "#f4f4f4", dark: "#161616", origin: "style" }, "brand.button.face": { light: "#ff0000", dark: "#ff0000", origin: "style" }, "font.sans": { light: "Plex", dark: "Plex", origin: "copied" } } }));
  const r = spawnSync("bun", [join(import.meta.dir, "../blend.mjs"), join(d, "a.json"), join(d, "b.json"), "--weight", "0.5"], { encoding: "utf8" });
  const b = JSON.parse(r.stdout);
  expect(b.tokens["color.background"].from).toBe("mix");
  expect(b.tokens["brand.button.face"]).toMatchObject({ light: "#000000", from: "base" });
  expect(b.tokens["font.sans"]).toMatchObject({ light: "Plex", from: "other", origin: "copied" });
  expect(b.licence).toMatchObject({ spdx: "MIT", for: ["font.sans"], acceptedWithBlend: true });
  const r2 = spawnSync("bun", [join(import.meta.dir, "../blend.mjs"), join(d, "a.json"), join(d, "b.json"), "--weight", "0.3"], { encoding: "utf8" });
  expect(JSON.parse(r2.stdout).licence).toBeNull(); // style values only: the blend is the user's own
});

test("a colour moved darker keeps its hue (chroma gives way, not hue)", () => {
  const g = C.oklch("#01e473");
  const dark = C.fromOklch(0.5, g.C, g.H);
  expect(Math.abs(C.oklch(dark).H - g.H)).toBeLessThan(1.5);
});
