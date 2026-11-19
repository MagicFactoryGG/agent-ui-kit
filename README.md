# agent-ui-kit (working name)

The layer between an agent and a person, for [Exact](https://github.com/expo/exact) apps. A person
and an agent change the same values; this library records what an agent did, holds what waits for a
person, shows both on the platform's own controls, and gives every Exact app checks that prove it.

It gives mechanisms, not policy. It does not decide whether a person was really there: the app and its
authentication provider decide that ([proposed is not a security boundary](docs/recipes/proposed-is-not-a-boundary.md)).

## What is here

| Path | What it is |
|---|---|
| `packages/agent` | `@agent-ui-kit/agent`: the ledger (pure functions: act, answer, undo, settle, raise) and its views: `ChangeMark`, `ProposalBar`, `Notice`, `ActivityList`, `ApprovalSheet`, `PermitList` |
| `packages/forms` | `@agent-ui-kit/forms`: `Field`, `Combobox`, `ToggleRow`, `AgentRow` |
| `packages/commands` | `@agent-ui-kit/commands`: `CommandPalette`; each command names its tool |
| `apps/agent-gallery` | every package in task screens a person and an agent use alike, and drawn examples |
| `apps/library-gate` | every exported component, in the form of Exact's library gate |
| `docs/recipes` | one recipe per idea, each with an app and its tests |
| `tools` | the checks, which any Exact app can run |

## The rules

1. **The app owns the value.** Components are controlled. The values an agent may reach live in the
   app's ledger, and both doors write it with the same functions.
2. **Agents act on data, never on view state.** Open, highlighted, scrolled and focused are the
   component's or the person's. An agent sets a value by key.
3. **The mode belongs to the tool.** The app lists its tools once, each with a floor: direct, recorded,
   delayed, proposed or off. A person can raise a mode, never lower it below the floor
   ([modes](docs/recipes/modes.md)).
4. **Every act is one sentence with at most two answer words**, so it can leave the screen
   ([one sentence, two words](docs/recipes/one-sentence-two-words.md)).
5. **No words in a package.** Every label and sentence is the app's.
6. **Secrets are filled, never read** ([secrets](docs/recipes/secrets.md)).
7. **The accessibility tree alone completes each task**: every control a test uses has its own name.

## Run it

You need a checkout of Exact at commit `51002ee77` (the version this repository is tested against),
Bun 1.4.2 and the Rust toolchain on `PATH`, and Xcode for macOS and the iOS Simulator. Point the apps at
your Exact checkout with `EXACT` (each app's `exact.mjs` was written by Exact's `exact new`, and its
default path is only the authors' folder layout):

    export EXACT=/path/to/exact
    cd apps/agent-gallery && bun install && bun exact.mjs test web     # or macos, ios
    cd ../library-gate && bun install && bun exact.mjs test web
    cd ../.. && bun tools/check.mjs web                                # every check, one host

## Use it in your app

The packages are not on a registry. Add them by path, as Exact's own guide does for a local library:

    "dependencies": {
      "@agent-ui-kit/agent": "file:<this repo>/packages/agent",
      "@agent-ui-kit/forms": "file:<this repo>/packages/forms",
      "@agent-ui-kit/commands": "file:<this repo>/packages/commands"
    }

Start with [one ledger, two doors](docs/recipes/one-ledger-two-doors.md); run the checks on your app with
[run the checks](docs/recipes/run-the-checks.md).

Every check and its settings: [run the checks](docs/recipes/run-the-checks.md). What Exact blocks today,
and the workaround for each: [Exact asks](docs/recipes/exact-asks.md).

## Status

Version 1. Exact changes quickly; this repository follows one pinned Exact commit and moves it on purpose.
Issues are welcome. A gap in Exact itself goes to Exact's own issues, with the smallest app that shows it.

## The name

`agent-ui-kit` is a working name. It is in: this title, the `@agent-ui-kit/` scope of the three
`package.json` files, the `use … from "@agent-ui-kit/…"` lines, and the apps' `package.json`
dependencies and bundle ids. A rename is one search and replace over those.
