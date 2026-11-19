// No words in a package: every word a person reads is a prop. In
// packages/*/*.contract, outside comments, a `text`, `aria-label`,
// `placeholder` or `title` written as a literal, or as a template whose fixed
// parts hold letters, fails.
//
//   bun tools/words.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const problems = [];

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
