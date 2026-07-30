import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
});
