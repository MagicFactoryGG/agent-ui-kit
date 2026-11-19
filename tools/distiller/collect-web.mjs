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
          const data = await page.evaluate(`(${probe})()`);
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
