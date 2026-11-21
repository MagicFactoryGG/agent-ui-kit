// tools/wording.mjs: the owner's words, "authenticate" and "end session". The refused phrases are built at run time
// (w), so this file holds none of them and the check of the repository passes over it.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findings } from "./wording.mjs";

const w = (...parts) => parts.join("");
const TOOL = resolve(fileURLToPath(import.meta.url), "../wording.mjs");

test("every phrasing of going in is refused, with authenticate as the word to use", () => {
  for (const said of [w("Sign", " in"), w("sign", "-in"), w("sign", "In"), w("Sign", "In"), w("LOG", "IN"), w("log", "in"), w("Log", " In"), w("signed", " in"), w("signing", " in"), w("logged", " in"), w("sign", "_in"), w("entry", "Sign", "In", "Act")]) {
    expect(findings(`  title="${said}"`).map((f) => f.use)).toEqual(["authenticate"]);
  }
});

test("every phrasing of coming out is refused, with end session as the word to use", () => {
  for (const said of [w("Sign", " out"), w("sign", "-out"), w("log", "Out"), w("LOG", "OUT"), w("log", "out"), w("logged", " out"), w("signs", " out"), w("sign", "Out", "Button")]) {
    expect(findings(`tool ${said} writes`).map((f) => f.use)).toEqual(["end session"]);
  }
});

test("the owner's words and words that only contain the letters pass", () => {
  for (const ok of ["Authenticate", "End session", "authenticateAct", "design input", "the catalog in Accord", "Logo inside the bar", "blog outline", "a signal in the log", "assign", "logic"]) {
    expect(findings(ok)).toEqual([]);
  }
});

test("the command fails loudly, naming the file, the line and the word, on a repository that has one", () => {
  const dir = mkdtempSync(join(tmpdir(), "wording-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "samples.json"), `{\n  "authStepName": "${w("Sign", " in")}"\n}\n`);
    writeFileSync(join(dir, "clean.contract"), 'tool authenticate writes "Always refused: authenticating is the person\'s own act."\n');
    const r = spawnSync("bun", [TOOL, dir], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`samples.json:2: "${w("sign", " in")}": the owner's word is "authenticate"`);
    expect(r.stdout).toContain("wording: 1 problems");
    expect(r.stdout).not.toContain("clean.contract");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
