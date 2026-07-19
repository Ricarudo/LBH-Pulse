import {
  clientCsvTemplate,
  commitClientBulkCsv,
  exportClientCsv,
  previewClientBulkCsv
} from "@/lib/services/clientBulkService";
import type { BulkImporter } from "@/lib/importers/types";

export const clientImporter: BulkImporter = {
  key: "clients",
  readPermission: "clients:read",
  writePermission: "clients:write",
  templateFileName: "pulse-client-import-template.csv",
  exportFileName: (date) => `pulse-clients-${date}.csv`,
  template: clientCsvTemplate,
  export: exportClientCsv,
  preview: async (file) => {
    const preview = await previewClientBulkCsv(file);
    return {
      ...preview,
      rows: preview.rows.map((row) => ({
        ...row,
        targetId: row.targetClientId,
        targetNumber: row.targetClientNumber,
        candidates: row.candidates.map((candidate) => ({
          id: candidate.id,
          recordNumber: candidate.clientNumber,
          displayName: candidate.displayName,
          archived: candidate.archived
        }))
      }))
    };
  },
  commit: async (file, fileDigest, selections, user) => {
    const result = await commitClientBulkCsv(
      file,
      fileDigest,
      selections.map((selection) => ({
        rowNumber: selection.rowNumber,
        action: selection.action,
        targetClientId: selection.targetId,
        expectedUpdatedAt: selection.expectedUpdatedAt
      })),
      user
    );
    return {
      batchId: result.batchId,
      created: result.created,
      updated: result.updated,
      records: result.clients.map((client) => ({
        id: client.id,
        recordNumber: client.clientNumber,
        displayName: client.displayName,
        action: client.action,
        href: `/clients/${client.id}`
      }))
    };
  }
};
