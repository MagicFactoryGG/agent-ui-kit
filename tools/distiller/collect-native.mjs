#!/usr/bin/env bun
// The Distiller, native step (iOS Simulator). One launch per app: boot without a window, launch once, read the
// first screen in light, switch the system to dark (no relaunch), read it again, end, shut down.
// Reads: the accessibility tree (agent-device snapshot) and the pixels (simctl screenshot).
// It never goes past the first screen: a face check or an authentication stops it there.
// Usage: bun collect-native.mjs <out-dir> <simulator-udid> <bundle-id> <product-id>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const [outArg, udid, bundle, id] = process.argv.slice(2);
const outDir = outArg && resolve(outArg);
if (!bundle) { console.error("usage: collect-native.mjs <out-dir> <udid> <bundle-id> <product-id>"); process.exit(2); }
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000, ...opts });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = join(outDir, "evidence"); mkdirSync(ev, { recursive: true }); mkdirSync(join(outDir, "native"), { recursive: true });
const AD = ["--platform", "ios", "--session", `intake-${id}`];
const ENV = { ...process.env, EXACT_SHOW_SIMULATOR: "0" };
const result = { product: id, bundle, udid, modes: {} };
try {
  try { run("xcrun", ["simctl", "boot", udid]); } catch (e) { if (!/current state: Booted/.test(String(e.stderr))) throw e; }
  run("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  run("xcrun", ["simctl", "ui", udid, "appearance", "light"]);
  // agent-device opens the app once and keeps a session, so the tree can be read in both schemes.
  const name = JSON.parse(run("xcrun", ["simctl", "list", "devices", "-j"])).devices && Object.values(JSON.parse(run("xcrun", ["simctl", "list", "devices", "-j"])).devices).flat().find(d => d.udid === udid)?.name;
  run("agent-device", [...AD, "open", bundle, "--device", name, "--relaunch"], { env: ENV });
  await sleep(6000);
  for (const scheme of ["light", "dark"]) {
    if (scheme === "dark") { run("xcrun", ["simctl", "ui", udid, "appearance", "dark"]); await sleep(2500); }
    const shot = join(ev, `${id}.${scheme}.png`);
    run("xcrun", ["simctl", "io", udid, "screenshot", "--type=png", shot]);
    let tree = null;
    try { tree = run("agent-device", [...AD, "snapshot", "--json"], { env: ENV }); }
    catch (e) { tree = { error: `${e.stdout ?? ""}${e.stderr ?? ""}`.slice(0, 600) || String(e) }; }
    result.modes[scheme] = { screenshot: relative(outDir, shot), accessibility: typeof tree === "string" ? JSON.parse(tree) : tree };
  }
} finally {
  try { run("xcrun", ["simctl", "terminate", udid, bundle]); } catch {}
  try { run("xcrun", ["simctl", "ui", udid, "appearance", "light"]); } catch {}
  try { run("agent-device", [...AD, "close"], { env: ENV }); } catch {}
  try { run("xcrun", ["simctl", "shutdown", udid]); } catch {}
}
writeFileSync(join(outDir, "native", `${id}.json`), JSON.stringify(result, null, 1));
console.log(`native ${id}: ${Object.keys(result.modes).join(", ")}`);
