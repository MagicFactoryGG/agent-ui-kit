# The starter: your own design repo and playground

A relying party gets two things, made by one create step, as `exact new` makes an app:

- a **design repo**: the Theme, Components, Blocks and Screens your apps import. Nothing is designed inside an
  app, so one change here reaches every app;
- a **playground**: an Exact app, generated from the design repo, that shows every piece in every state, light
  and dark, live on the web and macOS side by side (iOS on demand). New pieces start in its `wip/`. Nothing
  ships from it.

Only the theme file holds your brand. Everything else is this kit's, and the same for every party.

```sh
export EXACT=/path/to/exact     # the Exact checkout this kit is tested at (README, "Run it")
bun tools/create.mjs --title "Acme" --scope @acme \
  --design ../acme-design --playground ../acme-playground [--theme acme-theme.json] [--presets presets/]
cd ../acme-playground && bun play.mjs
```

## Layers

| Layer | Where | What it holds |
|---|---|---|
| Theme | `theme.json`, generated `theme/` | colour (each light and dark), type, spacing, corners, motion |
| Components | `components/` | one control or drawn piece each, with its states |
| Blocks | `blocks/` | components arranged, with their states |
| Screens | `screens/` | whole layouts that take data, states and actions |

Each layer is an Exact package that ships a design (`<layer>.forma`), so Exact holds it to its library rules: no
literal colour, spacing or corner (`lower-library-literal`), every button named, nothing that reads its host.
No words in a piece: every word is a prop.

## Theme

The Theme is configuration: `theme.json`, which a person or an agent edits and sees live in the playground on
every host. `tools/theme.mjs` checks it and writes `theme/theme.forma` (Exact), `theme/theme.css` (CSS custom
properties with `light-dark()`) and `theme/tailwind.css` (a Tailwind v4 `@theme`) from it.

- Every colour has a light and a dark value; one value fails.
- Text pairs reach 4.5:1 in both modes, or are listed in `$open` as a decision for the brand's owner, which the
  check prints on every run.
- Type sizes are px on purpose: a rem is 16px on the web and 13px on macOS (Exact 51002ee77), so rem type
  would not look the same. Exact warns of px type (`forma-type-fixed`): it does not follow the person's text
  size. That is the price of parity, said here.
- The Distiller's output (`tools/distiller`) becomes a theme with `bun tools/theme.mjs from-distiller
  <distilled.json> <design dir>`: Harmonised as `theme.json`, each app as it is today in `presets/`.

## Presets

`presets/*.json` are other themes to compare (each app as it is today, Harmonised, a named idea). The playground
puts them on one Exact mode axis, `preset`, so one press switches every host at once (`setMode`); `theme.json`
is always the first. Move any token with Exact's design tool on the running playground (`bun exact.mjs forma
tool . --via <web URL>`); `bun play.mjs save <name>` keeps `theme.json` as a preset.

## State matrix

States are declared once, in the piece, as enum props named for their axis; the first value is the resting one.

| Axis | Values |
|---|---|
| `interaction` | idle, hover, pressed, focus, disabled, busy |
| `outcome` | none, success, error, blocked, cancelled |
| `data` | many, one, empty, loading, failed, long (blocks and screens) |
| `agent` | none, proposed, changed, waiting |

Mode (light, dark) is each cell's two columns; host is where the playground runs. `tools/matrix.mjs` makes the
cells from the props, as Exact's library gate and `contract gallery` place each variant value: the resting cell,
every single state, every pair of states on two axes, each other variant alone, and the combinations a
designer marks in the package's `states.json` (`{"ActionButton": [{"interaction": "busy", "outcome": "error"}]}`).
A component or block with no declared state fails `bun tools/matrix.mjs check`. A host's own hover, press and
focus still draw the same looks live (`:hover`, `:active`, `:focus-visible`).

## Guards

`tools/ui-guard.mjs <app dir>` holds an app to imports and data. It fails when the app defines a component
other than its root, a style, keyframes or font, a raw colour, a style or size of its own, or a drawn node, or
when a vendored copy of the design packages differs from its manifest. Native text input and menus (`input`,
`textarea`, `select`) and the navigation root are the platform's. Put it in each app's tests, and these lines in
its `AGENTS.md`:

> UI comes from the design repo. Something new is made in the playground first.

## Parity

`tools/parity.mjs <playground dir> [--pieces A,B] [--rows resting|all]` draws each Screen's cells and the pieces
named on the web and macOS, in light and dark. The generated playground filters to one cell at a time (its
"find" field), so each node with a testId is read once on each host: colour, type (on text), spacing and corners
are compared from each host's own layout, with the numbers, and the cell's pixels are compared too. A frame's
size is reported, not judged (each host measures the border box its own way); the pixels decide. It writes
`parity.md` and `parity.json` and fails beyond the tolerances it prints.
