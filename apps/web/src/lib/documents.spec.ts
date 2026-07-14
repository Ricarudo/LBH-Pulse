import assert from "node:assert/strict";
import test from "node:test";
import type { LifecycleDocumentRecord } from "@pulse/contracts/documents";
import { filterLifecycleDocuments } from "@/lib/documents";

function document(
  id: string,
  originalFileName: string,
  category: string,
  tags: string[]
): LifecycleDocumentRecord {
  return {
    id,
    sourceType: "Request",
    sourceId: "request-1",
    sourceNumber: "RQ-1001",
    inherited: false,
    canDelete: true,
    originalFileName,
    mediaType: "image/jpeg",
    byteSize: 100,
    category,
    tags,
    scanStatus: "Clean",
    available: true,
    uploadedByName: "Pat Rivera",
    createdAt: "2026-07-13T12:00:00.000Z",
    downloadUrl: "/download",
    previewUrl: "/preview"
  };
}

test("document search matches purpose tags, names, categories, and multiple terms", () => {
  const documents = [
    document("before", "north-wall.jpg", "Site Photo", ["Existing Condition"]),
    document("after", "north-wall-finished.jpg", "Site Photo", ["Completed Work"]),
    document("plans", "level-one.pdf", "Drawing", ["Reference"])
  ];

  assert.deepEqual(filterLifecycleDocuments(documents, "existing").map(({ id }) => id), ["before"]);
  assert.deepEqual(filterLifecycleDocuments(documents, "north completed").map(({ id }) => id), ["after"]);
  assert.deepEqual(filterLifecycleDocuments(documents, "drawing").map(({ id }) => id), ["plans"]);
  assert.equal(filterLifecycleDocuments(documents, "").length, 3);
});
