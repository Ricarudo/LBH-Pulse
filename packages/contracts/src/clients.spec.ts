import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientHistoryQuerySchema,
  createClientActivitySchema,
  mergeClientsSchema,
  previewClientMergeSchema,
  updateClientSchema
} from "./clients";

const validMerge = {
  clientIds: ["client-a", "client-b"],
  masterId: "client-a",
  globalDisplayName: "Acme Global",
  primaryContactId: "contact-a",
  primarySiteId: "site-a",
  expectedUpdatedAt: {
    "client-a": "2026-07-30T12:00:00.000Z",
    "client-b": "2026-07-30T12:01:00.000Z"
  }
};

describe("client consolidation contracts", () => {
  it("accepts a reviewed two-client merge", () => {
    assert.deepEqual(mergeClientsSchema.parse(validMerge), validMerge);
    assert.equal(previewClientMergeSchema.safeParse(validMerge).success, true);
  });

  it("requires distinct clients and a selected master", () => {
    assert.equal(
      mergeClientsSchema.safeParse({
        ...validMerge,
        clientIds: ["client-a", "client-a"]
      }).success,
      false
    );
    assert.equal(
      mergeClientsSchema.safeParse({
        ...validMerge,
        masterId: "client-c"
      }).success,
      false
    );
  });

  it("rejects unsafe names and stale timestamp shapes", () => {
    assert.equal(
      mergeClientsSchema.safeParse({
        ...validMerge,
        globalDisplayName: "<script>",
        expectedUpdatedAt: { "client-a": "yesterday", "client-b": "today" }
      }).success,
      false
    );
  });

  it("accepts normalized alternative names during client editing", () => {
    const parsed = updateClientSchema.parse({
      aliases: [" Acme PR ", "Acme Caribbean"]
    });
    assert.deepEqual(parsed.aliases, ["Acme PR", "Acme Caribbean"]);
  });

  it("accepts manual aliases and rejects ambiguous alias payloads", () => {
    const parsed = updateClientSchema.parse({
      manualAliases: [" Acme PR ", "Acme Caribbean"]
    });
    assert.deepEqual(parsed.manualAliases, ["Acme PR", "Acme Caribbean"]);
    assert.equal(
      updateClientSchema.safeParse({
        aliases: ["Legacy"],
        manualAliases: ["Manual"]
      }).success,
      false
    );
  });

  it("validates focused activity creation and bounded history queries", () => {
    assert.deepEqual(
      createClientActivitySchema.parse({
        type: "Meeting",
        title: " Quarterly review ",
        detail: " Discussed delivery priorities. "
      }),
      {
        type: "Meeting",
        title: "Quarterly review",
        detail: "Discussed delivery priorities.",
        actor: "Alex Morgan"
      }
    );
    assert.equal(
      createClientActivitySchema.safeParse({
        type: "Import",
        title: "Unsupported user activity"
      }).success,
      false
    );
    assert.deepEqual(
      clientHistoryQuerySchema.parse({
        q: " owner ",
        type: "Client",
        from: "2026-01-01",
        to: "2026-07-30",
        take: "20"
      }),
      {
        q: "owner",
        type: "Client",
        from: "2026-01-01",
        to: "2026-07-30",
        take: 20
      }
    );
    assert.equal(
      clientHistoryQuerySchema.safeParse({
        from: "2026-08-01",
        to: "2026-07-30"
      }).success,
      false
    );
  });
});
