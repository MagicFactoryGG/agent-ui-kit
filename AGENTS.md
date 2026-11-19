# agent-ui-kit: for agents

Exact's own form, in one repository: `packages/<group>/` (an `index.contract`, one file per component,
the group's `.forma` design, a `package.json`), apps under `apps/`, recipes under `docs/recipes/`,
checks under `tools/`. Read Exact's `docs/start-here.md` for Exact itself; read the recipe that names
your task here. There is no second required read.

- **No words in a package.** Every word a person reads is a prop. `bun tools/words.mjs` fails on a
  literal word in a package's view.
- **Library code is pure functions.** A tool's action calls ledger functions only, never another action
  with arguments ([workarounds](docs/recipes/exact-workarounds.md), 3).
- **A new component** gets cells in `apps/library-gate/app.contract` (once per variant value, as the
  compiler's IR says) and a line in its test; `bun tools/library-gate.mjs` holds them.
- **A new tool in the gallery** gets a row in `agentTools()` (its floor), a face in `app.json`, a sample
  in `agent-checks.json` and a case in `both-doors.json`.
- **Done** means `bun tools/check.mjs web`, `macos` and `ios` pass. On ios it runs each app's own
  tests only: the drive checks launch the app once for each case, which is slow on a simulator.
- Cite Exact's public guide by its section names.
- When Exact surprised you, record it: `bun exact.mjs feedback note "…"` in the app. Send nothing.
- **The starter** (`starter/`, `tools/create.mjs`, `theme.mjs`, `matrix.mjs`, `ui-guard.mjs`, `parity.mjs`, `vendor.mjs`): read `starter/README.md`. A piece there declares its states; only the theme file holds a brand.
