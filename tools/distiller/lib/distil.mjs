// The Distiller's analysis, as a function: merges the guide, live web and native readings saved in a run into a
// Theme (every token with a light and a dark value, a confidence and its sources), per-app presets, a Harmonised
// preset and the divergences. Authority when sources disagree: the guide, then published tokens, then what most
// live products do. Outliers are reported, never adopted. A missing scheme is derived (hue kept, text contrast at
// least 4.5:1) and marked as derived.
//
// Harmonised is worked out from a reference set: { reference: [app ids] (default: all), useGuide: bool (default
// true) }. Apps outside it are still read and measured against it. Reads only the saved run (no browsing; the
// screenshots' pixels are sampled once and kept in <run>/pixels.json), so it is quick enough to run on each change.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import * as C from "./color.mjs";
import { samplePixels } from "./pixels.mjs";
import { launch } from "./chromium.mjs";
import { discoverRole, DISCOVERABLE, familyOf, familyEvidence, familyCoverage } from "./roles.mjs";

export async function distil({ cfg, runDir, reference = null, useGuide = true }) {
  const SAME = 0.02; // OKLab distance under which two colours count as the same (a just-visible step is ~0.02)
  const MODES = ["light", "dark"];
  const rel = p => (isAbsolute(p) ? relative(runDir, p) : p);
  const load = p => JSON.parse(readFileSync(p, "utf8"));
  
  let guide = existsSync(join(runDir, "guide/guide.json")) ? load(join(runDir, "guide/guide.json")) : null;
  const pages = load(join(runDir, "web/pages.json"));
  const nativeDir = join(runDir, "native");
  const nativeRuns = existsSync(nativeDir) ? readdirSync(nativeDir).filter(f => f.endsWith(".json") && !f.endsWith(".source.json")).map(f => load(join(nativeDir, f))) : [];
  const nativeSrc = existsSync(nativeDir) ? readdirSync(nativeDir).filter(f => f.endsWith(".source.json")).map(f => ({ file: join(nativeDir, f), ...load(join(nativeDir, f)) })) : [];
  
  // ---------- pixels: the canvas colour of every screenshot ----------
  // sampled once per run and kept in <run>/pixels.json, so harmonising again needs no browser
  const shots = [...pages.flatMap(p => MODES.map(m => p.modes[m]?.screenshot)), ...nativeRuns.flatMap(n => MODES.map(m => n.modes[m]?.screenshot))].filter(Boolean);
  const pxFile = join(runDir, "pixels.json");
  let px = existsSync(pxFile) ? load(pxFile) : {};
  if (shots.some(s => !px[s])) {
    const browser = await launch();
    const abs = await samplePixels(browser, shots.map(s => (isAbsolute(s) ? s : join(runDir, s))));
    px = Object.fromEntries(shots.map(s => [s, abs[isAbsolute(s) ? s : join(runDir, s)]]));
    await browser.close();
    writeFileSync(pxFile, JSON.stringify(px));
  }
  
  // ---------- per-product, per-mode observations ----------
  const usable = p => p.modes.light && !p.modes.light.error && p.modes.light.status < 400 && p.modes.light.elements >= 3 && p.modes.light.page?.title !== "";
  const top = (counts, n = 1) => Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const merge = (into, from) => { for (const [k, v] of Object.entries(from ?? {})) into[k] = (into[k] ?? 0) + v; return into; };
  const firstFamily = f => f?.split(",")[0].replace(/["']/g, "").trim();
  const products = {};
  const skipped = [];
  for (const p of pages) {
    if (!usable(p)) { skipped.push({ url: p.url, why: p.modes.light?.status >= 400 ? `HTTP ${p.modes.light.status}` : p.modes.light?.error ? "error" : "not an HTML page" }); continue; }
    const prod = (products[p.product] ??= { id: p.product, kind: "web", pages: [], modes: { light: { counts: {} }, dark: { counts: {} } } });
    prod.pages.push(p.url);
    for (const m of MODES) {
      const d = p.modes[m]; if (!d || d.error) continue;
      const o = prod.modes[m];
      for (const [k, v] of Object.entries(d.counts)) merge((o.counts[k] ??= {}), v);
      (o.canvas ??= []).push({ hex: px[d.screenshot]?.canvas, shot: d.screenshot, url: p.url });
      o.tokens = { ...(o.tokens ?? {}), ...Object.fromEntries(Object.entries(d.resolvedCustomProperties ?? {}).map(([k, v]) => [k, C.pickScheme(v, m)])) };
      if (d.forcedDark) o.forcedDark = d.forcedDark;
      o.fonts = [...new Set([...(o.fonts ?? []), ...d.page.fontsLoaded])];
    }
  }
  for (const n of nativeRuns) {
    const prod = (products[n.product] ??= { id: n.product, kind: "native", pages: [n.bundle], modes: { light: { counts: {} }, dark: { counts: {} } } });
    for (const m of MODES) {
      const d = n.modes[m]; if (!d) continue;
      const s = px[d.screenshot];
      prod.modes[m].canvas = [{ hex: s?.canvas, shot: d.screenshot }];
      prod.modes[m].counts.pixels = Object.fromEntries((s?.colours ?? []).map(c => [c.hex, c.share]));
      const nodes = d.accessibility?.data?.nodes ?? [];
      prod.modes[m].a11y = { nodes: nodes.length, labels: nodes.filter(x => x.label).slice(0, 12).map(x => `${x.type}: ${x.label}`) };
    }
  }
  const mostCommon = (arr) => { const c = {}; for (const a of arr) if (a) c[a] = (c[a] ?? 0) + 1; return top(c)[0]?.[0]; };
  for (const prod of Object.values(products)) for (const m of MODES) {
    const o = prod.modes[m];
    o.canvasHex = mostCommon((o.canvas ?? []).map(c => c.hex));
    o.text = top(o.counts.text, 3).map(([v, w]) => ({ hex: C.toHex(v), weight: Math.round(w) }));
    o.border = top(o.counts.border, 2).map(([v, w]) => ({ hex: C.toHex(v), weight: Math.round(w) }));
    o.font = firstFamily(top(o.counts.fontFamily)[0]?.[0]);
    o.radius = top(o.counts.radius, 4).map(([v]) => (parseFloat(v) >= 999 ? "full" : v));
    o.fontSizes = top(o.counts.fontSize, 8).map(([v]) => v).sort((a, b) => parseFloat(a) - parseFloat(b));
    o.weights = top(o.counts.fontWeight, 4).map(([v]) => v).sort();
    o.spacing = top(o.counts.spacing, 10).map(([v]) => v).sort((a, b) => parseFloat(a) - parseFloat(b));
    o.controls = top(o.counts.control, 4).map(([v]) => v);
    o.transitions = top(o.counts.transition, 3).map(([v]) => v);
  }
  
  // ---------- the reference set: what Harmonised is worked out from ----------
  // Any apps, and the guide or not. Apps outside it are still read and measured against it.
  const allIds = [...Object.keys(products), ...nativeSrc.map(n => n.product)];
  const refIds = reference ?? allIds;
  for (const id of refIds) if (!allIds.includes(id)) throw new Error(`reference: no source "${id}" in this run (sources: ${allIds.join(", ")})`);
  const inRef = id => refIds.includes(id);
  const realGuide = guide;
  const guideUsed = useGuide && !!realGuide;
  const refName = `Harmonised: ${[...(guideUsed ? ["guide"] : []), ...refIds].join(" + ")}`;
  // ---------- no guide (absent, or not ticked): the published tokens most reference apps share stand in for it ----------
  const SEMANTIC = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring", "success", "warning"];
  let vocab = null;
  if (!guideUsed) {
    guide = { ...(realGuide ?? { themeAliases: {}, literals: [], keyframes: {} }), id: refName, tokens: { light: {}, dark: {} } };
    const refProducts = Object.values(products).filter(p => inRef(p.id));
    const refSrc = nativeSrc.filter(n => inRef(n.product));
    const names = [...new Set([...SEMANTIC.map(n => `--${n}`), ...Object.keys(realGuide?.tokens.light ?? {}), ...Object.keys(realGuide?.tokens.dark ?? {})])];
    // When a page carries several token vocabularies, the one whose values match what it draws is its own.
    vocab = {};
    for (const p of refProducts) for (const m of MODES) {
      const o = p.modes[m];
      const drawn = [o.canvasHex, ...o.text.map(x => x.hex), ...o.border.map(x => x.hex), ...(o.controls ?? []).map(c => C.toHex(c.split(" | ")[0]))].filter(Boolean);
      (vocab[p.id] ??= {})[m] = { evidence: familyEvidence(o.tokens, drawn) };
    }
    // one vocabulary per product, in both schemes: evidence from both, plus two points per role it names
    for (const p of refProducts) {
      const fams = new Set(MODES.flatMap(m => Object.keys(vocab[p.id][m].evidence)));
      const score = f => MODES.reduce((s, m) => s + (vocab[p.id][m].evidence[f] ?? 0), 0) + 2 * familyCoverage(p.modes.light.tokens, f);
      const best = [...fams].sort((a, b) => score(b) - score(a))[0] ?? "";
      for (const m of MODES) Object.assign(vocab[p.id][m], { best, score: score(best) });
    }
    const ownTokens = (p, m) => { const v = vocab[p.id][m]; return Object.fromEntries(Object.entries(p.modes[m].tokens ?? {}).filter(([k]) => familyOf(k) === v.best)); };
    for (const m of MODES) for (const name of names) {
      const n = name.slice(2);
      // authority 2: published tokens of the reference apps (a native token file counts as published), in each
      // app's own vocabulary
      const votes = [...refProducts.map(p => { const t = ownTokens(p, m); return t[name] ?? t[`--color-${n}`]; }), ...refSrc.map(s => s.tokens[m]?.[name])]
        .filter(v => v && C.parse(v)).map(v => (C.parse(v).alpha < 1 ? C.over(v, m === "dark" ? "#000000" : "#ffffff") : C.toHex(v)));
      const tieNote = vs => { const c = {}; for (const v of vs) c[v] = (c[v] ?? 0) + 1; const n = Object.values(c).sort((x, y) => y - x); return n.length > 1 && n[0] === n[1] ? " (a tie: the first app in the reference order wins)" : ""; };
      let pick = mostCommon(votes), at = pick && `published by ${votes.filter(v => v === pick).length} of ${refProducts.length + refSrc.length} reference apps${tieNote(votes)}`;
      // still authority 2: the reference apps' own vocabulary (names unknown), found by role words
      if (!pick && DISCOVERABLE.includes(n)) {
        const found = refProducts.map(p => {
          const o = p.modes[m];
          const drawn = n === "background" ? o.canvasHex : n === "foreground" ? o.text[0]?.hex : n === "border" ? o.border[0]?.hex : null;
          const other = m === "dark" ? "light" : "dark";
          const canvasSwitched = o.canvasHex && p.modes[other].canvasHex && C.deltaE(o.canvasHex, p.modes[other].canvasHex) > 0.3;
          const ot = p.modes[other].tokens ?? {}, changed = Object.keys(o.tokens ?? {}).filter(k => ot[k] != null && ot[k] !== o.tokens[k]).length;
          const tokensSwitched = changed >= 10;
          const otherTokens = canvasSwitched || tokensSwitched ? ot : null;
          // tokens that switched while the canvas did not: the drawn colour is no evidence for this scheme
          const evidence = !canvasSwitched && tokensSwitched && m === "dark" ? null : drawn;
          return discoverRole(n, ownTokens(p, m), evidence, otherTokens) ?? discoverRole(n, o.tokens, evidence, otherTokens);
        }).filter(Boolean);
        const vals = found.map(f => (C.parse(f.value).alpha < 1 ? C.over(f.value, m === "dark" ? "#000000" : "#ffffff") : C.toHex(f.value)));
        pick = mostCommon(vals);
        if (pick) at = `published as ${[...new Set(found.filter((f, i) => vals[i] === pick).map(f => f.name))].join(", ")} by ${vals.filter(v => v === pick).length} of ${refProducts.length} reference apps (found by role words)${tieNote(vals)}`;
      }
      // authority 3: what the reference apps draw
      if (!pick) {
        const drawn = refProducts.map(p => {
          const o = p.modes[m];
          const inks = (p.kind === "native" ? Object.keys(o.counts.pixels ?? {}) : o.text.map(x => x.hex)).filter(Boolean).sort((a, b) => C.contrast(b, o.canvasHex ?? "#fff") - C.contrast(a, o.canvasHex ?? "#fff"));
          return name === "--background" ? o.canvasHex : name === "--foreground" ? inks[0] : name === "--muted-foreground" && p.kind === "web" && inks.length > 1 ? inks.at(-1) : name === "--border" ? o.border[0]?.hex : null;
        }).filter(Boolean).map(v => (C.parse(v).alpha < 1 ? C.over(v, m === "dark" ? "#000000" : "#ffffff") : C.toHex(v)));
        pick = mostCommon(drawn); at = pick && `drawn by ${drawn.filter(v => v === pick).length} of ${refProducts.length} reference apps${tieNote(drawn)}`;
      }
      // not shown by any reference app: the guide's value fills it, marked
      if (!pick && realGuide?.tokens[m][name]) { pick = C.toHex(realGuide.tokens[m][name].value) ?? realGuide.tokens[m][name].value; at = "fill: no reference app shows it; the guide's value"; }
      if (pick) guide.tokens[m][name] = { value: pick, at };
    }
  }
  
  // ---------- theme ----------
  const theme = { $schema: "brand-intake/theme@1", brand: cfg.brand, generated: new Date().toISOString(), authority: ["guide", "published tokens", "majority of live products"], sameColourThreshold: `OKLab ${SAME}`, tokens: {}, checks: {} };
  const divergences = []; // {kind, token, mode, product, value, chosen, dE, evidence}
  const evidenceOf = (prod, m) => (prod.modes[m].canvas ?? []).map(c => rel(c.shot)).slice(0, 2);
  const derivedList = [];
  const resolveGuide = (name, m) => {
    let v = guide?.tokens[m][name] ?? (m === "dark" ? null : null);
    return v;
  };
  // Which live reading answers which guide token (observed role); published tokens use the same name.
  // Each observed colour is matched to the nearest guide token of its role (canvas -> surfaces, text -> inks,
  // border -> lines). A match counts as agreement for that token; no match within SAME is an off-scale colour.
  const ROLE_TOKENS = {
    canvas: ["--background", "--card", "--muted", "--secondary", "--popover"],
    text: ["--foreground", "--muted-foreground", "--card-foreground", "--primary"],
    border: ["--border", "--input"],
  };
  const observedFor = {}; // token -> mode -> [{product, value, evidence}]
  const offScale = [];
  const surfaceOf = (prod, m) => prod.modes[m].canvasHex ?? (m === "dark" ? "#000000" : "#ffffff");
  for (const prod of Object.values(products)) for (const m of MODES) {
    const o = prod.modes[m];
    const readings = [["canvas", o.canvasHex], ...o.text.map(t => ["text", t.hex]), ...o.border.map(b => ["border", b.hex])].filter(([, v]) => v);
    for (const [role, raw] of readings) {
      const v = C.parse(raw).alpha < 1 ? C.over(raw, surfaceOf(prod, m)) : raw;
      const cands = ROLE_TOKENS[role].map(n => guide?.tokens[m][n] && [n, C.toHex(guide.tokens[m][n].value)]).filter(Boolean);
      const best = cands.map(([n, h]) => [n, h, C.deltaE(v, h)]).sort((a, b) => a[2] - b[2])[0];
      if (best && best[2] < SAME) ((observedFor[best[0]] ??= {})[m] ??= []).push({ product: prod.id, value: v, role, evidence: evidenceOf(prod, m) });
      else offScale.push({ kind: "off-scale", role, mode: m, product: prod.id, inReference: inRef(prod.id), value: raw === v ? v : `${raw} (= ${v} on its canvas)`, nearest: best && `${best[0]} ${best[1]}`, dE: best && +best[2].toFixed(3), evidence: evidenceOf(prod, m) });
    }
  }
  
  function colourToken(name, role) {
    const t = { type: "color", light: null, dark: null, confidence: null, sources: [], agreement: {} };
    for (const m of MODES) {
      const g = guide?.tokens[m][name];
      if (g) { t[m] = C.toHex(g.value); t.sources.push({ kind: "guide", mode: m, at: `${guide.id}:${g.at}`, value: g.value }); }
    }
    // published + observed per product
    for (const prod of Object.values(products)) for (const m of MODES) {
      const o = prod.modes[m];
      const pub = o.tokens?.[name] ?? o.tokens?.[`--color-${name.slice(2)}`];
      // a translucent value is compared as drawn: over the guide's background for this scheme
      const pubHex = pub && C.parse(pub) ? (C.parse(pub).alpha < 1 ? C.over(pub, C.toHex(guide?.tokens[m]["--background"]?.value ?? (m === "dark" ? "#000" : "#fff"))) : C.toHex(pub)) : null;
      const obs = (observedFor[name]?.[m] ?? []).filter(x => x.product === prod.id).map(x => x.value)[0];
      for (const [kind, val] of [["published", pubHex], ["observed", obs]]) {
        if (!val) continue;
        const ref = t[m];
        const dE = ref ? C.deltaE(val, ref) : null;
        const agrees = ref ? dE < SAME : null;
        t.sources.push({ kind, mode: m, product: prod.id, value: val, agrees, inReference: inRef(prod.id), evidence: evidenceOf(prod, m) });
        (t.agreement[m] ??= { agree: 0, disagree: 0 });
        if (inRef(prod.id)) { if (agrees === true) t.agreement[m].agree++; else if (agrees === false) t.agreement[m].disagree++; }
        if (agrees === false) divergences.push({ kind: "guide-vs-product", via: kind, token: name, mode: m, product: prod.id, inReference: inRef(prod.id), value: val, chosen: ref, dE: +dE.toFixed(3), evidence: evidenceOf(prod, m) });
      }
    }
    // fill a missing mode: published majority, else derive
    for (const m of MODES) if (!t[m]) {
      const other = m === "light" ? "dark" : "light";
      if (t[other]) {
        t[m] = C.deriveOther(t[other], { role: role ?? "accent" });
        t.derived = { mode: m, from: other, rule: "hue kept, lightness mirrored" };
        derivedList.push({ token: name, mode: m, from: t[other], value: t[m] });
      }
    }
    const a = Object.values(t.agreement);
    const agree = a.reduce((s, x) => s + x.agree, 0), dis = a.reduce((s, x) => s + x.disagree, 0);
    t.confidence = t.derived ? "low" : agree > 0 && agree >= dis ? "high" : "medium";
    const basis = guideUsed ? "guide value (authority 1)" : `reference value (${(guide.tokens.light[name] ?? guide.tokens.dark[name])?.at})`;
    if (!guideUsed && /^fill/.test((guide.tokens.light[name] ?? guide.tokens.dark[name])?.at ?? "")) t.confidence = "low";
    t.why = t.derived ? `${guideUsed ? "the guide" : "the reference"} gives only ${t.derived.from}; ${t.derived.mode} derived` : `${basis}; ${agree} reference readings agree, ${dis} differ`;
    return t;
  }
  const roleOf = n => /foreground|^--foreground/.test(n) ? "text" : /background|card|popover|muted$|secondary$|accent$/.test(n) ? "surface" : "accent";
  if (guide) for (const name of new Set([...Object.keys(guide.tokens.light), ...Object.keys(guide.tokens.dark)])) {
    const lv = guide.tokens.light[name]?.value ?? guide.tokens.dark[name]?.value;
    if (C.parse(lv)) theme.tokens[`color.${name.slice(2)}`] = colourToken(name, roleOf(name));
  }
  const surfaceToken = k => (k === "color.foreground" ? theme.tokens["color.background"] : theme.tokens[k.replace(/-foreground$/, "")]) ?? theme.tokens["color.background"];
  // text tokens: when derived, keep 4.5:1 against the derived surface
  for (const [k, t] of Object.entries(theme.tokens)) if (t.derived && /foreground/.test(k)) {
    const surf = surfaceToken(k);
    const m = t.derived.mode;
    t[m] = C.deriveOther(t[t.derived.from], { role: "text", against: surf[m] });
    t.contrast = +C.contrast(t[m], surf[m]).toFixed(2);
  }
  
  // radius (guide), scheme-independent: written in both modes on purpose
  const radiusG = guide?.tokens.light["--radius"];
  if (radiusG) {
    const live = Object.values(products).filter(p => p.kind === "web").map(p => ({ product: p.id, radius: p.modes.light.radius }));
    theme.tokens["radius.base"] = { type: "length", light: radiusG.value, dark: radiusG.value, schemeIndependent: true, confidence: "high", sources: [{ kind: "guide", at: `${guide.id}:${radiusG.at}` }, ...live.map(l => ({ kind: "observed", product: l.product, value: l.radius }))], why: "guide; most-used live radii listed for comparison" };
    for (const [k, d] of [["radius.md", "calc(var(--radius) - 2px)"], ["radius.sm", "calc(var(--radius) - 4px)"]]) theme.tokens[k] = { type: "length", light: d, dark: d, schemeIndependent: true, confidence: "high", sources: [{ kind: "guide", at: `${guide.id}:${guide.themeAliases[`--radius-${k.split(".")[1]}`]?.at}` }], why: "guide alias" };
  }
  
  // type: the guide sets no font; published --font-sans, then majority of live products (by text weight)
  const fontVotes = {};
  for (const p of Object.values(products)) if (p.kind === "web" && inRef(p.id)) {
    const pub = firstFamily(p.modes.light.tokens?.["--font-sans"] ?? p.modes.light.tokens?.["--default-font-family"]);
    const used = p.modes.light.font;
    (fontVotes[used] ??= []).push({ product: p.id, published: pub, used });
  }
  const nativeFonts = nativeSrc.filter(n => inRef(n.product)).flatMap(n => Object.keys(n.fonts).map(f => f.split("-")[0]));
  const fontRank = Object.entries(fontVotes).sort((a, b) => b[1].length - a[1].length);
  // authority 2: published --font-sans (by product, not by page)
  const pubVotes = {};
  for (const p of Object.values(products)) if (p.kind === "web" && inRef(p.id)) { const v = p.modes.light.tokens?.["--font-sans"]; if (v) (pubVotes[v] ??= []).push(p.id); }
  const pubRank = Object.entries(pubVotes).sort((a, b) => b[1].length - a[1].length);
  const guideFont = useGuide ? cfg.guide?.font : null;
  const chosenFont = guideFont ?? pubRank[0]?.[0] ?? fontRank[0]?.[0] ?? (nativeFonts[0] ? nativeFonts[0] : "system-ui, sans-serif");
  const tie = pubRank.length > 1 && pubRank[0][1].length === pubRank[1][1].length;
  theme.tokens["font.sans"] = {
    type: "fontFamily", light: chosenFont, dark: chosenFont, schemeIndependent: true,
    confidence: guideFont ? "high" : "low",
    sources: [...(guideFont ? [{ kind: "guide", value: guideFont }] : []), ...pubRank.map(([v, ps]) => ({ kind: "published", value: v, products: ps })), ...fontRank.flatMap(([f, v]) => v.map(x => ({ kind: "observed", product: x.product, value: f }))), ...nativeSrc.map(n => ({ kind: "native-source", product: n.product, value: Object.keys(n.fonts).join(", ") }))],
    why: guideFont ? `the guide names it. Live use: ${fontRank.map(([f, v]) => `${f} (${v.map(x => x.product).join(", ")})`).join("; ")}.` : `the guide sets no font. Published --font-sans: ${pubRank.map(([v, ps]) => `${firstFamily(v)} (${ps.join(", ")})`).join("; ")}${tie ? " (a tie)" : ""}. Drawn: ${fontRank.map(([f, v]) => `${f} (${v.map(x => x.product).join(", ")})`).join("; ")}${nativeFonts.length ? `; native source ships ${[...new Set(nativeFonts)].join(", ")}` : ""}. Published tokens come before what most apps draw. Low confidence: the guide does not name a font.`,
  };
  for (const p of Object.values(products)) if (p.kind === "web" && firstFamily(chosenFont) !== p.modes.light.font) divergences.push({ kind: "font", product: p.id, inReference: inRef(p.id), value: p.modes.light.font, chosen: firstFamily(chosenFont), evidence: evidenceOf(p, "light") });
  // type scale, weights, spacing: union of the most-used values across live products, kept where >= 2 products use them
  const refWeb = Object.values(products).filter(p => p.kind === "web" && inRef(p.id));
  const scale = key => {
    const c = {};
    for (const p of refWeb) for (const v of new Set(p.modes.light[key])) c[v] = (c[v] ?? 0) + 1;
    return Object.entries(c).filter(([, n]) => n >= Math.min(2, refWeb.length)).map(([v]) => v).sort((a, b) => parseFloat(a) - parseFloat(b));
  };
  for (const [k, key] of [["type.sizes", "fontSizes"], ["type.weights", "weights"], ["space.scale", "spacing"]]) {
    const v = scale(key);
    theme.tokens[k] = { type: "scale", light: v, dark: v, schemeIndependent: true, confidence: "medium", sources: Object.values(products).filter(p => p.kind === "web").map(p => ({ kind: "observed", product: p.id, value: p.modes.light[key] })), why: "the guide sets none; values most-used on at least two live products" };
  }
  
  // Component tokens from the guide's literals, as the brand config names them (guide.components):
  //   [{ prefix, selector, why, props: { <token>: [<css property>, <nth colour in the value>?] } }]
  // and colour cycles from keyframes (guide.keyframes: { <token>: { name, prop, why } }). They draw the same in
  // both schemes (a brand mark does not change with the scheme), so both values are written.
  const norm = x => x.replace(/\s+/g, " ").trim();
  const fixed = (k, v, at, why) => { theme.tokens[k] = { type: typeof v === "string" && C.parse(v) ? "color" : "value", light: v, dark: v, schemeIndependent: true, confidence: "high", sources: [{ kind: "guide", at: `${guide.id}:${at}` }], why }; };
  for (const comp of cfg.guide?.components ?? []) {
    const decls = guide.literals.filter(d => norm(d.selector) === norm(comp.selector));
    for (const [tok, [prop, nth]] of Object.entries(comp.props)) {
      const d = decls.find(x => x.prop === prop);
      if (!d) { divergences.push({ kind: "config", token: `${comp.prefix}.${tok}`, value: `no ${prop} under ${comp.selector} in the guide` }); continue; }
      const v = nth == null ? d.value : (d.value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/gi) ?? [])[nth];
      fixed(`${comp.prefix}.${tok}`, v, d.at, comp.why ?? "component value from the guide");
    }
  }
  for (const [tok, k] of Object.entries(cfg.guide?.keyframes ?? {})) {
    const frames = guide.keyframes[k.name] ?? [];
    const stops = frames.map(f => f[k.prop]).filter(Boolean);
    theme.tokens[tok] = { type: "cycle", light: stops, dark: stops, schemeIndependent: true, confidence: stops.length ? "high" : "low", sources: [{ kind: "guide", at: `${guide.id}: @keyframes ${k.name}` }], why: k.why ?? "colour cycle from the guide's keyframes" };
  }
  
  // ---------- checks ----------
  const one = Object.entries(theme.tokens).filter(([, t]) => t.light == null || t.dark == null || t.light === undefined || t.dark === undefined).map(([k]) => k);
  theme.checks.everyTokenHasLightAndDark = { pass: one.length === 0, failing: one };
  const lowText = Object.entries(theme.tokens).filter(([k, t]) => /foreground/.test(k) && t.type === "color").flatMap(([k, t]) => MODES.map(m => {
    const surf = surfaceToken(k);
    const r = C.contrast(t[m], surf[m]); return r < 4.5 ? { token: k, mode: m, contrast: +r.toFixed(2), on: surf[m] } : null;
  })).filter(Boolean);
  theme.checks.textContrastAtLeast4_5 = { pass: lowText.length === 0, failing: lowText };
  // Decided here, not asked: a text pair under 4.5:1 takes the nearest value with the same hue that reaches it
  // (the ink moves; for white or near-white words, the face darkens instead). The report gives the reasoning.
  for (const f of lowText) {
    const t = theme.tokens[f.token], surf = surfaceToken(f.token);
    const ink = t[f.mode], face = surf[f.mode];
    const { L, C: ch, H } = C.oklch(ink);
    let prop = null;
    if (C.oklch(ink).L < 0.98) { const dir = C.oklch(face).L > 0.5 ? -1 : 1; for (let l = L; l >= 0 && l <= 1; l += dir * 0.005) { const h = C.fromOklch(l, ch, H); if (C.contrast(h, face) >= 4.5) { prop = { token: f.token, mode: f.mode, value: h, contrast: +C.contrast(h, face).toFixed(2) }; break; } } }
    if (!prop || C.oklch(ink).L >= 0.98) { const s2 = C.oklch(face); for (let l = s2.L; l >= 0; l -= 0.005) { const h = C.fromOklch(l, s2.C, s2.H); if (C.contrast(ink, h) >= 4.5) { prop = { token: Object.entries(theme.tokens).find(([, v]) => v === surf)[0], mode: f.mode, value: h, contrast: +C.contrast(ink, h).toFixed(2), note: "darken the face; white words stay" }; break; } } }
    if (!prop) { divergences.push({ kind: "contrast", token: f.token, mode: f.mode, value: `${ink} on ${face} = ${f.contrast}:1`, chosen: "unchanged: no value with this hue reaches 4.5:1" }); continue; }
    const target = theme.tokens[prop.token];
    const was = target[f.mode];
    target[f.mode] = prop.value;
    (target.decided ??= []).push({ mode: f.mode, was, now: prop.value, why: `${f.token} on its surface was ${f.contrast}:1 in ${f.mode}; ${prop.note ? "the face darkened and the white words stay" : "the ink moved"}: now ${prop.contrast}:1, same hue` });
    divergences.push({ kind: "contrast", token: f.token, mode: f.mode, value: `${ink} on ${face} = ${f.contrast}:1`, chosen: `${prop.token} ${f.mode}: ${was} → ${prop.value} (${prop.contrast}:1, same hue${prop.note ? `; ${prop.note}` : ""})` });
  }
  // Status colours used as words on a surface: a fill or a face behind white words cannot also be dark-enough
  // (or light-enough) words on the card, so each gets a text token of the same hue that reads at 4.5:1 or more on
  // the card and the page in both schemes. The fill and face values stay.
  for (const st of ["success", "warning", "destructive"]) {
    const t = theme.tokens[`color.${st}`];
    if (!t || t.type !== "color") continue;
    const text = { type: "color", light: null, dark: null, confidence: t.confidence, sources: [{ kind: "decided", from: `color.${st}` }], decided: [] };
    for (const m of MODES) {
      const surfaces = ["color.card", "color.background"].map(k => theme.tokens[k]?.[m]).filter(Boolean);
      const worst = () => Math.min(...surfaces.map(sf => C.contrast(text[m], sf)));
      text[m] = t[m];
      const before = +worst().toFixed(2);
      if (before < 4.5) {
        const { L, C: ch, H } = C.oklch(t[m]);
        const dir = C.oklch(surfaces[0]).L > 0.5 ? -1 : 1;
        for (let l = L; l >= 0 && l <= 1 && worst() < 4.5; l += dir * 0.005) text[m] = C.fromOklch(l, ch, H);
      }
      const after = +worst().toFixed(2);
      if (text[m] !== t[m]) text.decided.push({ mode: m, was: t[m], now: text[m], why: `${st} as words on the card or page was ${before}:1 in ${m}; same hue, now ${after}:1. color.${st} stays for fills and faces.` });
    }
    text.why = text.decided.length ? `decided: ${st} as words, at least 4.5:1 on card and page` : `the same as color.${st}: it already reads at 4.5:1`;
    theme.tokens[`color.${st}-text`] = text;
    for (const d of text.decided) divergences.push({ kind: "contrast", token: `color.${st}-text`, mode: d.mode, value: `${d.was} as words`, chosen: `${d.now} (${d.why})` });
  }
  theme.checks.textContrastAtLeast4_5.before = theme.checks.textContrastAtLeast4_5.failing;
  theme.checks.textContrastAtLeast4_5.failing = Object.entries(theme.tokens).filter(([k, t]) => /foreground/.test(k) && t.type === "color").flatMap(([k, t]) => MODES.map(m => { const sf = surfaceToken(k); const r = C.contrast(t[m], sf[m]); return r < 4.5 ? { token: k, mode: m, contrast: +r.toFixed(2), on: sf[m] } : null; })).filter(Boolean);
  for (const [k, t] of Object.entries(theme.tokens)) if (/-text$/.test(k) && t.type === "color") for (const m of MODES) for (const sk of ["color.card", "color.background"]) {
    const sf = theme.tokens[sk]?.[m]; if (!sf) continue;
    const r = C.contrast(t[m], sf); if (r < 4.5) theme.checks.textContrastAtLeast4_5.failing.push({ token: k, mode: m, contrast: +r.toFixed(2), on: sf });
  }
    theme.checks.textContrastAtLeast4_5.pass = theme.checks.textContrastAtLeast4_5.failing.length === 0;
  theme.derived = derivedList;
  
  // ---------- product vs product, scheme support ----------
  const prodRows = Object.values(products).map(p => ({
    id: p.id, kind: p.kind, pages: p.pages.length,
    light: { canvas: p.modes.light.canvasHex, text: p.modes.light.text[0]?.hex, border: p.modes.light.border[0]?.hex, font: p.modes.light.font, radius: p.modes.light.radius?.slice(0, 3), control: p.modes.light.controls?.[0] },
    dark: { canvas: p.modes.dark.canvasHex, text: p.modes.dark.text[0]?.hex, border: p.modes.dark.border[0]?.hex },
    followsSystemScheme: p.modes.light.canvasHex && p.modes.dark.canvasHex ? C.deltaE(p.modes.light.canvasHex, p.modes.dark.canvasHex) > 0.3 : null,
    evidence: [...evidenceOf(p, "light"), ...evidenceOf(p, "dark")],
    a11y: p.modes.light.a11y,
  }));
  for (const r of prodRows) if (r.followsSystemScheme === false) divergences.push({ kind: "scheme", product: r.id, inReference: inRef(r.id), value: `light canvas ${r.light.canvas}, dark canvas ${r.dark.canvas}`, chosen: "follow the system; both schemes", evidence: r.evidence });
  // a hue the guide does not use for the accent: a coloured primary where the guide's is grey, or a hue more
  // than 30 degrees away from the guide's
  const hueGap = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
  for (const p of Object.values(products)) for (const m of MODES) {
    const pr = p.modes[m].tokens?.["--primary"] ?? p.modes[m].tokens?.["--color-primary"];
    const g = theme.tokens["color.primary"]?.[m];
    if (!pr || !C.parse(pr) || !g) continue;
    const a = C.oklch(pr), b = C.oklch(g);
    const off = a.C > 0.05 && (b.C <= 0.05 || hueGap(a.H, b.H) > 30);
    if (off) divergences.push({ kind: "off-brand-hue", token: "--primary", mode: m, product: p.id, value: `${C.toHex(pr)} (OKLCH chroma ${a.C.toFixed(2)}, hue ${a.H.toFixed(0)}°)`, chosen: g, evidence: evidenceOf(p, m) });
  }
  // native source literals that are not tokens
  for (const n of nativeSrc) {
    const tokenHexes = Object.values(theme.tokens).filter(t => t.type === "color").flatMap(t => [t.light, t.dark]).filter(Boolean);
    for (const l of n.literals) {
      const near = tokenHexes.some(h => C.parse(h) && C.deltaE(h, l.value) < SAME);
      divergences.push({ kind: "native-literal", product: n.product, value: l.value, matchesAToken: near, at: l.at, line: l.line });
    }
    // token file in sync with the guide?
    const drift = MODES.flatMap(m => Object.entries(n.tokens[m]).filter(([k, v]) => guide?.tokens[m][k] && guide.tokens[m][k].value !== v).map(([k, v]) => ({ k, m, v })));
    theme.checks[`nativeTokensMatchGuide:${n.product}`] = { pass: drift.length === 0, failing: drift };
  }
  // The brand's written rules against its own code (guide.rules: [{ selector (regex), prop, value (regex), rule, chosen }]).
  for (const r of cfg.guide?.rules ?? []) for (const d of guide.literals.filter(x => new RegExp(r.selector).test(x.selector) && x.prop === r.prop && new RegExp(r.value ?? ".").test(x.value)))
    divergences.push({ kind: "guide-vs-rule", token: r.token ?? r.selector, value: `${d.value} at ${guide.id}:${d.at}`, rule: r.rule, chosen: r.chosen });
  
  divergences.push(...offScale);
  
  // ---------- presets: one per app as it looks today, plus Harmonised ----------
  // An app preset takes, per token and scheme: the app's published token, else what it draws (canvas, text, border,
  // font, radius), else the Harmonised value marked "not seen". Harmonised = the chosen tokens above.
  const harmonised = Object.fromEntries(Object.entries(theme.tokens).map(([k, t]) => [k, { light: t.light, dark: t.dark }]));
  const apps = {};
  for (const prod of Object.values(products)) {
    const set = {};
    for (const [k, t] of Object.entries(theme.tokens)) {
      const e = { light: t.light, dark: t.dark, source: { light: "harmonised (not seen)", dark: "harmonised (not seen)" } };
      if (t.type === "color" && k.startsWith("color.")) {
        const name = `--${k.slice(6)}`;
        for (const m of MODES) {
          const o = prod.modes[m];
          const canvas = o.canvasHex ?? harmonised["color.background"][m];
          const pub = o.tokens?.[name] ?? o.tokens?.[`--color-${name.slice(2)}`];
          let v = null, src = null;
          if (pub && C.parse(pub)) { v = C.parse(pub).alpha < 1 ? C.over(pub, canvas) : C.toHex(pub); src = "published"; }
          else {
            const inks = prod.kind === "native"
              ? Object.entries(o.counts.pixels ?? {}).filter(([, sh]) => sh > 0.005).map(([h]) => h)
              : o.text.map(x => x.hex);
            const byContrast = inks.filter(Boolean).sort((a, b) => C.contrast(b, canvas) - C.contrast(a, canvas));
            if (name === "--background" && o.canvasHex) { v = o.canvasHex; src = "drawn (canvas)"; }
            else if (name === "--foreground" && byContrast[0]) { v = byContrast[0]; src = "drawn (strongest text)"; }
            else if (name === "--muted-foreground" && byContrast.length > 1 && prod.kind === "web") { v = byContrast.at(-1); src = "drawn (weakest text)"; }
            else if (name === "--border" && o.border[0]) { v = C.parse(o.border[0].hex).alpha < 1 ? C.over(o.border[0].hex, canvas) : o.border[0].hex; src = "drawn (most-used border)"; }
          }
          if (v) { e[m] = v; e.source[m] = src; }
        }
      }
      if (k === "font.sans" && prod.modes.light.font) { e.light = e.dark = prod.modes.light.font; e.source = { light: "drawn", dark: "drawn" }; }
      if (k === "radius.base" && prod.modes.light.radius?.length) { const r = prod.modes.light.radius.find(x => x !== "full"); if (r) { e.light = e.dark = r; e.source = { light: "drawn (most-used corner)", dark: "drawn (most-used corner)" }; } }
      set[k] = e;
    }
    const seen = Object.values(set).filter(e => !/^harmonised/.test(e.source.light) || !/^harmonised/.test(e.source.dark)).length;
    apps[prod.id] = { kind: prod.kind, read: prod.pages, tokensSeen: seen, tokensFromHarmonised: Object.keys(set).length - seen, tokens: set };
  }
  for (const n of nativeSrc) {
    const set = {};
    for (const [k, t] of Object.entries(theme.tokens)) {
      const name = `--${k.slice(6)}`;
      const e = { light: t.light, dark: t.dark, source: { light: "harmonised (not seen)", dark: "harmonised (not seen)" } };
      if (k.startsWith("color.")) for (const m of MODES) if (n.tokens[m][name] && C.parse(n.tokens[m][name])) { e[m] = C.toHex(n.tokens[m][name]); e.source[m] = "source token"; }
      if (k === "font.sans" && Object.keys(n.fonts).length) { e.light = e.dark = Object.keys(n.fonts)[0].split("-")[0]; e.source = { light: "source", dark: "source" }; }
      set[k] = e;
    }
    apps[n.product] = { kind: "native-source", read: [rel(n.file)], note: "read from source: no simulator build could be launched", tokens: set };
  }
  theme.presets = { harmonised: { name: refName, description: `One look for ${cfg.brand}, worked out from: ${guideUsed ? "the guide, then " : ""}${refIds.join(", ")}.`, reference: { apps: refIds, guide: guideUsed }, tokens: harmonised }, apps };
  theme.vocabulary = vocab;
  theme.harmonise = {
    sources: [...(realGuide ? [{ id: "guide", kind: "guide", label: realGuide.id }] : []), ...Object.values(products).map(p => ({ id: p.id, kind: p.kind, label: p.id })), ...nativeSrc.map(n => ({ id: n.product, kind: "native-source", label: n.product }))],
    reference: { apps: refIds, guide: guideUsed },
  };
  const presetGaps = Object.entries(theme.presets.apps).flatMap(([a, p]) => Object.entries(p.tokens).filter(([, e]) => e.light == null || e.dark == null).map(([k]) => `${a}:${k}`));
  theme.checks.everyPresetTokenHasLightAndDark = { pass: presetGaps.length === 0, failing: presetGaps };
  theme.products = prodRows;
  theme.skippedPages = skipped;
  return { theme, divergences };
}
