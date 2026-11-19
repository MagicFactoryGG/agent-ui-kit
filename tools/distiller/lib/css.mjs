// Small CSS walker shared by the guide and native-source steps: strips comments (keeps line numbers) and
// calls onDecl for each declaration with its selector, the at-rule context and file:line.
export function walkCss(text, file, onDecl) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const stack = [];
  let buf = "", line = 1, bufLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\n") line++;
    if (ch === "{") { stack.push(buf.trim()); buf = ""; bufLine = line; continue; }
    if (ch === "}" || ch === ";") {
      const d = buf.trim();
      const m = d.match(/^(--[\w-]+|[a-z-]+)\s*:\s*([\s\S]+)$/i);
      if (m && stack.length) onDecl({ selector: stack.at(-1), context: stack.slice(0, -1), prop: m[1], value: m[2].trim(), at: `${file}:${bufLine}` });
      buf = ""; bufLine = line;
      if (ch === "}") stack.pop();
      continue;
    }
    if (!buf.trim()) bufLine = line;
    buf += ch;
  }
}
/** "light" | "dark" | null for a declaration's selector + context, given the brand's dark selector. */
export function schemeOf(d, darkSel = ".dark") {
  const inDarkMedia = d.context.some(c => /prefers-color-scheme:\s*dark/.test(c));
  const sel = d.selector;
  if (sel === darkSel || sel === `:root${darkSel}` || ((sel === ":root" || sel === "html") && inDarkMedia)) return "dark";
  if (sel === ":root" || sel === "html") return "light";
  return null;
}
