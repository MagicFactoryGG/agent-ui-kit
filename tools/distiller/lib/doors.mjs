// The doors: who may point the Distiller at which sources. Every collecting step runs assertOwnership first.
//
// A brand config's `ownership.mode`:
//   guest        not authenticated: no sources at all; the work is a draft designed from scratch.
//   provider     a plug-in module (`ownership.provider`, a path) proves who the person is and what their
//                organisation owns. It exports default { name, authenticate(session), ownsDomain(entity, domain),
//                moveGuestDraft?(draftId, entity) }. ownsDomain answers { ok, why?, stub?, willCheck? }.
//   first-party  the operator's own brand: every domain must be in the file named by DISTILLER_FIRST_PARTY.
//   dns-txt      each domain (or _distiller.<domain>) has a TXT record "distiller=<ownership.token>".
//
// Store apps (`storeApps[]`): an owned domain must name the app in its apple-app-site-association (iOS) or
// assetlinks.json (Android). Applying a Theme is never the Distiller's: apply() always refuses.
import { resolveTxt } from "node:dns/promises";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const hostOf = u => new URL(u).hostname;
const under = (host, domain) => host === domain || host.endsWith(`.${domain}`);
export const refuse = (why, todo) => {
  const e = new Error(`REFUSED by the Distiller's ownership doors: ${why}${todo ? ` ${todo}` : ""}`);
  e.refused = true;
  throw e;
};

/** True when <origin>/.well-known/<file> names the app. iOS appId is "<TeamID>.<bundleId>"; Android is the
 *  package name, with its signing certificate fingerprint when sha256 is given. origin defaults to https://<domain>. */
export async function storeAppNamed(domain, { platform, appId, sha256 }, { origin } = {}) {
  const file = platform === "ios" ? "apple-app-site-association" : "assetlinks.json";
  const url = `${origin ?? `https://${domain}`}/.well-known/${file}`;
  let body;
  try {
    const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { ok: false, url, why: `HTTP ${r.status}` };
    body = await r.json();
  } catch (e) { return { ok: false, url, why: `not JSON or not reachable (${e.name})` }; }
  if (platform === "ios") {
    const ids = new Set();
    const walk = v => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v)) {
        if ((k === "appID" || k === "appIDs" || k === "apps") && x) [].concat(x).forEach(i => typeof i === "string" && ids.add(i));
        walk(x);
      }
    };
    walk(body);
    return { ok: ids.has(appId), url, named: [...ids] };
  }
  const targets = (Array.isArray(body) ? body : []).map(s => s.target).filter(t => t?.namespace === "android_app");
  const hit = targets.find(t => t.package_name === appId && (!sha256 || (t.sha256_cert_fingerprints ?? []).includes(sha256)));
  return { ok: !!hit, url, named: targets.map(t => t.package_name) };
}

/** Applying a Theme to an app always needs the brand's owner. The Distiller proposes; it never applies. */
export function apply() { refuse("applying a Theme needs the brand's owner.", "Send the proposal to the owner."); }

async function loadProvider(path) {
  if (!path) refuse("ownership.mode is provider, but ownership.provider names no module.");
  const mod = await import(pathToFileURL(path).href);
  const p = mod.default ?? mod;
  for (const fn of ["authenticate", "ownsDomain"]) if (typeof p[fn] !== "function") refuse(`the provider ${path} has no ${fn}().`);
  return p;
}

/** Throws a refusal (e.refused) or returns what was proven. opts.storeOrigin: a test origin for store-app files. */
export async function checkOwnership(cfg, opts = {}) {
  const own = cfg.ownership ?? { mode: "guest" };
  const urls = (cfg.web ?? []).flatMap(p => p.pages);
  const apps = cfg.storeApps ?? [];
  const sources = urls.length + apps.length + (cfg.native ?? []).length + (cfg.nativeSource ?? []).length;
  if (own.mode === "guest") {
    if (sources) refuse("a guest draft cannot point the Distiller at websites, web apps or store apps.", "Authenticate first; the guest draft then moves into your organisation's playground.");
    return { mode: "guest", checks: [] };
  }
  if (!own.domains?.length) refuse("the config names no owned domains (ownership.domains).");
  for (const u of urls) if (!own.domains.some(d => under(hostOf(u), d))) refuse(`${u} is not on an owned domain.`, "Add the domain and prove it, or drop the source.");
  for (const a of apps) if (!own.domains.some(d => under(a.domain, d))) refuse(`store app ${a.appId}: ${a.domain} is not an owned domain.`);
  const checks = [];
  if (own.mode === "provider") {
    const p = await loadProvider(own.provider);
    const entity = await p.authenticate(own.session);
    if (!entity?.entityId) refuse(`${p.name}: the person is not authenticated.`, "Authenticate first.");
    for (const d of own.domains) {
      const r = await p.ownsDomain(entity, d);
      if (!r?.ok) refuse(`${p.name}: ${d} is not proven${r?.stub ? " (this door is not live yet)" : ""}: ${r?.why ?? r?.willCheck ?? "no answer"}.`);
      checks.push({ door: "domain", provider: p.name, domain: d });
    }
    if (own.guestDraft && p.moveGuestDraft) checks.push({ door: "draft-move", ...(await p.moveGuestDraft(own.guestDraft, entity)) });
  } else if (own.mode === "first-party") {
    const f = process.env.DISTILLER_FIRST_PARTY;
    const list = f && existsSync(f) ? readFileSync(f, "utf8").split(/\s+/).filter(Boolean) : [];
    for (const d of own.domains) if (!list.includes(d)) refuse(`${d} is not in the operator's first-party list (DISTILLER_FIRST_PARTY).`);
    checks.push({ door: "first-party", domains: own.domains });
  } else if (own.mode === "dns-txt") {
    for (const d of own.domains) {
      const recs = [];
      for (const name of [d, `_distiller.${d}`]) recs.push(...(await resolveTxt(name).catch(() => [])).map(r => r.join("")));
      if (!own.token || !recs.includes(`distiller=${own.token}`)) refuse(`${d} has no TXT record distiller=<token>.`);
      checks.push({ door: "dns-txt", domain: d });
    }
  } else refuse(`unknown ownership mode "${own.mode}".`);
  for (const a of apps) {
    const r = await storeAppNamed(a.domain, a, { origin: opts.storeOrigin });
    if (!r.ok) refuse(`store app ${a.appId}: ${r.url} does not name it (${r.why ?? `names ${r.named?.join(", ") || "nothing"}`}).`);
    checks.push({ door: "store-app", appId: a.appId, url: r.url });
  }
  return { mode: own.mode, checks };
}

/** For command-line steps: prints a refusal and exits 3. */
export async function assertOwnership(cfg, opts) {
  try { return await checkOwnership(cfg, opts); }
  catch (e) { if (e.refused) { console.error(e.message); process.exit(3); } throw e; }
}
