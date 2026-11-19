# Recipe: modes, floors and raises

Each tool has a mode. The ledger takes each act in the mode in force for its
tool:

| Mode | What happens | The two answer words |
|---|---|---|
| `direct` | applied at once, not recorded | none |
| `recorded` | applied, recorded, can be undone | keep, undo |
| `delayed` | waits a short time, then applies, unless stopped | now, stop |
| `proposed` | waits until a person answers | accept, reject |
| `off` | refused with `off` | none |

- **The floor** is the lowest mode the tool's line allows, and the app writes
  it in its one tool list (`AgentTool.floor`). `destroys`, a write that is not
  `closed`, or a change other people see (`reach: "others"`) is `proposed`;
  `writes additive closed`, or a write-only secret, may be `direct`; any other
  write is `recorded`. An app may choose a stricter floor.
- **A raise.** A person can raise a tool's mode with `raise(book, tool, mode,
  "person")`, and set it back down to the floor, never below it
  (`below-floor`). An agent may only make a mode stricter (`person-only`).
- **Delayed** acts apply when the app calls `settle`, from a task after its
  delay. Stop is the act's second answer word. The task below is keyed on
  the ledger's count, so every new act starts the delay again, and `settle`
  applies every delayed act at once: an agent that acts more often than the
  delay holds all of them open. An app that must apply each one on time
  gives each its own task, keyed on the act's id.
- `tools/modes.mjs` holds each floor to its tool line, and checks that every
  act lands in its mode ([run the checks](run-the-checks.md)).

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, raise, settle, noteNo, modeOf from "@agent-ui-kit/agent"
use Notice, PermitList from "@agent-ui-kit/agent"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setQuiet", title="Quiet hours", sentence="Turns quiet hours on or off.", floor="delayed", reach="self", secret=false)]
fn quietAct(on: bool): Act = Act(tool="setQuiet", door="agent", key="quiet", title="Quiet hours", value=(on ? "on" : "off"), did="Your assistant turned quiet hours on.", asks="Your assistant suggests turning quiet hours on.", will="Your assistant will turn quiet hours on in 5 seconds.")

component App
  state book: Ledger = ledger([Value(key="quiet", value="off")], tools(), words())
  action setQuiet(on: bool)
    book = act(book, quietAct(on))
  action agentAsks
    book = act(book, quietAct(true))
  action stop
    book = noteNo(book, "person")
  action noop
    book = book
  action settleNow
    book = settle(book)
  action choose(tool: string, mode: string)
    book = raise(book, tool, mode, "person")
  action agentLowers
    book = raise(book, "setQuiet", "delayed", "agent")
  task applyDelayed when book.waiting.filter(w => w.mode == "delayed").length > 0 key=book.seq
    after(5000, settleNow)
  tool setQuiet writes idempotent closed "Turn quiet hours on or off after 5 seconds. Answers delayed." = setQuiet
    returns book.answer
  view
    main testId="root"
      button press=agentAsks testId="as-agent"
        text "Act as the assistant"
      button press=agentLowers testId="agent-lowers"
        text "Lower as the assistant"
      text modeOf(book, "setQuiet") testId="mode"
      Notice(id="notice", note=book.note, yes=noop, no=stop)
      PermitList(id="permits", tools=book.tools, raised=book.raised, modeLabels=["At once", "Recorded", "After 5 seconds", "Asks you first", "Off"], set=choose)
```

```contract-test
test "a delayed act applies after its delay"
  tap "as-agent"
  expect state book.answer == "delayed"
  expect state book.values.0.value == "off"
  clock +6000
  expect state book.values.0.value == "on"

test "Stop keeps the old value"
  tap "as-agent"
  tap "notice-no"
  clock +6000
  expect state book.values.0.value == "off"

test "the person raises the mode, and the agent cannot lower it"
  type "permits-setQuiet" "proposed"
  expect text "mode" == "proposed"
  tap "agent-lowers"
  expect state book.answer == "person-only"
  expect text "mode" == "proposed"
  tap "as-agent"
  expect state book.answer == "proposed"
```
