"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  ClientBulkWorkspace,
  type BulkImportWorkspaceConfig
} from "@/modules/clients/ClientBulkWorkspace";

const importers = [
  {
    key: "clients",
    label: "Client",
    singular: "Client",
    plural: "Clients",
    readPermission: "clients:read",
    writePermission: "clients:write",
    sampleDescription: "Download the supported columns and one example row. Replace or remove the sample company before uploading.",
    exportTitle: "Export the directory",
    exportDescription: "Export all active clients with their primary contact and primary site.",
    exportButton: "Export Clients",
    dropLabel: "Drop a client CSV here",
    previewDescription: "Previewing never changes the directory. Blank update cells keep their existing values."
  },
  {
    key: "legacy-quotes",
    label: "Legacy quote",
    singular: "Legacy quote",
    plural: "Legacy quotes",
    readPermission: "quotes:read",
    writePermission: "quotes:write",
    sampleDescription: "Download the supported legacy financial, relationship, and lifecycle columns. Replace or remove the sample quote before uploading.",
    exportTitle: "Export legacy quotes",
    exportDescription: "Export active Legacy Quotes in the same format accepted by this importer.",
    exportButton: "Export Legacy Quotes",
    dropLabel: "Drop a legacy quote CSV here",
    previewDescription: "Previewing never changes quotes. External quote numbers identify prior imports, and blank update cells keep existing values."
  }
] as const satisfies readonly BulkImportWorkspaceConfig[];

export function ImportExportWorkspace() {
  const { user } = useCurrentUser();
  const [importerKey, setImporterKey] = useState<string>(importers[0].key);
  const availableImporters = importers.filter((candidate) => canUser(user, candidate.readPermission));
  const importer = availableImporters.find((candidate) => candidate.key === importerKey) ?? availableImporters[0];

  if (!importer) {
    return <div className="settings-empty">Client or quote viewing access is required to use an importer.</div>;
  }

  return (
    <div className="import-export-workspace">
      <section className="settings-card import-export-selector" aria-labelledby="importer-selector-title">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><FileSpreadsheet size={20} /></div>
          <div>
            <h2 id="importer-selector-title">Choose importer</h2>
            <p>Select the record type and use its matching CSV template.</p>
          </div>
        </div>
        <label>
          <span>Importer</span>
          <select value={importer.key} onChange={(event) => setImporterKey(event.target.value)}>
            {availableImporters.map((candidate) => <option value={candidate.key} key={candidate.key}>{candidate.label} importer</option>)}
          </select>
        </label>
      </section>
      <ClientBulkWorkspace key={importer.key} config={importer} />
    </div>
  );
}
