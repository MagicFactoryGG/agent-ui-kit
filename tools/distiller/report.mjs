#!/usr/bin/env bun
// The Distiller, report step: writes the divergence report (Markdown) from the theme and divergences.json.
// Re-run later on the same config, the report is a drift monitor: compare two reports or two divergences.json.
// Usage: bun report.mjs <run-dir> <theme.json> <report-out.md>
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [runDir, themePath, out] = process.argv.slice(2);
const theme = JSON.parse(readFileSync(themePath, "utf8"));
const dv = JSON.parse(readFileSync(join(runDir, "divergences.json"), "utf8"));
const ev = e => (e ?? []).map(p => `\`${join(resolve(runDir), p)}\``).join("<br>");
const by = k => dv.filter(d => d.kind === k);
const L = [];
const p = s => L.push(s);
const table = (head, rows) => { p(`| ${head.join(" | ")} |`); p(`|${head.map(() => "---").join("|")}|`); for (const r of rows) p(`| ${r.map(x => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`); p(""); };

p(`# ${theme.brand}: Distiller divergence report`);
p("");
p(`Harmonised from: **${theme.presets.harmonised.name.replace(/^Harmonised: /, "")}**. Apps outside it are read too and measured against it.`);
p(`Generated ${theme.generated}. Authority when sources disagree: ${theme.authority.join(" → ")}. Outliers are reported, never adopted.`);
p(`Two colours count as the same under ${theme.sameColourThreshold} (a just-visible step is about 0.02).`);
p(`Every page and screen was read twice: system set to light, then to dark.`);
p("");
p("## Notes");
p("");
p("What the Distiller measured, for people to judge. None of these is a rule.");
p("");
table(["Note", "Result", "Where"], Object.entries(theme.checks).map(([k, v]) => [k, v.pass ? "yes" : "**see here**", v.failing.map(f => typeof f === "string" ? f : Object.values(f).join(" ")).join("; ")]));

p("## Products read");
p("");
table(["Product", "Kind", "Pages", "Canvas light / dark", "Text light / dark", "Font", "Follows system scheme", "Evidence"], theme.products.map(r => [r.id, r.kind, r.pages, `${r.light.canvas} / ${r.dark.canvas}`, `${r.light.text ?? "-"} / ${r.dark.text ?? "-"}`, r.light.font ?? "-", r.followsSystemScheme === false ? "**no**" : "yes", ev(r.evidence)]));
if (theme.skippedPages?.length) { p("Pages not used for scales:"); p(""); for (const s of theme.skippedPages) p(`- ${s.url}: ${s.why}`); p(""); }

p("## 1. Guide against its own rules, and what the Distiller decided");
p("");
for (const d of by("guide-vs-rule")) p(`- **${d.token}**: the rule says ${d.rule ?? "otherwise"}; the code does ${d.value}. Chosen: ${d.chosen}.`);
for (const d of by("contrast")) p(`- **${d.token}** (${d.mode}): ${d.value}, low contrast. Decided: ${d.chosen}.`);
p("");

p(theme.presets.harmonised.reference.guide ? "## 2. Products against the guide" : "## 2. Products against the reference");
p("");
p("Published tokens (the CSS custom properties a product exposes) that differ from the guide:");
p("");
const gp = by("guide-vs-product");
const inRef = d => (d.inReference === false ? "no" : "yes");
table(["Product", "In reference", "Token", "Scheme", "Product value", "Chosen", "ΔE", "Evidence"], gp.map(d => [d.product, inRef(d), d.token, d.mode, d.value, d.chosen, d.dE, ev(d.evidence)]));
const hue = by("off-brand-hue");
if (hue.length) { p("Accent hues the guide does not use:"); p(""); table(["Product", "Scheme", "Published --primary", "Guide (chosen)", "Evidence"], hue.map(d => [d.product, d.mode, d.value, d.chosen, ev(d.evidence)])); }
p("Drawn colours that match no chosen token of their role (canvas, text, border):");
p("");
table(["Product", "In reference", "Role", "Scheme", "Drawn", "Nearest token", "ΔE", "Evidence"], by("off-scale").map(d => [d.product, d.inReference === false ? "no" : "yes", d.role, d.mode, d.value, d.nearest, d.dE, ev(d.evidence)]));
const nl = by("native-literal");
if (nl.length) {
  p("Hard-coded colours in native source (not tokens):");
  p("");
  table(["Product", "Colour", "Matches a token", "Where"], nl.map(d => [d.product, d.value, d.matchesAToken ? "yes" : "**no**", `\`${d.at}\``]));
}

