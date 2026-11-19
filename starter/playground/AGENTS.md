# __TITLE__ playground

Where __TITLE__'s components, blocks and screens are designed and tried, live, on the web and macOS side by side
(iOS on demand), in light and dark. Nothing ships from here.

- **Start it:** `bun play.mjs` (the web page and the Mac app, both reloading on every save); `bun play.mjs ios`
  adds iOS once; `bun play.mjs stop` ends them. Stop it when you are not looking.
- **The app is generated.** `app.contract`, `app.ts` and `app.forma` are written by `play.mjs` from the design
  repo (`__DESIGN__`) and `wip/`; never edit them. `bun play.mjs check` fails on a hand edit.
- **New things start in `wip/`.** Declare the piece's states as enum props named for their axis; the matrix
  (every state, every pair, the marked ones) is drawn from them. A piece with none is refused.
- **The Theme is configuration:** edit `__DESIGN__/theme.json` and watch every host change. Move a token with
  Exact's design tool (`bun exact.mjs forma tool . --via <the web URL>`); `bun play.mjs save <name>` keeps the
  current values as a preset in the design repo.
- **When a piece is final**, move it to the design repo (components or blocks), with its states.
- The guard (`bun __DESIGN__/tools/ui-guard.mjs .`) holds this app to imports and data, as every app.
