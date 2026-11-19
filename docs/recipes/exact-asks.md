# Recipe: what Exact blocks today, and the workaround

Each gap below has the smallest workaround this repo uses, so the packages run
on Exact as it is (pinned in the README). Each is a candidate issue for Exact,
with the smallest app that shows it. Nothing here is sent anywhere.

1. **A tool call is not a test step.** `call` runs only in the driver, so
   "both doors reach the same state" needs `tools/both-doors.mjs` beside the
   app's tests. Ask: `call <tool> <json>` as a step in `*.test.contract`.
2. **An action cannot read which door called it.** The guide's tools section
   says each call's record keeps its `door`, and a package's native view is
   told its origin, but Contract cannot read it. Workaround: two one-line
   actions per value, one per door, that pass `"person"` or `"agent"` to the
   same ledger function. Ask: a door an action can read.
3. **A tool's action that calls another action with arguments** fails the face
   check (`intents-face-type`: the face "names parameter …, which its action
   does not take"). Workaround: the ledger is pure functions, which a tool's
   action may call; no action calls another with arguments from a tool.
4. **A package cannot use a sibling package by a local path**
   (`contract-use-package`: no package in a `node_modules` above the package's
   real path). Workaround: `@agent-ui-kit/forms` draws its rows' mark and
   proposal itself, the same as `ChangeMark` and `ProposalBar`.
5. **`lower-button-style` reports an empty title** for a button a component
   draws only under `if label != ""`, when one placement passes `""`.
   Workaround: pass the ledger's own words (empty when nothing waits), not a
   literal `""`.
6. **The driver's `type` into a password field** leaves `•••` as the value on
   the web, where a test's `type` step writes the text. Workaround: the
   person's door for a secret is tested in `app.test.contract` only.

The block below is the workaround for 2 and 3 in one app: two doors, one
function, and no action called with arguments from a tool.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, isOn from "@agent-ui-kit/agent"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setDigest", title="Weekly digest", sentence="Turns the weekly digest on or off.", floor="recorded", reach="self", secret=false)]
fn digest(door: string, on: bool): Act = Act(tool="setDigest", door=door, key="digest", title="Weekly digest", value=(on ? "on" : "off"), did="The weekly digest changed.", asks="A change to the weekly digest waits.", will="The weekly digest will change soon.")

component App
  state book: Ledger = ledger([Value(key="digest", value="on")], tools(), words())
  // The agent's door: a function call only.
  action setDigest(on: bool)
    book = act(book, digest("agent", on))
  // The person's door: the same value, by the person's function.
  action setByPerson(on: bool)
    book = personSet(book, "digest", on ? "on" : "off")
  tool setDigest writes idempotent closed "Turn the weekly digest on or off." = setDigest
    returns book.answer
  view
    main testId="root"
      input type="checkbox" switch checked=isOn(book, "digest") change=setByPerson aria-label="Weekly digest" testId="digest"
```

```contract-test
test "the person's door"
  type "digest" "false"
  expect state book.values.0.value == "off"
```
