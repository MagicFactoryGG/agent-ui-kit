// tools/matrix.mjs: how the catalogue writes each piece. Exact compiles a component's body in at each place the
// component is written, so a piece written once per scheme doubles the web build of every catalogue page.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./matrix.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DESIGN = resolve(ROOT, "starter/design");
const PLAY = resolve(ROOT, "starter/playground");

/** One page of the generated app: the lines from its `if page == "<key>"` to the next page. */
const pageOf = (app, key) => app.split(`      if page == "${key}"\n`)[1].split("\n      if page == ")[0];

test("a piece is written once for each of its states: light and dark through one for", () => {
  for (const [section, key, piece] of [[undefined, "components-ActionButton", "ActionButton"], ["blocks", "blocks-DataTable", "DataTable"], ["screens", "screens-MailScreen", "MailScreen"]]) {
    const out = generate(DESIGN, PLAY, { section });
    expect(out.bad).toBeUndefined();
    const page = pageOf(out.app, key);
    const rows = page.match(/^\s+MatrixRow\(/gmu).length;
    expect(rows).toBeGreaterThan(1);
    expect(page.match(new RegExp(`^\\s+${piece}\\(`, "gmu")).length).toBe(rows);
    expect(page.match(/^\s+for sc in \["light", "dark"\] key=sc$/gmu).length).toBe(rows);
  }
});

test("each cell keeps its testIds, light and dark", () => {
  const page = pageOf(generate(DESIGN, PLAY, {}).app, "components-ActionButton");
  expect(page).toContain('MatrixCell(scheme=(sc == "dark" ? "dark" : "light"), testId=`actionbutton--resting--${sc}`)');
  expect(page).toContain("testId=`actionbutton--resting--${sc}-piece`");
  expect(page).not.toContain('"actionbutton--resting--light');
});

test("a layer split by file name is refused, loudly, with the section that does it", () => {
  const dir = mkdtempSync(join(tmpdir(), "matrix-"));
  try {
    const samples = join(dir, "samples.json");
    writeFileSync(samples, JSON.stringify({ sections: { "blocks-a-f": { layers: ["blocks"], match: "^[a-f]" }, screens: { layers: ["screens"] } } }));
    const out = generate(DESIGN, PLAY, { samples });
    expect(out.bad).toEqual(['samples.json sections.blocks-a-f: "match" splits a layer by file name; give the layer one section (each piece is written once per state, so one app holds it)']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
