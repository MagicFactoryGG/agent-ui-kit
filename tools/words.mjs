// Two rules about words, for this repository:
//
// 1. Nothing of one company in any file: the repo fails on a company's name,
//    a brand's part, a product's name, a decision record's number and a
//    ruling's citation, as BANNED below spells them (built from pieces, so
//    this file passes its own check).
// 2. No words in a package: every word a person reads is a prop. In
//    packages/*/*.contract, outside comments, a `text`, `aria-label`,
//    `placeholder` or `title` written as a literal, or as a template whose
//    fixed parts hold letters, fails.
//
//   bun tools/words.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SKIP = new Set([".git", "node_modules", "target", ".exact", "dist", ".vscode", ".recipes"]);
// Built so this file does not hold the words it looks for.
const BANNED = [
  [new RegExp(["co", "mms"].join(""), "i"), "a company name"],
  [new RegExp(["pr", "ism"].join(""), "i"), "a brand's part"],
  [new RegExp(`\\b${["I", "AS"].join("")}\\b`), "a product's name"],
  [new RegExp(["AD", "R-"].join("")), "a decision record's number"],
  [new RegExp(["own", "er,"].join("")), "a ruling's citation"],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith("dist.")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const problems = [];
for (const path of files(ROOT)) {
  if (/\.(png|jpg|lock|lockb|a|wasm)$/.test(path) || path.endsWith("bun.lock")) continue;
  const text = readFileSync(path, "utf8");
  text.split("\n").forEach((line, i) => {
    for (const [re, what] of BANNED) if (re.test(line)) problems.push(`${relative(ROOT, path)}:${i + 1}: ${what}: ${line.trim().slice(0, 100)}`);
  });
}

/** A line without its comment (a `//` outside a string). */
function uncommented(line) {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote && line[i - 1] !== "\\") quote = "";
    } else if (c === '"' || c === "`") quote = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

const pkgs = resolve(ROOT, "packages");
for (const pkg of readdirSync(pkgs)) {
  for (const f of readdirSync(join(pkgs, pkg)).filter((f) => f.endsWith(".contract"))) {
    readFileSync(join(pkgs, pkg, f), "utf8").split("\n").forEach((raw, i) => {
      const line = uncommented(raw);
      const at = `packages/${pkg}/${f}:${i + 1}`;
      const literal = /^\s*text\s+"([^"]*[A-Za-z][^"]*)"/.exec(line) ?? /(?:aria-label|placeholder|title)="([^"]*[A-Za-z][^"]*)"/.exec(line);
      if (literal) problems.push(`${at}: words in a package: "${literal[1]}"`);
      for (const m of line.matchAll(/(?:^\s*text\s+|(?:aria-label|placeholder|title)=)`([^`]*)`/g)) {
        const fixed = m[1].replace(/\$\{[^}]*\}/g, "");
        if (/[A-Za-z]/.test(fixed)) problems.push(`${at}: words in a package: \`${m[1]}\``);
      }
    });
  }
}

for (const p of problems) console.log(`words: ${p}`);
console.log(`words: ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