p("## 3. Product against product");
p("");
const fonts = by("font");
p(`- **Font**: ${theme.tokens["font.sans"].why}`);
for (const d of by("scheme")) p(`- **Scheme**: ${d.product} does not follow the system scheme (${d.value}). Intent: ${d.chosen}. Evidence: ${ev(d.evidence)}`);
const canv = theme.products.filter(r => r.kind === "web");
p(`- **Canvas**: light ${[...new Set(canv.map(r => r.light.canvas))].join(", ")}; dark ${[...new Set(canv.map(r => r.dark.canvas))].join(", ")} across ${canv.length} web products. Guide: ${theme.tokens["color.background"].light} / ${theme.tokens["color.background"].dark}.`);
p(`- **Radius** (most-used per product): ${canv.map(r => `${r.id} ${(r.light.radius ?? []).join(" ") || "none"}`).join("; ")}. Guide: ${theme.tokens["radius.base"]?.light}.`);
p("");

p("## 4. Chosen values");
p("");
table(["Token", "Light", "Dark", "Confidence", "Why"], Object.entries(theme.tokens).map(([k, t]) => [k, Array.isArray(t.light) ? `${t.light.length} values` : t.light, Array.isArray(t.dark) ? `${t.dark.length} values` : t.dark, t.confidence, t.why + (t.derived ? " **(derived)**" : "")]));

p("## 5. Presets");
p("");
p("One preset per app as it looks today, and one Harmonised preset across all. Each token has a light and a dark value. In an app preset, a token the app does not show is taken from Harmonised and marked \"harmonised (not seen)\".");
p("");
table(["Preset", "Kind", "Tokens seen in the app", "From Harmonised", "background L / D", "foreground L / D", "font"], [["harmonised", "-", "-", "-", `${theme.presets.harmonised.tokens["color.background"].light} / ${theme.presets.harmonised.tokens["color.background"].dark}`, `${theme.presets.harmonised.tokens["color.foreground"].light} / ${theme.presets.harmonised.tokens["color.foreground"].dark}`, theme.presets.harmonised.tokens["font.sans"].light.split(",")[0]], ...Object.entries(theme.presets.apps).map(([a, s]) => [a, s.kind, s.tokensSeen ?? "source", s.tokensFromHarmonised ?? "-", `${s.tokens["color.background"].light} / ${s.tokens["color.background"].dark}`, `${s.tokens["color.foreground"].light} / ${s.tokens["color.foreground"].dark}`, String(s.tokens["font.sans"].light).split(",")[0]])]);
const cfgIssues = by("config");
if (cfgIssues.length) { p("## Config problems"); p(""); for (const d of cfgIssues) p(`- ${d.token}: ${d.value}`); p(""); }
p("## 6. Derived values");
p("");
if (!theme.derived.length) p("None. The guide gives a light and a dark value for every colour token; scheme-independent tokens (corners, fonts, scales, components, colour cycles) carry the same value in both on purpose (`schemeIndependent: true`).");
else table(["Token", "Scheme", "From", "Derived"], theme.derived.map(d => [d.token, d.mode, d.from, d.value]));
p("");
writeFileSync(out, L.join("\n"));
console.log(`report: ${out} (${L.length} lines)`);
