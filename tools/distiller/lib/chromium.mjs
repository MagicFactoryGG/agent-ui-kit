// One headless Chromium. DISTILLER_CHROMIUM names a binary; else Playwright's own (npx playwright install
// chromium-headless-shell), else the newest headless shell in Playwright's cache.
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

function cached() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), platform() === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter(x => x.startsWith("chromium_headless_shell-")).sort().reverse()) {
    for (const sub of readdirSync(join(base, d))) {
      const p = join(base, d, sub, platform() === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
      if (existsSync(p)) return p;
    }
  }
}

export function launch() {
  const own = (() => { try { const p = chromium.executablePath(); return existsSync(p) ? p : undefined; } catch { return undefined; } })();
  return chromium.launch({ headless: true, executablePath: process.env.DISTILLER_CHROMIUM ?? own ?? cached() });
}
