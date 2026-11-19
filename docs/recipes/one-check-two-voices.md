# Recipe: one check, two voices

When an agent's value is refused, the agent gets one word and the person gets
a sentence, and both come from the same `fn`. So the two doors can never
disagree on what is wrong.

- One `fn` answers the refusal word (`too-short`), or `""` when the value is
  good. The tool sets the ledger's answer to that word and does not act.
- One `fn` turns the word into the person's sentence, which `Field` shows as
  its error.
- Write each word in the tool's description, so an agent knows the closed list.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, valueOf from "@agent-ui-kit/agent"
use Field from "@agent-ui-kit/forms"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setTeamName", title="Team name", sentence="Renames the team.", floor="proposed", reach="others", secret=false)]
fn problem(v: string): string = v.trim().length < 3 ? "too-short" : v.trim().length > 30 ? "too-long" : ""
fn message(word: string): string = word == "too-short" ? "Use at least 3 characters." : word == "too-long" ? "Use 30 characters or fewer." : ""

component App
  state book: Ledger = ledger([Value(key="team", value="Platform")], tools(), words())
  action setTeamName(value: string)
    book = problem(value) != "" ? Ledger(book, answer=problem(value)) : act(book, Act(tool="setTeamName", door="agent", key="team", title="Team name", value=value.trim(), did="Your assistant renamed the team.", asks="Your assistant suggests a new team name.", will="Your assistant will rename the team soon."))
  action agentTriesShort
    book = problem("A") != "" ? Ledger(book, answer=problem("A")) : book
  action edit(v: string)
    book = personSet(book, "team", v)
  tool setTeamName writes idempotent closed "Suggest a new team name (3 to 30 characters). Answers proposed, too-short or too-long." = setTeamName
    returns book.answer
    fails when book.answer == "too-short" or book.answer == "too-long"
  view
    main testId="root"
      button press=agentTriesShort testId="as-agent"
        text "Try a short name as the assistant"
      Field(id="team", label="Team name", hint="Other people see it.", error=message(problem(valueOf(book, "team"))))
        input value=valueOf(book, "team") input=edit aria-label="Team name" testId="team-input"
```

```contract-test
test "the person hears the sentence, the agent gets the word"
  type "team-input" "A"
  expect text "team-error" == "Use at least 3 characters."
  tap "as-agent"
  expect state book.answer == "too-short"
```
