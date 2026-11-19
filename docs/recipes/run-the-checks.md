# Recipe: run the checks on your app

The checks in `tools/` run on any Exact app that keeps its agent-reachable
values in a ledger. Each takes the app's directory and a host:

    bun tools/both-doors.mjs   <app> web|macos|ios
    bun tools/palette-link.mjs <app> web|macos|ios
    bun tools/modes.mjs        <app> web|macos|ios
    bun tools/tree-only.mjs    <app> web|macos|ios
    bun tools/check.mjs        web|macos|ios        (all of this repo's checks; on ios only the
                                                     apps' own tests, one launch each)

| Check | It fails when |
|---|---|
| `both-doors` | the person's steps and the agent's calls in a `both-doors.json` case end in different states, or a call answers another word |
| `palette-link` | a command names no declared tool, or a tool outside the tool list; a command with no tool has no reason; a command does nothing |
| `modes` | a writing tool is not in the tool list; a floor is below its tool line; an act lands in another mode; an act's sentence or answer words break [one sentence, two words](one-sentence-two-words.md) |
| `tree-only` | a control a test uses has no accessible name, or shares it with another control, or the tests fail when each control is named by its accessible name |

`agent-checks.json`, beside `app.contract`:

| Field | Meaning | Default |
|---|---|---|
| `ledger` | the state that holds the ledger | `"book"` |
| `commands` | the derive that holds the palette's commands | `"commands"` |
| `paletteTab`, `paletteId` | the op that shows the palette, and its id | none, `"commands"` |
| `ledgerTools` | tools that act on the ledger itself (undo, answer, raise), each with its reason | `{}` |
| `personOnly` | commands with no tool, each with its reason | `{}` |
| `viewOnly` | commands that only open something | `[]` |
| `commandSetup` | ops to run before a command can do anything | `{}` |
| `samples` | one valid call's arguments for each listed tool | `{}` |
| `raise`, `lower` | ops that set a tool's mode (`%tool`, `%mode`) | none |

A `both-doors.json` case: `name`, `person` (ops), `agent` (ops), `same` (state
paths that must be equal), `expect` and `expectPerson` (path: value), `calls`
(`[outcome, value]` for each call), `noLeak` (text no call record may hold),
`noLeakIn` (state paths that may not hold it either), `tree` (a testId and the
value its node must show after the agent's steps).
An op is an `exact.mjs agent` op: `tap <id>`, `type <id> <text>`, `call
<tool> <json>`, `clock +<ms>`.

The smallest app the checks can read:

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, isOn from "@agent-ui-kit/agent"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setDigest", title="Weekly digest", sentence="Turns the weekly digest on or off.", floor="recorded", reach="self", secret=false)]

component App
  state book: Ledger = ledger([Value(key="digest", value="on")], tools(), words())
  action setDigest(on: bool)
    book = act(book, Act(tool="setDigest", door="agent", key="digest", title="Weekly digest", value=(on ? "on" : "off"), did="Your assistant changed the weekly digest.", asks="Your assistant suggests a change to the weekly digest.", will="Your assistant will change the weekly digest soon."))
  action setByPerson(on: bool)
    book = personSet(book, "digest", on ? "on" : "off")
  tool setDigest writes idempotent closed "Turn the weekly digest on or off. Answers saved." = setDigest
    returns book.answer
  view
    main testId="root"
      input type="checkbox" switch checked=isOn(book, "digest") change=setByPerson aria-label="Weekly digest" testId="digest"
```

```contract-test
test "the switch writes the ledger"
  type "digest" "false"
  expect state book.values.0.value == "off"
```

With it, `both-doors.json` holds
`[{"name": "digest", "person": ["type digest false"], "agent": ["call setDigest {\"on\":false}"], "same": ["book.values"], "calls": [["ok", "saved"]]}]`
and `agent-checks.json` holds `{"samples": {"setDigest": {"on": false}}}`.
