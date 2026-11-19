// A published design system's own token values (the benchmark's ground truth), read from its package's CSS
// without running any of its code. Resolves var(--x, fallback) and light-dark(a, b).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { walkCss } from "./css.mjs";

/** Downloads and unpacks an npm package's tarball into <cacheDir>/<name>@<version>/package; returns that path. */
export async function fetchPackage(name, cacheDir) {
  const meta = await (await fetch(`https://registry.npmjs.org/${name}/latest`)).json();
  const dir = join(cacheDir, `${name.replace(/[@/]/g, "_")}@${meta.version}`);
  if (!existsSync(join(dir, "package"))) {
    mkdirSync(dir, { recursive: true });
    const tgz = join(dir, "package.tgz");
    writeFileSync(tgz, Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer()));
    const r = spawnSync("tar", ["xzf", tgz, "-C", dir]);
    if (r.status !== 0) throw new Error(`could not unpack ${name}`);
  }
  return { dir: join(dir, "package"), version: meta.version, licence: meta.license };
}

/** Splits on commas at depth 0. */
function topSplit(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Replaces each `fn(` … `)` call (balanced) with f(args). */
function replaceCalls(value, fn, f) {
  let i;
  while ((i = value.indexOf(`${fn}(`)) >= 0) {
    let depth = 0, j = i + fn.length;
    for (; j < value.length; j++) { if (value[j] === "(") depth++; if (value[j] === ")" && --depth === 0) break; }
    value = value.slice(0, i) + f(topSplit(value.slice(i + fn.length + 1, j))) + value.slice(j + 1);
  }
  return value;
}

/** tokens[scheme][--name] = resolved value. entries: [{ dir, file, scheme, selector (regex) }]. */
export function readTruth(entries) {
  const tokens = { light: {}, dark: {} };
  const raw = { light: {}, dark: {} };
  for (const e of entries) {
    const re = new RegExp(e.selector);
    walkCss(readFileSync(join(e.dir, e.file), "utf8"), e.file, d => {
      if (d.prop.startsWith("--") && re.test(d.selector) && !(e.notIn && d.context.some(c => new RegExp(e.notIn).test(c)))) raw[e.scheme][d.prop] = d.value.replace(/\s+/g, " ");
    });
  }
  // a dark selector overrides the light one, so a name it does not set keeps the light value
  raw.dark = { ...raw.light, ...raw.dark };
  for (const m of ["light", "dark"]) {
    const resolve = (v, seen = new Set()) => {
      v = replaceCalls(v, "light-dark", ([a, b]) => (m === "light" ? a : b));
      v = replaceCalls(v, "var", ([n, fb]) => (raw[m][n] && !seen.has(n) ? resolve(raw[m][n], new Set([...seen, n])) : fb ?? ""));
      return v.trim();
    };
    for (const [k, v] of Object.entries(raw[m])) tokens[m][k] = resolve(v);
  }
  return tokens;
}
