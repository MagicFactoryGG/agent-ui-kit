# Recipe: "proposed" is not a security boundary

A proposal waits for an answer. It does **not** prove that a person gave it.

- An agent that can drive the screen can press Accept, as a person can. The
  app sees a press, not who pressed.
- "The door that asks never answers" ([recipe](the-door-that-asks.md)) stops an
  answer through the tool door that asked. It does not stop a press on the
  screen.
- So "proposed" protects against a correct agent's mistakes: a person sees the
  act and can say no. It does not stop a hostile agent.
- Where the answer must come from a person, put a check that is outside the
  app's view in front of the answer. `ApprovalSheet`'s `accept` and every
  control's `yes` are plain action props, so the app can call its
  authentication provider (or a second factor) before it calls `answer`.
- This library holds no view on what counts as proof that a person was there.
  The app and its authentication provider decide that; the library only
  carries the answer and records who answered through which door
  (`Change.answeredBy`).

The block below shows the shape: the person's Accept first asks the app's own
check (here a stand-in that a test sets), and only a passed check answers.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, answerKey, waitingSentence, waitingYes, waitingNo, isOn from "@agent-ui-kit/agent"
use ToggleRow from "@agent-ui-kit/forms"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setTwoStep", title="Two-step approval", sentence="Turns two-step approval on or off.", floor="proposed", reach="self", secret=false)]

component App
  state book: Ledger = ledger([Value(key="twoStep", value="on")], tools(), words())
  // The app's own check, outside the ledger (a stand-in here).
  state checkPassed = false
  state refused = 0
  action agentAsks
    book = act(book, Act(tool="setTwoStep", door="agent", key="twoStep", title="Two-step approval", value="off", did="Your assistant turned two-step approval off.", asks="Your assistant suggests turning two-step approval off.", will="Your assistant will turn two-step approval off soon."))
  action passCheck
    checkPassed = true
  action acceptWithCheck
    if checkPassed
      book = answerKey(book, "twoStep", true, "person")
    else
      refused = refused + 1
  action rejectIt
    book = answerKey(book, "twoStep", false, "person")
  action setByPerson(on: bool)
    refused = refused + 1
  view
    main testId="root"
      button press=agentAsks testId="as-agent"
        text "Act as the assistant"
      button press=passCheck testId="pass-check"
        text "Pass the app's check"
      ToggleRow(id="twoStep", title="Two-step approval", checked=isOn(book, "twoStep"), set=setByPerson, mark="", sentence=waitingSentence(book, "twoStep"), yesLabel=waitingYes(book, "twoStep"), noLabel=waitingNo(book, "twoStep"), yes=acceptWithCheck, no=rejectIt)
```

```contract-test
test "a press on Accept without the app's check answers nothing"
  tap "as-agent"
  tap "twoStep-accept"
  expect state refused == 1
  expect state book.values.0.value == "on"
  expect state book.waiting.length == 1

test "the app's check, then Accept, answers"
  tap "as-agent"
  tap "pass-check"
  tap "twoStep-accept"
  expect state book.values.0.value == "off"
  expect state book.changes.0.answeredBy == "person"
```
