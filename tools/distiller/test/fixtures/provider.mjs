// A test provider: one organisation that owns example.test, and a door that is not live yet.
export default {
  name: "test-provider",
  async authenticate(session) { return session?.token === "good" ? { entityId: "org-1" } : null; },
  async ownsDomain(entity, domain) {
    if (domain === "pending.test") return { ok: false, stub: true, willCheck: "the provider's domain validation" };
    return domain === "example.test" || domain === "127.0.0.1" ? { ok: true } : { ok: false, why: "not this organisation's" };
  },
  async moveGuestDraft(draftId, entity) { return { draftId, entityId: entity.entityId, moved: true }; },
};
