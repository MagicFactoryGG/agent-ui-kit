#!/usr/bin/env bun
// A blend: a brand's own look mixed with another preset (a published system, or another brand's harmonised
// preset). Colours mix in OKLab by --weight (0 = all base, 1 = all other); other values take the side the weight
// leans to; --keep names tokens (or prefixes ending in *) that stay the base's. brand.* always stays the base's.
// Where each value came from is recorded. Mixed style values are the blend's own: no licence is carried. Copied
// material from the other side (a font name, an icon, a component) keeps its licence, and its notice is shown
// and accepted with the blend.
//   bun blend.mjs <base: theme.json or preset.json> <other: preset.json> [--weight 0.5] [--keep a,b*] [--name N] [--out file]
import { readFileSync, writeFileSync } from "node:fs";
import * as C from "./lib/color.mjs";

const args = process.argv.slice(2);
const at = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const [basePath, otherPath] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!basePath || !otherPath) { console.error("usage: blend.mjs <base> <other> [--weight 0.5] [--keep a,b*] [--name N] [--out file]"); process.exit(2); }
const w = at("--weight") != null ? Number(at("--weight")) : 0.5;
if (!(w >= 0 && w <= 1)) { console.error("--weight takes a number from 0 to 1"); process.exit(2); }
const keep = (at("--keep") ?? "").split(",").filter(Boolean).concat(["brand.*"]);
const kept = k => keep.some(p => (p.endsWith("*") ? k.startsWith(p.slice(0, -1)) : k === p));
const load = p => JSON.parse(readFileSync(p, "utf8"));
const base = load(basePath), other = load(otherPath);
const tokensOf = x => x.presets?.harmonised?.tokens ?? x.tokens;
const nameOf = (x, p) => x.name ?? x.presets?.harmonised?.name ?? x.brand ?? p;
const A = tokensOf(base), B = tokensOf(other);
const mixHex = (a, b) => { const la = C.rgbToOklab(C.parse(a).rgb), lb = C.rgbToOklab(C.parse(b).rgb); return C.fromOklabHex(la.map((v, i) => v * (1 - w) + lb[i] * w)); };

const tokens = {}, copied = [];
for (const k of [...new Set([...Object.keys(A), ...Object.keys(B)])]) {
  const a = A[k], b = B[k];
  if (!b || kept(k)) { if (a) tokens[k] = { light: a.light, dark: a.dark, from: "base" }; continue; }
  if (!a) { tokens[k] = { light: b.light, dark: b.dark, from: "other" }; }
  else if (typeof a.light === "string" && C.parse(a.light) && C.parse(b.light) && C.parse(a.dark) && C.parse(b.dark)) {
    tokens[k] = w === 0 ? { light: a.light, dark: a.dark, from: "base" } : w === 1 ? { light: b.light, dark: b.dark, from: "other" } : { light: mixHex(a.light, b.light), dark: mixHex(a.dark, b.dark), from: "mix", weight: w };
  } else tokens[k] = w >= 0.5 ? { light: b.light, dark: b.dark, from: "other" } : { light: a.light, dark: a.dark, from: "base" };
  if (tokens[k].from === "other" && b.origin === "copied") { tokens[k].origin = "copied"; copied.push(k); }
}
const name = at("--name") ?? `${nameOf(base, basePath)} + ${nameOf(other, otherPath)} (${Math.round(w * 100)}%)`;
const blend = {
  $schema: "brand-intake/preset@1",
  name,
  blend: { base: nameOf(base, basePath), other: nameOf(other, otherPath), weight: w, keep },
  // style values mixed in are the blend's own; copied material keeps its licence, accepted with the blend
  licence: copied.length && other.licence ? { ...other.licence, for: copied, acceptBeforeUse: false, acceptedWithBlend: true } : null,
  tokens,
};
const out = at("--out");
if (out) writeFileSync(out, `${JSON.stringify(blend, null, 1)}\n`);
else process.stdout.write(JSON.stringify(blend, null, 1));
const count = f => Object.values(tokens).filter(t => t.from === f).length;
console.error(`${name}: ${count("base")} from base, ${count("mix")} mixed, ${count("other")} from other${copied.length ? `; copied, licence kept: ${copied.join(", ")}` : ""}`);
