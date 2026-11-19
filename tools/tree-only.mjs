// The accessibility tree alone completes each test. For every test in the
// app's *.test.contract, each step that acts (`tap`, `type`) names its control
// by testId. This check replays the test with the driver, reads the tree just
// before each step, and finds what the tree says about that control: its
// accessible name (its label, else its text). It fails when a control
// has no name, or when another control (a node with a handler) on the screen
// has the same name; a title beside its own control is its visible label. Then
// it writes the same tests with each control named by its accessible name, not
// its testId, and runs them: they must pass. So a person who uses a screen
// reader, voice control, or an agent that reads only the tree can do every
// task the tests do.
//
// `expect` steps keep their testIds: they check the result, not the way there.
//
//   bun tools/tree-only.mjs <app dir> [web|macos|ios]
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { args, driveAll } from "./lib.mjs";

const { app, host } = args();
const files = readdirSync(app).filter((f) => f.endsWith(".test.contract") && !f.startsWith("tree-only"));
const problems = [];
const STEP = /^(\s+)(tap|type) "([^"]+)"(.*)$/;

/** The tests in a file: each a header line and its step lines. */
function tests(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (/^test "/.test(line)) out.push({ head: line, steps: [] });
    else if (out.length && line.trim() && !line.trim().startsWith("//")) out.at(-1).steps.push(line);
  }
  return out;
}

/** An agent op for a test step (`type "goal" key "Enter"` → `type goal key Enter`). */
function op(kind, target, rest) {
  const parts = [...rest.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
  return [kind, target, ...parts].join(" ");
}

function nameOf(nodes, node) {
  if (node.props?.accessibilityLabel) return node.props.accessibilityLabel;
  const text = [];
  const walk = (n) => {
    if (n.props?.text) text.push(n.props.text);
    for (const c of n.children ?? []) walk(nodes.get(c));
  };
  walk(node);
  return text.join(" ").trim();
}

function under(nodes, root, id) {
  if (root.id === id) return true;
  return (root.children ?? []).some((c) => under(nodes, nodes.get(c), id));
}

let rewritten = "";
let count = 0;
for (const f of files) {
  for (const t of tests(readFileSync(resolve(app, f), "utf8"))) {
    const ops = [];
    for (const s of t.steps) {
      const m = STEP.exec(s);
      if (m) ops.push("tree", op(m[2], m[3], m[4]));
    }
    const replies = ops.length ? driveAll(app, host, ops) : [];
    const trees = replies.filter((r) => Array.isArray(r.nodes));
    let i = 0;
    const lines = [t.head];
    for (const s of t.steps) {
      const m = STEP.exec(s);
      if (!m) {
        lines.push(s);
        continue;
      }
      const tree = trees[i++];
      const nodes = new Map((tree?.nodes ?? []).map((n) => [n.id, n]));
      const node = [...nodes.values()].find((n) => n.props?.testId === m[3]);
      if (!node) {
        problems.push(`${t.head.trim()}: "${m[3]}" is not in the tree before it is used`);
        lines.push(s);
        continue;
      }
      const name = nameOf(nodes, node);
      if (!name) {
        problems.push(`${t.head.trim()}: "${m[3]}" has no accessible name`);
        lines.push(s);
        continue;
      }
      // Another control with the same name is a clash; a title beside its own
      // control is its visible label, and a screen reader says it the same way.
      const clash = [...nodes.values()].filter((n) => (n.handlers ?? []).length > 0 && !under(nodes, node, n.id) && nameOf(nodes, n) === name);
      if (clash.length) problems.push(`${t.head.trim()}: "${m[3]}" is named "${name}", as ${clash.length} other node(s) are (${clash.map((n) => n.props?.testId ?? n.type).join(", ")})`);
      lines.push(`${m[1]}${m[2]} "${name}"${m[4]}`);
      count++;
    }
    rewritten += `${lines.join("\n")}\n\n`;
  }
}

mkdirSync(resolve(app, ".exact"), { recursive: true });
const file = resolve(app, ".exact/tree-only.test.contract");
writeFileSync(file, `// Written by tools/tree-only.mjs: the app's tests, each control named by\n// its accessible name. Generated; do not edit.\n\n${rewritten}`);
const runTests = spawnSync("bun", ["exact.mjs", "test", host, file], { cwd: app, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
const results = runTests.stdout.split("\n").filter((l) => /^test "|passed|failed/.test(l));
for (const l of results) console.log(`tree-only: ${l}`);
if (runTests.status !== 0) problems.push(`the tests, by accessible name, did not all pass (exit ${runTests.status}): ${runTests.stderr.slice(-1500)}`);

for (const p of problems) console.log(`tree-only: ${p}`);
console.log(`tree-only: ${count} steps named by the tree, ${problems.length} problems (${host})`);
process.exit(problems.length ? 1 : 0);
