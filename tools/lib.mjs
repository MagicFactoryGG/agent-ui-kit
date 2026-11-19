// Shared by the checks: drive an Exact app through its own exact.mjs, read its
// check settings, and read dotted paths in its state.
//
// An app that uses the checks keeps `agent-checks.json` beside app.contract
// (see docs/recipes/run-the-checks.md for every field).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The app directory and host from argv: `<check> <app dir> [web|macos|ios]`. */
export function args(argv = process.argv.slice(2)) {
  const [dir, host = "web"] = argv;
  if (!dir) {
    console.error("usage: bun tools/<check>.mjs <app directory> [web|macos|ios]");
    process.exit(2);
  }
  const app = resolve(dir);
  if (!existsSync(resolve(app, "app.contract"))) {
    console.error(`${app} holds no app.contract`);
    process.exit(2);
  }
  return { app, host };
}

/** The app's check settings (agent-checks.json), with defaults. */
export function settings(app) {
  const file = resolve(app, "agent-checks.json");
  const own = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return {
    ledger: "book",
    commands: "commands",
    ledgerTools: {},
    personOnly: {},
    viewOnly: [],
    commandSetup: {},
    samples: {},
    raise: null,
    lower: null,
    ...own,
  };
}

/** Runs `ops` in one drive and answers every JSON reply, the last a `state`. */
export function driveAll(app, host, ops) {
  const run = spawnSync("bun", ["exact.mjs", "agent", host, "--json", ...ops, "clock settle", "state"], { cwd: app, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`drive failed (${run.status}): ${(run.stderr || run.stdout).slice(-2000)}`);
  return run.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
}

/** One drive: its state (slots and derives), its tools and its tool calls. */
export function drive(app, host, ...ops) {
  const last = driveAll(app, host, ops).at(-1);
  return {
    data: { ...last.slots, ...last.derives },
    tools: last.intents?.tools ?? [],
    calls: last.intents?.calls ?? [],
  };
}

/** A dotted path in a value: `book.values.0.value`, `book.changes.length`. */
export function at(value, path) {
  return path.split(".").reduce((v, k) => (v == null ? undefined : k === "length" ? v.length : v[/^\d+$/.test(k) ? Number(k) : k]), value);
}

export const call = (tool, json) => `call ${tool} ${JSON.stringify(json)}`;

/** Collects named checks and prints one line each, then a total; exits 1 on a failure. */
export function runner(label) {
  const checks = [];
  return {
    check: (name, fn) => checks.push([name, fn]),
    run(host) {
      let failed = 0;
      for (const [name, fn] of checks) {
        try {
          fn();
          console.log(`${label}: "${name}": ok`);
        } catch (e) {
          failed++;
          console.log(`${label}: "${name}": FAILED\n  ${e.message}`);
        }
      }
      console.log(`${label}: ${checks.length - failed} passed, ${failed} failed (${host})`);
      process.exit(failed ? 1 : 0);
    },
  };
}

export function same(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// Modes, lowest first, as the ledger ranks them.
export const MODES = ["direct", "recorded", "delayed", "proposed", "off"];
export const rank = (m) => MODES.indexOf(m);
