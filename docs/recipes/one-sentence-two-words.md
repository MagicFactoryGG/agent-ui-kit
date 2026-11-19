# Recipe: one sentence, two words

Every act can leave the screen: a voice, a caption, a watch or a line in a
game's display can carry it. So every act the ledger holds is said in one
sentence, and answered with at most two words.

- The app writes three sentences for each act (`Act.did`, `Act.asks`,
  `Act.will`); the ledger picks the one for the mode in force. A recorded act
  keeps its `did` sentence; a waiting one says `asks` or `will`, and keeps
  `did` for its record once it takes effect.
- The two answer words come from the app once (`AnswerWords`): keep or undo,
  accept or reject, now or stop.
- `Notice`, `ProposalBar`, the rows in `@agent-ui-kit/forms`, `ActivityList`
  and `ApprovalSheet` show the same sentence and words, and each button's
  accessible name is the word with its sentence.
- A sentence names no place on the screen ("the row above"): a voice has no
  screen. `tools/modes.mjs` fails an act with no sentence, more than one
  sentence, a place word, or an answer of more than two words.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, noteYes, noteNo from "@agent-ui-kit/agent"
use Notice from "@agent-ui-kit/agent"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setGoal", title="Step goal", sentence="Sets the daily step goal.", floor="recorded", reach="self", secret=false), AgentTool(name="setName", title="Display name", sentence="Changes the name other people see.", floor="proposed", reach="others", secret=false)]

component App
  state book: Ledger = ledger([Value(key="goal", value="8000"), Value(key="name", value="Sam")], tools(), words())
  action setGoal
    book = act(book, Act(tool="setGoal", door="agent", key="goal", title="Step goal", value="9000", did="Your assistant set the step goal to 9000.", asks="Your assistant suggests a step goal of 9000.", will="Your assistant will set the step goal to 9000 soon."))
  action setName
    book = act(book, Act(tool="setName", door="agent", key="name", title="Display name", value="Ada", did="Your assistant changed the name to Ada.", asks="Your assistant suggests the name Ada.", will="Your assistant will change the name to Ada soon."))
  action yes
    book = noteYes(book, "person")
  action no
    book = noteNo(book, "person")
  view
    main testId="root"
      button press=setGoal testId="goal"
        text "Set the goal as the assistant"
      button press=setName testId="name"
        text "Suggest a name as the assistant"
      Notice(id="notice", note=book.note, yes=yes, no=no)
```

```contract-test
test "a recorded act: its sentence, keep or undo"
  tap "goal"
  expect text "notice-message" == "Your assistant set the step goal to 9000."
  expect state book.note.yes == "Keep"
  expect state book.note.no == "Undo"
  tap "Undo: Your assistant set the step goal to 9000."
  expect state book.values.0.value == "8000"

test "a proposed act: its sentence, accept or reject"
  tap "name"
  expect text "notice-message" == "Your assistant suggests the name Ada."
  tap "Accept: Your assistant suggests the name Ada."
  expect state book.values.1.value == "Ada"
  expect state book.changes.0.sentence == "Your assistant changed the name to Ada."
```
