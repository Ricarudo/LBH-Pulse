import type { BulkImportCommitResult, BulkImportPreview } from "@pulse/contracts/bulk-import";
import type {
  ClientBulkCommitResult,
  ClientBulkCsvHeader,
  ClientBulkFieldDiff,
  ClientBulkPreview
} from "@pulse/contracts/client-bulk";

/**
 * Pulse 0.1 response-only adapter for /clients/bulk/*.
 * Removal criteria: remove after one compatibility release once access logs and
 * operator confirmation show no clients use the deprecated route.
 */
export function legacyClientPreview(preview: BulkImportPreview): ClientBulkPreview {
  return {
    ...preview,
    rows: preview.rows.map((row) => ({
      ...row,
      targetClientId: row.targetId,
      targetClientNumber: row.targetNumber,
      candidates: row.candidates.map((candidate) => ({
        id: candidate.id,
        clientNumber: candidate.recordNumber,
        displayName: candidate.displayName,
        archived: candidate.archived
      })),
      diffs: row.diffs.map((diff) => ({
        ...diff,
        field: diff.field as ClientBulkCsvHeader,
        group: diff.group as ClientBulkFieldDiff["group"]
      }))
    }))
  };
}

export function legacyClientCommit(result: BulkImportCommitResult): ClientBulkCommitResult {
  return {
    batchId: result.batchId,
    created: result.created,
    updated: result.updated,
    clients: result.records.map((record) => ({
      id: record.id,
      clientNumber: record.recordNumber,
      displayName: record.displayName,
      action: record.action
    }))
  };
}
