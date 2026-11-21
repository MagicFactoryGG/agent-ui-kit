// The owner's words (8 and 10 Nov 2026): a person "authenticates" and "ends the
// session". No file of this repository (samples, tools, tool names and titles,
// copy, tests, notes) names those acts any other way: the other phrasings of
// going in and coming out, in any case, spaced, hyphenated, underscored, joined
// or camelCase, and their -s, -ed and -ing forms, fail loudly with the file,
// the line and the word to use. There is no exception list: a file that must
// show such a phrase (this tool's test) builds it at run time.
//
//   bun tools/wording.mjs [dir]   (default: this repository; every tracked or new file)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const RULE = /\b(sign|log)(?:s|ed|ged|ing|ging)?[ \t_-]?(in|out)\b/g;

/** Each phrase on one line that the rule refuses: what it says, and the owner's word for it. */
export function findings(line) {
  const words = line.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").toLowerCase();
  return [...words.matchAll(RULE)].map((m) => ({ said: m[0], use: m[2] === "in" ? "authenticate" : "end session" }));
}

/** Every refusal in the text files under root that git tracks or would add. */
export function check(root) {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const problems = [];
  for (const f of [...new Set(files)]) {
    let text;
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    if (text.includes("\0")) continue; // binary
    text.split("\n").forEach((line, i) => {
      for (const { said, use } of findings(line)) problems.push(`${f}:${i + 1}: "${said}": the owner's word is "${use}"`);
    });
  }
  return problems;
}

if (import.meta.main) {
  const problems = check(resolve(process.argv[2] ?? ROOT));
  for (const p of problems) console.log(`wording: ${p}`);
  console.log(`wording: ${problems.length} problems`);
  process.exit(problems.length ? 1 : 0);
}
