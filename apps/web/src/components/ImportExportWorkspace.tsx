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
    key: "items",
    label: "Item",
    singular: "Item",
    plural: "Items",
    readPermission: "items:read",
    writePermission: "items:write",
    sampleDescription: "Download the supported catalog and pricing columns. Replace or remove the sample item before uploading.",
    exportTitle: "Export the item catalog",
    exportDescription: "Export active and inactive items in the same reviewable format accepted by the importer.",
    exportButton: "Export Items",
    dropLabel: "Drop an item CSV here",
    previewDescription: "Previewing never changes the catalog. SKU and part-number matches make re-imports idempotent; price changes create history records."
  },
  {
    key: "legacy-quotes",
    label: "Quote",
    singular: "Quote",
    plural: "Quotes",
    readPermission: "quotes:read",
    writePermission: "quotes:write",
    sampleDescription: "Download the supported legacy quote summary, relationship, and lifecycle columns. A QMYYNNNN external number is preserved as the Pulse quote number.",
    exportTitle: "Export imported quote summaries",
    exportDescription: "Export active Legacy-mode quotes in the same format accepted by this importer.",
    exportButton: "Export Quote Summaries",
    dropLabel: "Drop a quote summary CSV here",
    previewDescription: "Previewing never changes quotes. Import clients and users first; QMYYNNNN values are preserved and advance future quote numbering, while other external numbers remain idempotent import keys. This 0.1 format imports legacy financial summaries, not Pulse BOM lines or revision files."
  }
] as const satisfies readonly BulkImportWorkspaceConfig[];

export function ImportExportWorkspace() {
  const { user } = useCurrentUser();
  const [importerKey, setImporterKey] = useState<string>(importers[0].key);
  const availableImporters = importers.filter((candidate) => canUser(user, candidate.readPermission));
  const importer = availableImporters.find((candidate) => candidate.key === importerKey) ?? availableImporters[0];

  if (!importer) {
    return <div className="settings-empty">Client, item, or quote viewing access is required to use an importer.</div>;
  }

  return (
    <div className="import-export-workspace">
      <section className="settings-card import-sequence" aria-labelledby="import-sequence-title">
        <div>
          <span className="settings-eyebrow">Initial data load</span>
          <h2 id="import-sequence-title">Import in dependency order</h2>
          <p>Create user accounts first, then preview and apply each CSV. A preview never writes data, and a failed apply rolls back the entire selected batch.</p>
        </div>
        <ol>
          <li><strong>1</strong><span><b>Clients</b><small>Creates client identities and any supplied primary contacts or real sites.</small></span></li>
          <li><strong>2</strong><span><b>Items</b><small>Creates the reusable catalog and its initial price-history records.</small></span></li>
          <li><strong>3</strong><span><b>Quotes</b><small>Resolves imported quote summaries to the clients and users already in Pulse.</small></span></li>
        </ol>
      </section>
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
