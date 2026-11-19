// Modes follow the tool line. The app's tool list (the ledger's `tools`)
// gives each tool a floor; the tool line gives its consequence. This check:
//
// 1. Static, on the running app's declarations:
//    - every tool that writes or destroys is in the tool list, or in
//      agent-checks.json's `ledgerTools` with its reason (undo, answer and
//      raise act on the ledger itself), and every listed tool is declared;
//    - each floor is at or above the least the line allows: `destroys`, a
//      write that is not `closed`, or one other people see (reach "others")
//      is proposed; `writes additive closed`, or a write-only secret, may be
//      direct; any other write is recorded.
// 2. In a run, for each tool with a sample call in `samples`:
//    - the act lands in the mode in force: direct (no record, nothing
//      waits), recorded (a change with that mode, nothing waits), delayed or
//      proposed (it waits, its key is not yet written);
//    - each act is said in one sentence with at most two answer words, and
//      the sentence names no place on a screen (beyond 2);
//    - with `raise` set (ops; %tool and %mode are filled in), raised to
//      proposed the same call waits; with `lower` set, an attempt to set the
//      mode one step below the floor is refused and changes nothing.
//
//   bun tools/modes.mjs <app dir> [web|macos|ios]
import { MODES, args, call, drive, rank, runner, same, settings } from "./lib.mjs";

const { app, host } = args();
const s = settings(app);
const { check, run } = runner("modes");
const start = drive(app, host);
const line = new Map(start.tools.map((t) => [t.name, t]));
const book = start.data[s.ledger];
if (!book) {
  console.log(`modes: no state "${s.ledger}" holds the ledger`);
  process.exit(1);
}
const list = book.tools;

function least(t, entry) {
  if (t.consequence === "destroys" || !t.closed || entry.reach !== "self") return "proposed";
  if ((t.additive && t.closed) || entry.secret) return "direct";
  return "recorded";
}

check("every writing tool is in the tool list or names its reason", () => {
  const missing = [...line.values()].filter((t) => t.consequence !== "reads" && !list.some((e) => e.name === t.name) && !s.ledgerTools[t.name]).map((t) => t.name);
  same("writing tools outside the list", missing, []);
  same("listed tools the app does not declare", list.filter((e) => !line.has(e.name)).map((e) => e.name), []);
  same("listed tools that only read", list.filter((e) => line.get(e.name)?.consequence === "reads").map((e) => e.name), []);
});

check("each floor is at or above what its tool line allows", () => {
  const low = list.filter((e) => line.has(e.name) && rank(e.floor) < rank(least(line.get(e.name), e))).map((e) => `${e.name}: ${e.floor} < ${least(line.get(e.name), e)}`);
  same("floors below the line", low, []);
  const unknown = list.filter((e) => rank(e.floor) < 0).map((e) => `${e.name}: ${e.floor}`);
  same("unknown modes", unknown, []);
});

const PLACE = /\b(above|below|left|right|top|bottom|here|this (row|button|screen))\b/i;
function said(where, sentence, yes, no, mode) {
  if (!sentence || !sentence.trim()) throw new Error(`${where}: no sentence`);
  if (!/[.!?]$/.test(sentence.trim())) throw new Error(`${where}: "${sentence}" is not one whole sentence`);
  if (/[.!?]\s+\S/.test(sentence.trim())) throw new Error(`${where}: "${sentence}" is more than one sentence`);
  if (PLACE.test(sentence)) throw new Error(`${where}: "${sentence}" names a place on the screen`);
  const words = [yes, no].filter((w) => w);
  if (mode !== "direct" && words.length === 0) throw new Error(`${where}: no answer word`);
  for (const w of words) if (w.trim().split(/\s+/).length > 2) throw new Error(`${where}: answer "${w}" is more than two words`);
}

for (const e of list) {
  const sample = s.samples[e.name];
  if (!sample) {
    check(`${e.name} has a sample call`, () => {
      throw new Error(`no sample for ${e.name} in agent-checks.json`);
    });
    continue;
  }
  check(`${e.name} acts in its floor's mode (${e.floor}) and says it in one sentence`, () => {
    const r = drive(app, host, call(e.name, sample));
    const b = r.data[s.ledger];
    const c = r.calls.at(-1);
    same("call outcome", c?.outcome, "ok");
    const mine = b.changes.filter((x) => x.tool === e.name);
    const waits = b.waiting.filter((x) => x.tool === e.name);
    if (e.floor === "direct") {
      same("direct: recorded", mine.length, 0);
      same("direct: waiting", waits.length, 0);
    } else if (e.floor === "recorded") {
      same("recorded: changes", mine.map((x) => x.mode), ["recorded"]);
      same("recorded: waiting", waits.length, 0);
    } else if (e.floor === "off") {
      same("off: answer", b.answer, "off");
    } else {
      same(`${e.floor}: waiting`, waits.map((x) => x.mode), [e.floor]);
      same(`${e.floor}: changes`, mine.length, 0);
      const before = start.data[s.ledger].values.find((v) => v.key === waits[0].key)?.value;
      same(`${e.floor}: value not yet written`, b.values.find((v) => v.key === waits[0].key)?.value, before);
      said(`${e.name}'s waiting act`, waits[0].sentence, waits[0].yes, waits[0].no, e.floor);
    }
    if (e.floor !== "off") said(`${e.name}'s notice`, b.note.sentence, b.note.yes, b.note.no, e.floor);
  });
  if (s.raise && rank(e.floor) < rank("proposed")) {
    check(`${e.name} raised to proposed waits`, () => {
      const r = drive(app, host, ...s.raise.map((op) => op.replaceAll("%tool", e.name).replaceAll("%mode", "proposed")), call(e.name, sample));
      const b = r.data[s.ledger];
      same("waiting", b.waiting.filter((x) => x.tool === e.name).map((x) => x.mode), ["proposed"]);
    });
  }
  if (s.lower && rank(e.floor) > rank("direct")) {
    check(`${e.name} cannot be lowered below its floor`, () => {
      const below = MODES[rank(e.floor) - 1];
      const r = drive(app, host, ...s.lower.map((op) => op.replaceAll("%tool", e.name).replaceAll("%mode", below)));
      const b = r.data[s.ledger];
      same("raised", b.raised, []);
      if (b.answer === "saved") throw new Error(`lowering to ${below} answered saved`);
    });
  }
}
run(host);
