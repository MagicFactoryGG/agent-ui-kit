# Recipe: one tool list, three views

The app lists the tools an agent may call once, as `AgentTool` rows in its
ledger. Three views read that one list:

| View | For | Component |
|---|---|---|
| do | the person runs the same jobs | `CommandPalette` (`@agent-ui-kit/commands`) |
| permit | the person sees each tool's mode and can raise it | `PermitList` |
| review | the person sees what took effect and what waits | `ActivityList`, `ApprovalSheet` |

- Each command names its tool (`Command.tool`), or `""` for the person's own
  command. `tools/palette-link.mjs` holds each command to a declared tool in
  the list, and fails on a command that does nothing.
- The same list as data is a label for the app: a `reads` tool can return it
  ("what an assistant can do here, and what needs a person"), so another
  party's agent can read it before it acts.
- `tools/modes.mjs` holds each row's floor to its tool line.
- **The cost today:** this list sits beside Exact's own `tool` lines, so a tool is written in up to five
  places: its `tool` line, its `AgentTool` row, its face in `app.json`, and, for the checks, a sample in
  `agent-checks.json` and a case in `both-doors.json`. Contract cannot read its own tool lines (name and
  consequence); if it could, each floor could be computed from the line, and the list would hold only
  what the line cannot say (reach, secret, a stricter floor).

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, raise, undo, isOn, modeOf from "@agent-ui-kit/agent"
use PermitList, ActivityList from "@agent-ui-kit/agent"
use Command, CommandPalette, command from "@agent-ui-kit/commands"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setDigest", title="Weekly digest", sentence="Turns the weekly digest on or off.", floor="recorded", reach="self", secret=false)]

component App
  state book: Ledger = ledger([Value(key="digest", value="on")], tools(), words())
  derive commands = [command("digest", (isOn(book, "digest") ? "Turn the digest off" : "Turn the digest on"), "Same as the tool", "setDigest")]
  derive permits = book.tools.map(t => `${t.name}\t${t.floor}\t${modeOf(book, t.name)}`).join("\n")
  action setDigest(on: bool)
    book = act(book, Act(tool="setDigest", door="agent", key="digest", title="Weekly digest", value=(on ? "on" : "off"), did="Your assistant changed the weekly digest.", asks="Your assistant suggests a change to the weekly digest.", will="Your assistant will change the weekly digest soon."))
  action readPermits
  action run(id: string)
    if id == "digest"
      book = personSet(book, "digest", isOn(book, "digest") ? "off" : "on")
  action choose(tool: string, mode: string)
    book = raise(book, tool, mode, "person")
  action undoOne(id: string)
    book = undo(book, id)
  tool setDigest writes idempotent closed "Turn the weekly digest on or off." = setDigest
    returns book.answer
  tool readPermits reads "Each tool an assistant may call: name, floor, mode in force." = readPermits
    returns permits
  view
    main testId="root"
      CommandPalette(id="commands", label="Commands", placeholder="Search", commands=commands, agentLabel="Your assistant can do this too", run=run)
      PermitList(id="permits", tools=book.tools, raised=book.raised, modeLabels=["At once", "Recorded", "After 5 seconds", "Asks you first", "Off"], set=choose)
      ActivityList(id="activity", entries=book.changes, empty="No changes yet.", undoLabel="Undo", undo=undoOne)
```

```contract-test
test "do: the person runs the job the tool does"
  expect tree has "commands-digest-agent"
  tap "commands-digest"
  expect state book.values.0.value == "off"

test "permit: the person raises the mode, and the label says so"
  type "permits-setDigest" "proposed"
  expect state permits == "setDigest\trecorded\tproposed"
```
