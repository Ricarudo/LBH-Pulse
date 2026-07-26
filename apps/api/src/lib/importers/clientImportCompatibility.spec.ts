import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legacyClientCommit, legacyClientPreview } from "@/lib/importers/clientImportCompatibility";

describe("legacy client import compatibility adapter", () => {
  it("maps canonical preview identities without changing import decisions", () => {
    const preview = legacyClientPreview({
      fileName: "clients.csv",
      fileDigest: "digest",
      summary: { new: 0, changed: 1, unchanged: 0, conflict: 0, invalid: 0 },
      rows: [{
        rowNumber: 2,
        status: "changed",
        displayName: "Example",
        targetId: "client-1",
        targetNumber: "CL-1",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        matchedBy: ["client_number"],
        errors: [],
        candidates: [{ id: "client-1", recordNumber: "CL-1", displayName: "Example", archived: false }],
        diffs: []
      }]
    });
    assert.equal(preview.rows[0].targetClientId, "client-1");
    assert.equal(preview.rows[0].candidates[0].clientNumber, "CL-1");
  });

  it("maps canonical commit results to the deprecated response contract", () => {
    const result = legacyClientCommit({
      batchId: "batch-1",
      created: 1,
      updated: 0,
      records: [{ id: "client-1", recordNumber: "CL-1", displayName: "Example", action: "created", href: "/clients/client-1" }]
    });
    assert.deepEqual(result.clients[0], {
      id: "client-1",
      clientNumber: "CL-1",
      displayName: "Example",
      action: "created"
    });
  });
});
