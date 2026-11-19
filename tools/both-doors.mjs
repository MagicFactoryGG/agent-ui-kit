// Both doors reach the same state. For each case in the app's both-doors.json,
// the person's steps and the agent's steps run in two drives, and the named
// state paths must be equal; each side's `expect` paths must hold, and the
// agent's calls must answer the listed outcome and value.
//
//   bun tools/both-doors.mjs <app dir> [web|macos|ios]
//
// A case: { "name", "person": [ops], "agent": [ops], "same": [paths],
//   "expect": {path: value}, "expectPerson": {path: value},
//   "calls": [[outcome, value], …], "noLeak": "text no call may hold",
//   "noLeakIn": [paths that may not hold the noLeak text either],
//   "tree": {testId: the value its node shows after the agent's steps} }.
// An op is an `exact.mjs agent` op: "tap <id>", "type <id> <text>",
// "call <tool> <json>", "clock +<ms>".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { args, at, drive, driveAll, runner, same } from "./lib.mjs";

const { app, host } = args();
const cases = JSON.parse(readFileSync(resolve(app, "both-doors.json"), "utf8"));
const { check, run } = runner("both-doors");

for (const c of cases) {
  check(c.name, () => {
    const agent = drive(app, host, ...c.agent);
    if (c.calls) same("calls", c.calls.map((w, i) => [agent.calls[i]?.outcome, w.length > 1 ? agent.calls[i]?.value : undefined].slice(0, w.length)), c.calls);
    for (const [path, want] of Object.entries(c.expect ?? {})) same(`agent: ${path}`, at(agent.data, path), want);
    if (c.noLeak) same("no call record holds the secret", JSON.stringify(agent.calls).includes(c.noLeak), false);
    for (const path of c.noLeakIn ?? []) same(`${path} does not hold the secret`, JSON.stringify(at(agent.data, path) ?? "").includes(c.noLeak), false);
    if (c.tree) {
      const replies = driveAll(app, host, [...c.agent, ...Object.keys(c.tree).map((id) => `tree ${id}`)]);
      const nodes = replies.filter((r) => Array.isArray(r.nodes)).flatMap((r) => r.nodes);
      for (const [id, want] of Object.entries(c.tree)) same(`${id} shows`, nodes.find((n) => n.props?.testId === id)?.props?.value, want);
    }
    if (c.person) {
      const person = drive(app, host, ...c.person);
      for (const path of c.same ?? []) same(`same ${path}`, at(agent.data, path), at(person.data, path));
      for (const [path, want] of Object.entries(c.expectPerson ?? {})) same(`person: ${path}`, at(person.data, path), want);
    }
  });
}
run(host);
