// Finds a role's token in any design system's own vocabulary (no guide, names unknown): common name words
// decide the candidates, and what the pages draw breaks ties. Generic words only; no system's names are listed.
import * as C from "./color.mjs";

const W = {
  surface: /(^|-)(bg|bgcolor|background|canvas|surface|base|layer|page)(-|$)/,
  ink: /(^|-)(fg|fgcolor|text|textcolor|foreground|ink|content)(-|$)/,
  line: /(^|-)(border|bordercolor|line|stroke|divider|outline|hairline)(-|$)/,
  plain: /(^|-)(default|primary|base|main|normal|canvas|page|body)(-|$)/,
  quiet: /(^|-)(muted|secondary|subtle|soft|weak|tertiary|recessed|dim)(-|$)/,
  raised: /(^|-)(card|elevated|raised|overlay|layer-?01|panel)(-|$)/,
  hover: /(^|-)(hover|fill-hover|neutral-muted|layer-hover)(-|$)/,
  action: /(^|-)(button-primary|brand|accent|interactive|primary|action|cta)(-|$)/,
  danger: /(^|-)(danger|error|critical|destructive|negative)(-|$)/,
  ok: /(^|-)(success|positive|ok)(-|$)/,
  warn: /(^|-)(warning|attention|caution)(-|$)/,
  focus: /(^|-)(focus|ring)(-|$)/,
  onColour: /(^|-)(on-?color|on-?emphasis|on-?primary|inverse|fg-?rest|fgcolor-rest|contrast)(-|$)/,
  avoid: /(hover|active|pressed|disabled|inactive|placeholder|selected|emphasis-hover|shadow|scrim|transparent|tint|badge|banner|chart|syntax|diff|prettylights|alpha|-[0-9]{2,3}$)/,
};
// each role: words that must match, words that add, words that subtract
const ROLES = {
  background: { must: ["surface"], add: ["plain"], sub: ["quiet", "raised", "action", "danger", "ok", "warn", "ink", "line", "hover"] },
  foreground: { must: ["ink"], add: ["plain"], sub: ["quiet", "action", "danger", "ok", "warn", "onColour", "surface", "line"] },
  "muted-foreground": { must: ["ink", "quiet"], add: [], sub: ["action", "danger", "ok", "warn", "surface"] },
  border: { must: ["line"], add: ["plain"], sub: ["quiet", "action", "danger", "ok", "warn", "focus"] },
  muted: { must: ["surface", "quiet"], add: [], sub: ["ink", "action", "danger", "ok", "warn", "line"] },
  card: { must: ["raised"], add: ["surface"], sub: ["ink", "line", "hover"] },
  popover: { must: ["raised"], add: ["surface"], sub: ["ink", "line", "hover"] },
  accent: { must: ["hover"], add: ["surface"], sub: ["ink", "line", "action", "danger"] },
  primary: { must: ["action"], add: ["surface"], sub: ["ink", "line", "quiet", "onColour"] },
  "primary-foreground": { must: ["action", "ink"], add: ["onColour"], sub: ["surface", "line"] },
  ring: { must: ["focus"], add: [], sub: [] },
  destructive: { must: ["danger"], add: ["ink"], sub: ["surface", "line", "quiet"] },
  "destructive-foreground": { must: ["onColour"], add: ["ink"], sub: ["line"] },
  success: { must: ["ok"], add: ["ink"], sub: ["surface", "line", "quiet"] },
  warning: { must: ["warn"], add: ["ink"], sub: ["surface", "line", "quiet"] },
};

const norm = n => n.toLowerCase().replace(/^--/, "").replace(/_/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2");

/** Best { name, value } for a role among a product's resolved custom properties, or null. drawn: a colour the
 *  pages show in this role (canvas, strongest text, …) to break ties; otherScheme: the same tokens in the other
 *  scheme, when the page switched, to prefer tokens that follow the scheme. */
export function discoverRole(role, tokens, drawn, otherScheme) {
  const r = ROLES[role];
  if (!r) return null;
  let best = null;
  for (const [name, value] of Object.entries(tokens ?? {})) {
    const n = norm(name);
    if (!C.parse(value) || W.avoid.test(n)) continue;
    if (!r.must.every(w => W[w].test(n))) continue;
    let s = 10 + r.add.filter(w => W[w].test(n)).length * 3 - r.sub.filter(w => W[w].test(n)).length * 4 - n.split("-").length * 0.2;
    if (drawn && C.parse(drawn) && C.deltaE(C.toHex(value), C.toHex(drawn)) < 0.02) s += 5;
    // a themed system's tokens change between light and dark; a stale one keeps its value
    if (otherScheme && otherScheme[name] != null && otherScheme[name] !== value) s += 4;
    if (!best || s > best.s) best = { name, value, s };
  }
  return best && best.s > 0 ? { name: best.name, value: best.value } : null;
}
export const DISCOVERABLE = Object.keys(ROLES);

const ROLE_WORD = /^(color|colors|text|bg|bgcolor|background|border|bordercolor|fg|fgcolor|font|theme|sys|ref|token|tokens|var)$/;
/** A token's vocabulary: the first name segment that is not a role word ("--cds-background" → "cds",
 *  "--color-kumo-base" → "kumo"); "" for a bare name ("--background", "--bgColor-default"). */
export function familyOf(name) {
  const segs = norm(name).split("-").filter(Boolean);
  if (segs.length < 2) return "";
  const f = segs.slice(0, -1).find(x => !ROLE_WORD.test(x) && !Object.values(W).some(w => w.test(x)));
  return f ?? "";
}
/** Which vocabulary explains what the page draws: per family, how many drawn colours one of its tokens equals. */
export function familyEvidence(tokens, drawn) {
  const byFam = {};
  for (const [n, v] of Object.entries(tokens ?? {})) { if (!C.parse(v)) continue; (byFam[familyOf(n)] ??= new Set()).add(C.toHex(v).slice(0, 7)); }
  const out = {};
  // a vocabulary names the basic roles itself; a palette (gray-0 … gray-9) or one component's tokens do not
  const basic = ["background", "foreground", "border", "muted-foreground"];
  const qualifies = f => basic.filter(r => discoverRole(r, Object.fromEntries(Object.entries(tokens).filter(([n]) => familyOf(n) === f)))).length >= 3;
  for (const [f, vals] of Object.entries(byFam)) if (qualifies(f)) out[f] = drawn.filter(d => d && C.parse(d) && [...vals].some(v => C.deltaE(v, C.toHex(d).slice(0, 7)) < 0.02)).length;
  return out;
}

/** How many roles a vocabulary names itself (a system's vocabulary covers many; one component's covers few). */
export function familyCoverage(tokens, fam) {
  const own = Object.fromEntries(Object.entries(tokens ?? {}).filter(([n]) => familyOf(n) === fam));
  return DISCOVERABLE.filter(r => discoverRole(r, own)).length;
}
