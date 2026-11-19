# The Distiller

Points at everything a brand has (its guide, websites, web apps, native apps) and gives the brand's starting
point:

- a **Theme**: every token with a light and a dark value, a confidence, its sources and why it was chosen;
- **presets**: one per app as it looks today, and one **Harmonised** preset across all;
- a **divergence report**: where products break their own guide, where sibling apps disagree, and the value
  chosen with its reason and its evidence (a screenshot per page per scheme).

Run it again later on the same config and the new report is a drift check.

It reads real values, not only pictures: each page's computed styles and the custom properties it resolves,
grouped into scales; a native app's accessibility tree and pixels; the guide's own CSS. When sources disagree,
the guide wins, then published tokens, then what most live products do. Outliers are reported, never adopted.
A token the guide gives in one scheme only gets the other derived (hue kept, text contrast at least 4.5:1)
and marked as derived.

## Run

```sh
cd tools/distiller && bun install
npx playwright install chromium-headless-shell     # or DISTILLER_CHROMIUM=<a Chromium binary>
bun distill.mjs brand.json run/
bun test
```

Writes `run/theme.json`, `run/divergence-report.md`, `run/divergences.json`, and the evidence in
`run/evidence/`. Options: `--skip-web`; `--native <simulator-udid> <bundle-id> <id>` (iOS Simulator, one
launch, no window, light then dark, shut down after; uses [agent-device](https://github.com/callstackincubator/agent-device) for the accessibility tree).

## The brand config

```json
{
  "brand": "Example",
  "ownership": { "mode": "provider", "provider": "./my-provider.mjs", "domains": ["example.com"], "session": {} },
  "guide": {
    "id": "example-ui", "root": "../ui", "css": ["src/theme.css"], "darkSelector": ".dark", "font": "Inter, sans-serif",
    "components": [{ "prefix": "brand.button", "selector": ".brand-button", "why": "the same in both schemes",
                     "props": { "face": ["background", 0], "ink": ["color"], "height": ["height"] } }],
    "keyframes": { "brand.cycle": { "name": "brand-cycle", "prop": "stop-color" } },
    "rules": [{ "token": "brand.button failed", "selector": "data-status=\"failed\"", "prop": "background",
                "rule": "the button never turns red", "chosen": "keep it black" }]
  },
  "web": [{ "id": "site", "pages": ["https://example.com/"], "discover": "^https://example\\.com/[^?]*$", "maxPages": 8 }],
  "storeApps": [{ "platform": "ios", "appId": "TEAMID.com.example.app", "domain": "example.com" }],
  "nativeSource": [{ "id": "app", "root": "../app", "tokenCss": "styles/theme.css", "sourceDirs": ["src"] }]
}
```

Paths are relative to the config file. `guide.font` names the brand font (a guide's CSS often does not). Without a `guide`, the tokens most products publish stand in for it.
`components` and `keyframes` turn guide literals into tokens (`[property, nth colour in the value]`);
`rules` are the brand's written rules, checked against its own CSS.

## Harmonise from a chosen set

Harmonised is worked out from a reference set: any apps, and the guide or not (default: the guide and every
app). Apps outside the set are still read, and the report measures them against it. With the guide ticked off,
the reference apps' published tokens decide, then what they draw; a token no reference app shows takes the
guide's value, marked as a fill. A tie goes to the app named first.

```sh
bun harmonise.mjs brand.json run/ --reference website,exchange --guide off --json   # no browsing, well under a second
bun harmonise.mjs brand.json run/ --reference website,exchange --save "Harmonised: website + exchange"
```

`--json` prints exactly `{ name, reference: { apps, guide }, tokens: { <token>: { light, dark } }, divergences }`.
`--save` keeps it as `presets.saved[<name>]` in `run/theme.json`. An unknown id: one line on stderr, exit 2.
`theme.json` → `harmonise.sources` lists what can be ticked. `distill.mjs` and `analyse.mjs` take the same
`--reference` and `--guide` flags. In code: `distil({ cfg, runDir, reference, useGuide })` from `lib/distil.mjs`.

## Presets from published design systems, and blends

`presets/` holds starting presets made from published design systems' own token values (GitHub Primer, IBM
Carbon, Cloudflare Kumo; `bun bench/presets.mjs` remakes them). Each shows its licence and is accepted before
use (`licence.acceptBeforeUse`). Each token says where it came from (`from`) and what it is: `style` (a colour,
spacing, corner or type-scale value) or `copied` (a font name, icon, component or trademark).

```sh
bun blend.mjs run/theme.json presets/carbon.json --weight 0.3 --keep color.primary --out blend.json
```

A blend mixes the base's colours with the other's in OKLab by `--weight`; `--keep` names tokens that stay the
base's, and `brand.*` always does. Each token says whether it is the base's, the other's or a mix. Style values
mixed in make the blend its owner's own, with no licence carried; copied material keeps its licence, and its
notice comes with the blend.

## The benchmark

`bun bench/bench.mjs` distils each system in `bench/systems/` from its public site as if it were unknown, and
scores the result against the system's published tokens; run it after each change. Scores and what each change
did: [bench/RESULTS.md](bench/RESULTS.md).

## Doors: who may distil what (`lib/doors.mjs`)

| `ownership.mode` | Who | May read |
|---|---|---|
| `guest` | not authenticated | nothing: a draft designed from scratch |
| `provider` | a plug-in proves the person and what their organisation owns | the proven domains |
| `first-party` | the operator's own brand (`DISTILLER_FIRST_PARTY` lists the domains) | those domains |
| `dns-txt` | anyone who can set `distiller=<token>` as a TXT record on the domain | that domain |
| `published-system` | a design system published under an open licence (checked against the npm registry) | its public site, for the benchmark and presets |

Every source must be on a proven domain. A store app must also be named in that domain's
`/.well-known/apple-app-site-association` or `assetlinks.json`. Applying a Theme is never the Distiller's
(`apply()` always refuses): the brand's owner applies it.

A provider is a module whose default export is:

```js
export default {
  name: "my-provider",
  async authenticate(session) { /* → { entityId } or null */ },
  async ownsDomain(entity, domain) { /* → { ok } | { ok: false, why } | { ok: false, stub: true, willCheck } */ },
  async moveGuestDraft(draftId, entity) { /* optional: the guest draft moves into the organisation's playground */ },
};
```

## Output (`theme.json`, `$schema: "brand-intake/theme@1"`)

| Key | What |
|---|---|
| `tokens.<name>` | `light`, `dark`, `confidence` (high, medium, low), `sources`, `why`; `derived`, `decided` (what the Distiller changed and why, e.g. a low-contrast pair moved to 4.5:1 with the same hue), `schemeIndependent` |
| `presets.harmonised` | `name`, `reference: { apps, guide }`, `tokens`: `{ light, dark }` per token |
| `presets.saved.<name>` | a saved reference set: `reference`, `tokens` |
| `harmonise.sources` | `[{ id, kind, label }]`: the guide and every app, for choosing a reference set |
| `presets.apps.<id>.tokens` | `{ light, dark, source }` per token; a token the app does not show is Harmonised's, marked `harmonised (not seen)` |
| `checks` | notes for people, not rules: whether every token has both schemes, which text pairs have low contrast (WCAG 4.5:1 as the yardstick for now), whether a native token file matches the guide |
| `products`, `derived`, `skippedPages` | what was read |

Colour tokens are named `color.<name>` after the guide's custom properties (`color.background`,
`color.muted-foreground`, …).

## Steps

| File | Does |
|---|---|
| `distill.mjs` | runs every step after the doors |
| `collect-guide.mjs` | the guide's CSS: tokens per scheme, literals per selector, keyframes, each with file:line |
| `collect-web.mjs` | one headless Chromium; each page with the system set to light, then dark |
| `collect-native-source.mjs` | a native app's token file and the colours hard-coded in its source |
| `collect-native.mjs` | an iOS Simulator app's first screen: accessibility tree and pixels, light then dark |
| `analyse.mjs` | maps readings to the reference, chooses, derives, builds presets, writes the notes (`lib/distil.mjs`) |
| `harmonise.mjs` | the same on a saved run, for a chosen reference set; `--json`, `--save` |
| `blend.mjs` | a brand's look mixed with another preset, with where each value came from |
| `bench/bench.mjs`, `bench/presets.mjs` | the benchmark, and presets from published systems |
| `report.mjs` | the divergence report |
