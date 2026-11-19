// Loads a brand config. Paths in it (guide.root, nativeSource[].root, ownership.provider) are relative to the
// config file, so a brand keeps its config beside its own sources.
import { readFileSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";

export function loadConfig(path) {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  const base = dirname(resolve(path));
  const abs = p => (p && !isAbsolute(p) ? resolve(base, p) : p);
  if (cfg.guide) cfg.guide.root = abs(cfg.guide.root);
  for (const n of cfg.nativeSource ?? []) n.root = abs(n.root);
  if (cfg.ownership?.provider) cfg.ownership.provider = abs(cfg.ownership.provider);
  cfg.$path = resolve(path);
  return cfg;
}
