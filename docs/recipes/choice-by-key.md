# Recipe: a choice by key, never by driving the view

A combobox, a tree, a menu: the person opens, types and highlights; an agent
does none of that. The agent finds options with a `reads` tool and sets the
value by key. What is open, typed or highlighted stays the component's (or
the person's) view state, and a tool call never changes it.

- `Combobox` owns its query, whether its list is open, and its highlight; the
  app owns the chosen value and passes it in.
- A `find` tool lists keys that match a text; the `set` tool refuses a key not
  in the list with `unknown-option`.
- On the web the highlighted option reaches accessibility by
  `aria-activedescendant`; Exact's own combobox recipe says only the web
  exposes it today.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, ledger, act, personSet, valueOf from "@agent-ui-kit/agent"
use Combobox from "@agent-ui-kit/forms"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setCity", title="City", sentence="Sets the city.", floor="recorded", reach="self", secret=false)]
fn cities(): string[] = ["Adelaide", "Brisbane", "Melbourne", "Perth"]

component App
  state book: Ledger = ledger([Value(key="city", value="Brisbane")], tools(), words())
  state findQuery = ""
  derive hits = cities().filter(c => c.toLowerCase().includes(findQuery.toLowerCase())).join("\n")
  action findCity(text: string)
    findQuery = text
  action setCity(name: string)
    book = cities().includes(name) ? act(book, Act(tool="setCity", door="agent", key="city", title="City", value=name, did=`Your assistant set the city to ${name}.`, asks=`Your assistant suggests ${name}.`, will=`Your assistant will set the city to ${name} soon.`)) : Ledger(book, answer="unknown-option")
  action choose(name: string)
    book = personSet(book, "city", name)
  tool findCity reads "Cities whose name contains the text, one per line." = findCity
    returns hits
  tool setCity writes idempotent closed "Set the city to one from findCity. Answers saved or unknown-option." = setCity
    returns book.answer
    fails when book.answer == "unknown-option"
  view
    main testId="root"
      Combobox(id="city", label="City", value=valueOf(book, "city"), options=cities(), placeholder="Search cities", choose=choose)
```

```contract-test
test "the person filters and chooses"
  type "city" "Mel"
  type "city" key "Enter"
  expect state book.values.0.value == "Melbourne"
  expect tree missing "city-options"
```
