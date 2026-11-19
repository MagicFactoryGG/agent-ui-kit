#!/usr/bin/env bun
// The Distiller, web step. One headless browser for the whole run; each page is read twice, once with the
// system set to light and once set to dark: a Theme always has both.
// Usage: bun collect-web.mjs <brand.json> <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { assertOwnership } from "./lib/doors.mjs";
import { loadConfig } from "./lib/config.mjs";
import { launch } from "./lib/chromium.mjs";

const [cfgPath, outArg] = process.argv.slice(2);
const outDir = outArg && resolve(outArg);
if (!cfgPath || !outDir) { console.error("usage: collect-web.mjs <brand.json> <out-dir>"); process.exit(2); }
const cfg = loadConfig(cfgPath);
await assertOwnership(cfg);
const probe = readFileSync(join(dirname(new URL(import.meta.url).pathname), "lib/page-probe.js"), "utf8");
mkdirSync(join(outDir, "web"), { recursive: true });
mkdirSync(join(outDir, "evidence"), { recursive: true });

const slug = u => u.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "").slice(0, 80);
const browser = await launch();
const results = [];
try {
  for (const product of cfg.web ?? []) {
    const queue = [...product.pages];
    const seen = new Set();
    const maxPages = product.maxPages ?? product.pages.length;
    while (queue.length && seen.size < maxPages) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      const page_ = { product: product.id, url, modes: {} };
      for (const scheme of ["light", "dark"]) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const page = await ctx.newPage();
        try {
          const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(async e => {
            // some apps keep a socket open: fall back to load
            return page.goto(url, { waitUntil: "load", timeout: 30000 });
          });
          await page.waitForTimeout(800);
          let data = await page.evaluate(`(${probe})()`);
          // A stylesheet from another origin hides its rules from the page, so its token names are read from its
          // text; their values are still the page's own (resolved at <body>).
          if (data.crossOriginSheets) {
            const hrefs = await page.evaluate(() => [...document.styleSheets].map(s => { try { s.cssRules; return null; } catch { return s.href; } }).filter(Boolean));
            const names = new Set();
            for (const h of hrefs) { const t = await page.request.get(h).then(r => r.text()).catch(() => ""); for (const m of t.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]); }
            const extra = await page.evaluate(ns => { const cs = getComputedStyle(document.body); return Object.fromEntries(ns.map(n => [n, cs.getPropertyValue(n).trim()]).filter(([n, v]) => v && !n.startsWith("--tw-"))); }, [...names]);
            data.resolvedCustomProperties = { ...extra, ...data.resolvedCustomProperties };
            data.crossOriginNames = names.size;
          }
          // A site that ignores the system's dark setting may still have a dark mode behind a switch: try the
          // common ones and keep the first that changes the page.
          if (scheme === "dark" && page_.modes.light?.page && data.page.bodyBackground === page_.modes.light.page.bodyBackground && data.page.bodyColor === page_.modes.light.page.bodyColor) {
            const toggles = [
              ["class dark", h => h.classList.add("dark")],
              ["data-theme=dark", h => h.setAttribute("data-theme", "dark")],
              ["data-mode=dark", h => h.setAttribute("data-mode", "dark")],
              ["data-color-mode=dark", h => { h.setAttribute("data-color-mode", "dark"); h.setAttribute("data-dark-theme", "dark"); }],
              ["data-bs-theme=dark", h => h.setAttribute("data-bs-theme", "dark")],
            ];
            for (const [label, fn] of toggles) {
              await page.evaluate(`(${fn.toString()})(document.documentElement)`);
              await page.waitForTimeout(300);
              const again = await page.evaluate(`(${probe})()`);
              if (again.page.bodyBackground !== data.page.bodyBackground || again.page.bodyColor !== data.page.bodyColor) {
                data = { ...again, resolvedCustomProperties: { ...data.resolvedCustomProperties, ...again.resolvedCustomProperties }, forcedDark: label };
                break;
              }
              await page.reload({ waitUntil: "load" }).catch(() => {});
              await page.waitForTimeout(500);
            }
            if (data.forcedDark && data.crossOriginNames) { // re-resolve the hidden names under the switch
              const names = Object.keys(page_.modes.light.resolvedCustomProperties ?? {});
              const extra = await page.evaluate(ns => { const cs = getComputedStyle(document.body); return Object.fromEntries(ns.map(n => [n, cs.getPropertyValue(n).trim()]).filter(([, v]) => v)); }, names);
              data.resolvedCustomProperties = { ...data.resolvedCustomProperties, ...extra };
            }
          }
          const shot = join(outDir, "evidence", `${slug(url)}.${scheme}.png`);
          await page.screenshot({ path: shot });
          page_.modes[scheme] = { status: resp?.status() ?? null, finalUrl: page.url(), screenshot: relative(outDir, shot), ...data };
          if (scheme === "light" && product.discover) {
            const allow = new RegExp(product.discover);
            for (const l of data.links) if (allow.test(l) && !seen.has(l) && !queue.includes(l)) queue.push(l);
          }
        } catch (e) {
          page_.modes[scheme] = { error: String(e).slice(0, 300) };
        } finally { await ctx.close(); }
      }
      results.push(page_);
      const l = page_.modes.light, d = page_.modes.dark;
      console.log(`${product.id}  ${url}  light:${l.status ?? l.error?.slice(0, 40)} bg=${l.page?.bodyBackground}  dark:${d.status ?? d.error?.slice(0, 40)} bg=${d.page?.bodyBackground}`);
    }
  }
} finally { await browser.close(); }
writeFileSync(join(outDir, "web", "pages.json"), JSON.stringify(results, null, 1));
console.log(`pages: ${results.length}`);
