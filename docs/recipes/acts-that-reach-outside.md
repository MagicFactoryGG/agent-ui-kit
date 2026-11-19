# Recipe: acts that reach outside the app

Sending a message, paying, posting: the act's real effect is outside the ledger. The ledger holds the
act until it may happen (proposed: until the person accepts; delayed: until no one stopped it), and the
app does the outside work only for the acts that just took effect.

- A tool that sends is seen by other people (`reach: "others"`), and one whose line is not `closed`
  reaches outside the app: either way its floor is `proposed` (`tools/modes.mjs`). Here the tool only puts
  the reply in the ledger; the app's own code sends it once the person says yes.
- `newChanges(before, after)` is the list of acts that took effect between two ledgers. The action that
  answers or settles keeps the ledger before, computes the ledger after, and starts the outside work for
  each new change of the sending tool. Action reads see the starting state, so the action binds `after`
  with `let`.
- The record keeps the act as a receipt (`Change`): which tool, which door asked, which door answered.

```contract
use Value, AgentTool, AnswerWords, Act, Ledger, Change, ledger, act, answerKey, newChanges, waitingSentence, waitingYes, waitingNo from "@agent-ui-kit/agent"
use ProposalBar from "@agent-ui-kit/agent"

fn words(): AnswerWords = AnswerWords(keep="Keep", undo="Undo", accept="Send", reject="Discard", now="Send now", stop="Stop")
fn tools(): AgentTool[] = [AgentTool(name="sendReply", title="Send replies", sentence="Sends a reply you have read.", floor="proposed", reach="others", secret=false)]

component App
  state book: Ledger = ledger([Value(key="reply:t1", value="")], tools(), words())
  // The app's outbox: what its data code sends.
  state outbox: string[] = []
  action sendReply(thread: string, body: string)
    book = act(book, Act(tool="sendReply", door="agent", key=`reply:${thread}`, title="Reply", value=body, did="Your assistant sent the reply.", asks="Your assistant wrote a reply for you to send.", will="Your assistant will send the reply in 5 seconds."))
  action draftAsAgent
    book = act(book, Act(tool="sendReply", door="agent", key="reply:t1", title="Reply", value="Thanks, see you Monday.", did="Your assistant sent the reply.", asks="Your assistant wrote a reply for you to send.", will="Your assistant will send the reply in 5 seconds."))
  action send
    let before = book
    let after = answerKey(before, "reply:t1", true, "person")
    outbox = outbox.concat(newChanges(before, after).filter(c => c.tool == "sendReply").map(c => c.now))
    book = after
  action discard
    book = answerKey(book, "reply:t1", false, "person")
  tool sendReply writes idempotent closed "Write a reply for the person to send. Answers proposed." = sendReply
    returns book.answer
  view
    main testId="root"
      button press=draftAsAgent testId="as-agent"
        text "Draft as the assistant"
      ProposalBar(id="reply", sentence=waitingSentence(book, "reply:t1"), yesLabel=waitingYes(book, "reply:t1"), noLabel=waitingNo(book, "reply:t1"), yes=send, no=discard)
```

```contract-test
test "nothing leaves until the person sends it"
  tap "as-agent"
  expect state outbox.length == 0
  tap "reply-accept"
  expect state outbox.0 == "Thanks, see you Monday."
  expect state book.changes.0.answeredBy == "person"

test "a discarded reply never leaves"
  tap "as-agent"
  tap "reply-reject"
  expect state outbox.length == 0
```
