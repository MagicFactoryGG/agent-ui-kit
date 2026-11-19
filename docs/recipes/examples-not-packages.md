# Recipe: drawn examples, not packages

The gallery's Examples tab holds a rating, a tree, a swatch picker, a
waterfall, a timeline and a disclosure. They are examples, not packages, by
one test: is the component about the layer between an agent and a person, and
does a real app need it now?

- **Tree, swatch picker, waterfall:** no platform control for them, each is
  more to keep the same on three hosts, and none is about the layer.
- **Timeline:** a display; it has no agent side at all.
- **Rating:** a value control like any other: `AgentRow` holds it and the
  ledger records it as it records a slider. Its spoken name per star needs
  words, which an example can hold and a package may not.
- **Disclosure:** view state only (open or closed); an agent has nothing to do
  with it.

Each shows that the layer works with any control an app makes: put it in an
`AgentRow`, read its value from the ledger, write it with `personSet`, and
give the agent a tool that sets it by key.

```contract
use Value, AgentTool, AnswerWords, Ledger, ledger, personSet, numberOf from "@agent-ui-kit/agent"
use AgentRow from "@agent-ui-kit/forms"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Accept", reject="Reject", now="Now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="setRating", title="Rating", sentence="Rates the item.", floor="recorded", reach="self", secret=false)]

component App
  state book: Ledger = ledger([Value(key="rating", value="0")], tools(), words())
  action rate(n: number)
    book = personSet(book, "rating", `${n}`)
  action nothing
    book = book
  view
    main testId="root"
      AgentRow(id="rating", title="Rating", mark="", sentence="", yesLabel="Accept", noLabel="Reject", yes=nothing, no=nothing)
        Stars(value=numberOf(book, "rating"), set=rate)

component Stars
  props
    value: number
    set: action
  view
    row role="group" aria-label="Rating"
      for n in [1, 2, 3] key=n
        button press=set(n) testId=`star-${n}` buttonStyle="plain" aria-label=`${n} of 3 stars`
          image (n <= value ? "symbol:star-fill" : "symbol:star")
```

```contract-test
test "a drawn control writes the ledger like any other"
  tap "star-2"
  expect state book.values.0.value == "2"
```
