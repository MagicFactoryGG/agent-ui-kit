// Runs inside the page (Playwright page.evaluate). Reads the real values: CSS custom properties that the page
// exposes, and the computed styles of the elements a person can see. Returns plain counts, no judgement.
// Brand-neutral: nothing in here knows which brand it reads.
() => {
  const out = { customProperties: {}, darkCustomProperties: {}, counts: {}, elements: 0, samples: {} };
  const bump = (k, v, w = 1) => {
    if (v == null || v === "" ) return;
    (out.counts[k] ??= {});
    out.counts[k][v] = (out.counts[k][v] ?? 0) + w;
  };

  // 1. Custom properties declared on :root / html / body / .dark (published tokens).
  const rootish = /(^|,)\s*(:root|html|body|:host)(\b|$)/;
  const darkish = /\.dark\b|\[data-theme=["']?dark|prefers-color-scheme:\s*dark/;
  const allNames = new Set();
  const walk = (rules, inDark) => {
    for (const r of rules) {
      try {
        if (r.cssRules && !(r instanceof CSSStyleRule)) {
          const cond = r.conditionText || r.media?.mediaText || "";
          walk(r.cssRules, inDark || darkish.test(cond));
          continue;
        }
        if (!(r instanceof CSSStyleRule)) continue;
        const sel = r.selectorText || "";
        for (const name of r.style) if (name.startsWith("--")) allNames.add(name);
        const isRoot = rootish.test(sel);
        const isDark = inDark || darkish.test(sel);
        if (!isRoot && !isDark) continue;
        for (const name of r.style) {
          if (!name.startsWith("--")) continue;
          const v = r.style.getPropertyValue(name).trim();
          const bucket = isDark ? out.darkCustomProperties : out.customProperties;
          bucket[name] = v;
        }
        if (r.cssRules?.length) walk(r.cssRules, isDark);
      } catch { /* cross-origin sheet */ }
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules, false); } catch { out.crossOriginSheets = (out.crossOriginSheets ?? 0) + 1; } }
  // Resolved values at <body> of every custom property any rule declares (what the page really uses, in this
  // scheme, whether the token sits on :root, a class on <html>, an attribute or <body>).
  const rs = getComputedStyle(document.body);
  out.resolvedCustomProperties = {};
  for (const name of allNames) { const v = rs.getPropertyValue(name).trim(); if (v && !name.startsWith("--tw-")) out.resolvedCustomProperties[name] = v; }

  // 2. Computed styles of visible elements, weighted by visible area (text by character count).
  const vw = innerWidth, vh = innerHeight;
  const transparent = v => !v || v === "transparent" || /rgba\([^)]*,\s*0\)$/.test(v) || /\/\s*0\)$/.test(v);
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.right < 0 || b.left > vw || b.top > vh * 3) continue;
    out.elements++;
    const area = Math.min(b.width * b.height, vw * vh) / 1000;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
    const isControl = /^(button|a|input|select|textarea|summary)$/.test(tag) || /button|link|tab|switch|checkbox/.test(role);

    if (!transparent(cs.backgroundColor)) bump("background", cs.backgroundColor, area);
    if (cs.backgroundImage && cs.backgroundImage !== "none" && /gradient/.test(cs.backgroundImage)) bump("gradient", cs.backgroundImage.slice(0, 300));
    if (ownText) {
      const w = ownText.length;
      bump("text", cs.color, w);
      bump("fontFamily", cs.fontFamily, w);
      bump("fontSize", cs.fontSize, w);
      bump("fontWeight", cs.fontWeight, w);
      bump("lineHeight", cs.lineHeight === "normal" ? "normal" : (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2), w);
      bump("letterSpacing", cs.letterSpacing, w);
      if (/^h[1-6]$/.test(tag)) bump(`heading:${tag}`, `${cs.fontSize} ${cs.fontWeight} ${cs.fontFamily.split(",")[0]}`);
    }
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none" && !transparent(cs[`border${side}Color`])) {
        bump("border", cs[`border${side}Color`]);
        bump("borderWidth", cs[`border${side}Width`]);
        break;
      }
    }
    if (cs.borderTopLeftRadius !== "0px") bump("radius", cs.borderTopLeftRadius);
    if (cs.boxShadow !== "none") bump("shadow", cs.boxShadow.slice(0, 200));
    for (const p of ["paddingTop", "paddingLeft", "rowGap", "columnGap", "marginTop"]) {
      const v = cs[p];
      if (v && v !== "0px" && v !== "normal" && v !== "auto") bump("spacing", v);
    }
    if (isControl && (ownText || el.getAttribute("aria-label"))) {
      const key = `${cs.backgroundColor} | ${cs.color} | r${cs.borderTopLeftRadius} | h${Math.round(b.height)} | ${cs.fontSize} ${cs.fontWeight}`;
      bump("control", key);
      (out.samples.controls ??= []).length < 25 && out.samples.controls.push({ tag, text: (ownText || el.getAttribute("aria-label")).slice(0, 40), key });
    }
    if (cs.transitionDuration && cs.transitionDuration !== "0s") bump("transition", `${cs.transitionDuration} ${cs.transitionTimingFunction}`);
    if (cs.animationName && cs.animationName !== "none") bump("animation", `${cs.animationName} ${cs.animationDuration}`);
  }
  const bcs = getComputedStyle(document.body), hcs = getComputedStyle(document.documentElement);
  out.page = {
    title: document.title,
    url: location.href,
    htmlBackground: hcs.backgroundColor,
    bodyBackground: bcs.backgroundColor,
    bodyColor: bcs.color,
    bodyFont: bcs.fontFamily,
    bodyFontSize: bcs.fontSize,
    colorScheme: hcs.colorScheme,
    htmlClass: document.documentElement.className.slice(0, 200),
    themeColor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
    fontsLoaded: [...document.fonts].filter(f => f.status === "loaded").map(f => `${f.family} ${f.weight} ${f.style}`).filter((v, i, a) => a.indexOf(v) === i),
  };
  out.links = [...document.querySelectorAll("a[href]")].map(a => a.href).filter(h => h.startsWith(location.origin)).map(h => h.split("#")[0]).filter((v, i, a) => a.indexOf(v) === i);
  return out;
}
