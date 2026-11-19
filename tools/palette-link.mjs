// The palette matches the tool list. Read from the running app:
//
// - every command's `tool` names one of the app's tools;
// - every command with no tool is in agent-checks.json's `personOnly`, with
//   its reason, and every name there is a command;
// - every tool that writes and takes no parameter has a command;
// - every tool a command names is in the app's tool list (the ledger's
//   `tools`) or in `ledgerTools`, so the palette and the permit list show the
//   same jobs;
// - every command does something: run after its setup, the app's state
//   changes (a `viewOnly` command must change nothing), which catches a
//   missing arm in the app's hand-written runner.
//
//   bun tools/palette-link.mjs <app dir> [web|macos|ios]
import { args, drive, settings } from "./lib.mjs";

const { app, host } = args();
const s = settings(app);
const problems = [];
const base = drive(app, host, s.paletteTab ?? "clock settle");
const commands = base.data[s.commands];
const tools = base.tools;
const names = new Set(tools.map((t) => t.name));
const listed = new Set((base.data[s.ledger]?.tools ?? []).map((t) => t.name));

if (!Array.isArray(commands)) problems.push(`no derive "${s.commands}" holds the commands`);
for (const c of commands ?? []) {
  if (c.tool !== "" && !names.has(c.tool)) problems.push(`command ${c.id} names tool ${c.tool}, which the app does not declare`);
  if (c.tool !== "" && !listed.has(c.tool) && !s.ledgerTools[c.tool]) problems.push(`command ${c.id} names tool ${c.tool}, which is not in the app's tool list`);
  if (c.tool === "" && !s.personOnly[c.id]) problems.push(`command ${c.id} has no tool and no reason in personOnly`);
}
for (const id of Object.keys(s.personOnly)) {
  if (!(commands ?? []).some((c) => c.id === id)) problems.push(`personOnly names ${id}, which is no command`);
}
for (const t of tools) {
  const takes = Object.keys(t.face?.parameters ?? {}).length > 0 || (t.parameters ?? []).length > 0;
  if (t.consequence !== "reads" && !takes && !(commands ?? []).some((c) => c.tool === t.name)) problems.push(`tool ${t.name} writes and takes no parameter, and no command runs it`);
}
const slots = (d) => JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "nav")));
for (const c of commands ?? []) {
  const setup = s.commandSetup[c.id] ?? [];
  const open = s.paletteTab ? [s.paletteTab] : [];
  const before = drive(app, host, ...setup, ...open);
  const after = drive(app, host, ...setup, ...open, `tap ${s.paletteId ?? "commands"}-${c.id}`);
  if (s.viewOnly.includes(c.id)) {
    if (slots(before.data) !== slots(after.data)) problems.push(`view-only command ${c.id} changed the app's state`);
  } else if (slots(before.data) === slots(after.data)) {
    problems.push(`command ${c.id} changed nothing (a missing arm in the app's runner?)`);
  }
}

for (const p of problems) console.log(`palette-link: ${p}`);
console.log(`palette-link: ${(commands ?? []).length} commands, ${tools.length} tools, ${problems.length} problems (${host})`);
process.exit(problems.length ? 1 : 0);
