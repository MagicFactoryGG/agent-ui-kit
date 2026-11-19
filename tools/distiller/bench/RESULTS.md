# The Distiller's benchmark

Each system is distilled from its public site as if it were unknown (no guide, no package), then scored against
its own published tokens (`bun bench/bench.mjs`). Score = (colour hits + half the near ones + the font if right)
÷ (colours + 1). A hit is under 0.02 OKLab from the published value (about the smallest visible step); near is
under 0.05. 15 roles × 2 schemes per system. `scores.json` keeps the latest.

| Step | What changed in the Distiller | Primer | Carbon | Kumo |
|---|---|---|---|---|
| v0 | the Distiller as it was: with no guide it knew only shadcn names and four drawn roles | 0.13 | 0.16 | 0.21 |
| v1 | finds roles in any vocabulary by common name words (`lib/roles.mjs`) | 0.57 | 0.16 | 0.14 |
| v2 | resolves `light-dark()`; reads token names from stylesheets of another origin; tries common dark switches when a site ignores the system's dark setting | 0.81 | 0.24 | 0.52 |
| v3 | when a page carries several vocabularies, takes the one that names the basic roles and matches what it draws, one per product; prefers tokens that change between light and dark; distrusts a canvas that did not switch | 0.81 | 0.36 | 0.52 |
| v3.1 | the ground truth reads `color-mix()`, so Kumo's dark primary is scored too (30 values, not 29); decided colours keep their hue when they leave sRGB | **0.81** | **0.36** | **0.50** |

v3 also scores each scheme against the closest of a system's published themes (Carbon publishes white and g10
for light, g90 and g100 for dark).

## What limits the scores now

- **Carbon (0.36):** carbondesignsystem.com is not drawn only with Carbon's tokens. It carries a separate
  shadcn-style layer and the Geist font, uses the g10 theme, and has no dark mode at all (no system setting and
  no common switch changes it). The Distiller describes the site correctly; the site is not the system.
- **Kumo (0.50):** the package means `success`, `warning` and `danger` as fills; the site's text tokens with the
  same words are darker. Which one a Theme's "success" is, is a naming choice, not a reading error. `muted` and
  `accent` have no words the role finder knows (`recessed`, `fill-hover`).
- **Primer (0.81):** `primary` is Primer's green button; the site's own accent is blue. Dark is behind
  `data-color-mode`, which the Distiller now finds.

## What it does not yet measure

Corners, spacing, type scale and shadows; components. And how close an Exact rendering of each preset comes to
the system's own components (where Exact's drawn approach would stop being enough) needs a parity run on
rendered pieces, not this token benchmark.

## The guard against fitting the benchmark

The role words and the rules above are generic (no system's names appear in `lib/roles.mjs`). A new system
added to `systems/` is the honest test: its first score is the real one.
