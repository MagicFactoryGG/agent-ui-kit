import { test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { checkOwnership, storeAppNamed, apply } from "../lib/doors.mjs";

const provider = join(import.meta.dir, "fixtures/provider.mjs");
let server, origin;
beforeAll(() => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/.well-known/apple-app-site-association") return Response.json({ applinks: { details: [{ appIDs: ["ABCDE12345.test.app"] }] }, appclips: { apps: ["ABCDE12345.test.app.Clip"] } });
    if (p === "/.well-known/assetlinks.json") return Response.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "test.app", sha256_cert_fingerprints: ["AA:BB"] } }]);
    return new Response("no", { status: 404 });
  } });
  origin = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop());
const refusal = p => p.then(() => "allowed", e => (e.refused ? e.message : Promise.reject(e)));

test("a guest designs from scratch, with no sources", async () => {
  expect((await checkOwnership({ brand: "x" })).mode).toBe("guest");
});
test("a guest cannot point the Distiller at a website", async () => {
  expect(await refusal(checkOwnership({ web: [{ id: "a", pages: ["https://example.test/"] }] }))).toContain("guest draft");
});
test("a provider must authenticate the person", async () => {
  expect(await refusal(checkOwnership({ ownership: { mode: "provider", provider, domains: ["example.test"], session: { token: "bad" } }, web: [{ id: "a", pages: ["https://example.test/"] }] }))).toContain("not authenticated");
});
test("a source off the owned domains is refused", async () => {
  expect(await refusal(checkOwnership({ ownership: { mode: "provider", provider, domains: ["example.test"], session: { token: "good" } }, web: [{ id: "a", pages: ["https://other.test/"] }] }))).toContain("not on an owned domain");
});
test("a door that is not live yet refuses and says what it will check", async () => {
  expect(await refusal(checkOwnership({ ownership: { mode: "provider", provider, domains: ["pending.test"], session: { token: "good" } }, web: [{ id: "a", pages: ["https://pending.test/"] }] }))).toContain("not live yet");
});
test("a proven organisation passes, and its guest draft moves", async () => {
  const r = await checkOwnership({ ownership: { mode: "provider", provider, domains: ["example.test"], session: { token: "good" }, guestDraft: "d-1" }, web: [{ id: "a", pages: ["https://www.example.test/"] }] });
  expect(r.checks.map(c => c.door)).toEqual(["domain", "draft-move"]);
});
test("a store app must be named by an owned domain's association file", async () => {
  const cfg = app => ({ ownership: { mode: "provider", provider, domains: ["127.0.0.1"], session: { token: "good" } }, storeApps: [app] });
  expect((await checkOwnership(cfg({ platform: "ios", appId: "ABCDE12345.test.app.Clip", domain: "127.0.0.1" }), { storeOrigin: origin })).checks.at(-1).door).toBe("store-app");
  expect(await refusal(checkOwnership(cfg({ platform: "ios", appId: "ABCDE12345.other", domain: "127.0.0.1" }), { storeOrigin: origin }))).toContain("does not name it");
  expect((await storeAppNamed("127.0.0.1", { platform: "android", appId: "test.app", sha256: "AA:BB" }, { origin })).ok).toBe(true);
  expect((await storeAppNamed("127.0.0.1", { platform: "android", appId: "test.app", sha256: "CC:DD" }, { origin })).ok).toBe(false);
});
test("apply always needs the owner", () => {
  expect(() => apply()).toThrow("needs the brand's owner");
});
