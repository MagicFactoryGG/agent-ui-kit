# agent-ui-kit: for agents

Exact's own form, in one repository: `packages/<group>/` (an `index.contract`, one file per component,
the group's `.forma` design, a `package.json`), apps under `apps/`, recipes under `docs/recipes/`,
checks under `tools/`. Read Exact's `docs/start-here.md` for Exact itself; read the recipe that names
your task here. There is no second required read.

- **No words in a package.** Every word a person reads is a prop. `bun tools/words.mjs` fails on a
  literal word in a package's view, and on any company's name in any file.
- **Library code is pure functions.** A tool's action calls ledger functions only, never another action
  with arguments ([Exact asks](docs/recipes/exact-asks.md), 3).
- **A new component** gets cells in `apps/library-gate/app.contract` (once per variant value, as the
  compiler's IR says) and a line in its test; `bun tools/library-gate.mjs` holds them.
- **A new tool in the gallery** gets a row in `agentTools()` (its floor), a face in `app.json`, a sample
  in `agent-checks.json` and a case in `both-doors.json`.
- **Done** means `bun tools/check.mjs web`, then `macos`, then `ios` pass, in that order. Run ios last
  and once per piece of work: there it runs each app's own tests once, with no Simulator window, and
  the checks that launch the app once per case stay on web and macos. Shut the Simulator down after.
- Cite Exact's public guide by its section names.
- When Exact surprised you, record it: `bun exact.mjs feedback note "…"` in the app. Send nothing.
