# Recipe: one ledger, two doors

A person and an agent change the same values. The app keeps those values in a
ledger (`@agent-ui-kit/agent`), and both doors write it with the same pure
functions: the person's control with `personSet`, the agent's tool with `act`.
The ledger records the agent's change, marks the value, says it in one
sentence on the notice, and can undo it.

- **The app owns the value.** The ledger is the app's state; the package holds
  only functions and views.
- **Two actions, one function.** An action cannot read which door called it,
  so each door has its own one-line action and passes its door (`"person"` or
  `"agent"`). A tool's action calls functions only, never another action with
  arguments ([Exact asks](exact-asks.md)).
- **The mode comes from the tool list**, not from an `if` in the tool
  ([modes](modes.md)).
- `tools/both-doors.mjs` proves that the switch and the tool reach the same
  state ([run the checks](run-the-checks.md)).

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, undo, isOn, isMarked, noteNo, quiet from "@agent-ui-kit/agent"
use Notice, ActivityList from "@agent-ui-kit/agent"
use ToggleRow from "@agent-ui-kit/forms"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setDigest", title="Weekly digest", sentence="Turns the weekly digest on or off.", floor="recorded", reach="self", secret=false)]
fn digestAct(on: bool): Act = Act(tool="setDigest", door="agent", key="digest", title="Weekly digest", value=(on ? "on" : "off"), did=`Your assistant turned the weekly digest ${on ? "on" : "off"}.`, asks=`Your assistant suggests turning the weekly digest ${on ? "on" : "off"}.`, will=`Your assistant will turn the weekly digest ${on ? "on" : "off"} soon.`)

component App
  state book: Ledger = ledger([Value(key="digest", value="on")], tools(), words())
  action setDigest(on: bool)
    book = act(book, digestAct(on))
  action setByPerson(on: bool)
    book = personSet(book, "digest", on ? "on" : "off")
  action agentTurnsOff
    book = act(book, digestAct(false))
  action undoOne(id: string)
    book = undo(book, id)
  action undoNote
    book = noteNo(book, "person")
  action keepNote
    book = quiet(book)
  tool setDigest writes idempotent closed "Turn the weekly digest on or off. Answers saved." = setDigest
    returns book.answer
  view
    main testId="root"
      ToggleRow(id="digest", title="Weekly digest", checked=isOn(book, "digest"), set=setByPerson, mark=(isMarked(book, "digest") ? "Set by your assistant" : ""), sentence="", yesLabel="Accept", noLabel="Reject", yes=keepNote, no=keepNote)
      // The demo's own stand-in for a tool call (a call is not a test step).
      button press=agentTurnsOff testId="as-agent"
        text "Act as the assistant"
      Notice(id="notice", note=book.note, yes=keepNote, no=undoNote)
      ActivityList(id="activity", entries=book.changes, empty="No changes yet.", undoLabel="Undo", undo=undoOne)
```

```contract-test
test "the person's switch writes the value and records nothing"
  type "digest" "false"
  expect state book.values.0.value == "off"
  expect state book.changes.length == 0
  expect tree missing "digest-mark"

test "the agent's act is recorded, marked, said, and undone from the notice"
  tap "as-agent"
  expect state book.values.0.value == "off"
  expect tree has "digest-mark"
  expect text "notice-message" == "Your assistant turned the weekly digest off."
  tap "notice-no"
  expect state book.values.0.value == "on"
  expect state book.changes.length == 0
  expect tree missing "digest-mark"
```
