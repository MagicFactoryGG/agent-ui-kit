# Recipe: the door that asks never answers

An app can turn on one rule: an act that waits, asked through one door, cannot
be answered through that same door. Then an agent cannot accept its own
proposal with a tool call.

- Turn it on with `setAsksNeverAnswers(book, true)`. It is off by default: the
  library does not decide this for every app.
- Each waiting act keeps the door that asked (`Waiting.door`). `answer(book,
  id, yes, door)` answers `answer-elsewhere` and changes nothing when the door
  is the same.
- `acceptAll` and `rejectAll` skip the acts that the answering door asked for.
- A press on the screen comes through the person's door, whoever pressed. See
  [proposed is not a security boundary](proposed-is-not-a-boundary.md).

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, answer, setAsksNeverAnswers from "@agent-ui-kit/agent"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setName", title="Display name", sentence="Changes the name other people see.", floor="proposed", reach="others", secret=false)]

component App
  state book: Ledger = setAsksNeverAnswers(ledger([Value(key="name", value="Sam")], tools(), words()), true)
  action agentAsks
    book = act(book, Act(tool="setName", door="agent", key="name", title="Display name", value="Ada", did="Your assistant changed the name to Ada.", asks="Your assistant suggests the name Ada.", will="Your assistant will change the name to Ada soon."))
  action agentAnswers
    book = answer(book, "a1", true, "agent")
  action personAnswers
    book = answer(book, "a1", true, "person")
  action allowSelfAnswers
    book = setAsksNeverAnswers(book, false)
  view
    main testId="root"
      button press=agentAsks testId="as-agent"
        text "Ask as the assistant"
      button press=agentAnswers testId="agent-answers"
        text "Answer as the assistant"
      button press=personAnswers testId="person-answers"
        text "Answer as the person"
      button press=allowSelfAnswers testId="allow"
        text "Let the assistant answer"
```

```contract-test
test "the agent cannot answer its own proposal; the person can"
  tap "as-agent"
  tap "agent-answers"
  expect state book.answer == "answer-elsewhere"
  expect state book.values.0.value == "Sam"
  tap "person-answers"
  expect state book.values.0.value == "Ada"

test "with the rule off, the agent can"
  tap "allow"
  tap "as-agent"
  tap "agent-answers"
  expect state book.values.0.value == "Ada"
  expect state book.changes.0.answeredBy == "agent"
```
