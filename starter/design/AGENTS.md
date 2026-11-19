# __TITLE__ design repo

The one place __TITLE__'s UI is made. Apps import it; nothing is designed inside an app, so a change here reaches
every app.

| Path | Layer | What it holds |
|---|---|---|
| `theme.json` | Theme | the brand, as configuration: colour (light and dark), type, spacing, corners, motion |
| `theme/` | Theme | generated from `theme.json`: `theme.forma` (Exact), `theme.css` and `tailwind.css` (React) |
| `presets/` | Theme | other theme files to compare (each app's look today, Harmonised); the playground switches them |
| `components/` | Components | one control or drawn piece each |
| `blocks/` | Blocks | components arranged |
| `screens/` | Screens | whole layouts that take data, states and actions |
| `frame/` | – | the playground's frame (neutral, not the brand) |
| `tools/` | – | from agent-ui-kit: theme, matrix, guard, parity, vendor |

- **UI comes from here; something new starts in the playground** (`wip/` there), then moves here when final.
- **Every piece declares its states** as enum props named for their axis (interaction, outcome, data, agent).
  `bun tools/matrix.mjs check .` fails on a piece with none.
- **Never a literal** in a piece: a Theme token (`theme.…`) or the package's own size. Exact holds it (each
  package ships a design, so it is a library: `lower-library-literal`).
- **No words in a piece:** every word is a prop.
- **Done** means `bun run check` (theme, matrix) and `bun tools/parity.mjs <playground> --pieces <it>` (web and macOS, light and dark) pass.
- An app takes the packages by path, or vendored with `bun tools/vendor.mjs <app dir>`; its tests run
  `tools/ui-guard.mjs` on it.
