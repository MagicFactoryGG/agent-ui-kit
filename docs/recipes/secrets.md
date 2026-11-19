# Recipe: secrets an agent fills and never reads

A password, a pairing code or an API key: an agent may fill it, and nothing
gives it back.

- The tool's floor is `direct` (`AgentTool.secret` is true): the value is
  written at once and never goes into the record, so no undo and no activity
  line holds it.
- A secret's tool takes only `direct`, `proposed` or `off`: `raise` answers
  `secret-mode` for `recorded` or `delayed`. While a proposed secret waits,
  its value is in `Waiting.value` (the ledger needs it to apply the answer):
  an app never shows that field for a secret's tool. Once it takes effect, its
  receipt keeps no value (`was` and `now` are `""`), and `undo` answers
  `secret`.
- No `reads` tool returns the value: a read says `set` or `empty`.
- The field is the platform's own (`input type="password"`, or
  `autocomplete="one-time-code"` for a code), so AutoFill and the platform's
  rules still apply.
- The notice says that the agent filled it, in one sentence, with no answer
  words.
- `tools/both-doors.mjs` can hold a case to `noLeak`: no call record holds the
  secret's text.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, valueOf, isMarked from "@agent-ui-kit/agent"
use Notice from "@agent-ui-kit/agent"
use AgentRow from "@agent-ui-kit/forms"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setKey", title="API key", sentence="Fills the API key. It can never read it.", floor="direct", reach="self", secret=true)]

component App
  state book: Ledger = ledger([Value(key="apiKey", value="")], tools(), words())
  derive accountText = `apiKey\t${valueOf(book, "apiKey") == "" ? "empty" : "set"}`
  action setKey(value: string)
    book = act(book, Act(tool="setKey", door="agent", key="apiKey", title="API key", value=value, did="Your assistant filled the API key.", asks="Your assistant suggests filling the API key.", will="Your assistant will fill the API key soon."))
  action fillAsAgent
    book = act(book, Act(tool="setKey", door="agent", key="apiKey", title="API key", value="sample-key", did="Your assistant filled the API key.", asks="Your assistant suggests filling the API key.", will="Your assistant will fill the API key soon."))
  action edit(v: string)
    book = personSet(book, "apiKey", v)
  action readAccount
  action nothing
    book = book
  tool setKey writes idempotent closed "Fill the API key. Its value is never returned." = setKey
    returns book.answer
  tool readAccount reads "Whether the API key is set or empty; never its value." = readAccount
    returns accountText
  view
    main testId="root"
      button press=fillAsAgent testId="as-agent"
        text "Fill as the assistant"
      AgentRow(id="apiKey-row", title="API key", mark=(isMarked(book, "apiKey") ? "Filled by your assistant" : ""), sentence="", yesLabel="Accept", noLabel="Reject", yes=nothing, no=nothing)
        input type="password" value=valueOf(book, "apiKey") input=edit aria-label="API key" testId="apiKey"
      Notice(id="notice", note=book.note, yes=nothing, no=nothing)
```

```contract-test
test "the agent fills the key: no record, a mark, a read that says only set"
  tap "as-agent"
  expect state book.changes.length == 0
  expect tree has "apiKey-row-mark"
  expect state accountText == "apiKey\tset"
  expect tree missing "notice-no"
```
