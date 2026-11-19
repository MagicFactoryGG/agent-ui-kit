// The reference-set flags shared by analyse.mjs, harmonise.mjs and distill.mjs.
export function harmoniseArgs(argv) {
  const at = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const ref = at("--reference");
  const g = at("--guide");
  if (g && g !== "on" && g !== "off") throw new Error("--guide takes on or off");
  return { reference: ref ? ref.split(",").map(s => s.trim()).filter(Boolean) : null, useGuide: g !== "off", save: at("--save"), json: argv.includes("--json") };
}
