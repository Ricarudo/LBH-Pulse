"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Hash, Save } from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import type {
  RecordNumberKind,
  RecordNumberSequenceRecord
} from "@pulse/contracts/settings";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { apiFetch } from "@/lib/api/client";
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

const sequenceLabels: Record<RecordNumberKind, string> = {
  request: "Request",
  quote: "Quote",
  project: "Project"
};

async function responseJson<T>(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Unable to load record number sequences."
    );
  }
  return data as T;
}

function nextNumberPreview(
  sequence: RecordNumberSequenceRecord,
  value: string
) {
  const normalized = value.trim().toUpperCase();
  const expectedStart = `${sequence.prefix}${String(sequence.year).padStart(2, "0")}`;
  const match = new RegExp(`^${expectedStart}(\\d{4})$`).exec(normalized);
  if (!match) return null;
  const cursor = Number(match[1]);
  if (cursor >= 9_999) return null;
  return `${expectedStart}${String(cursor + 1).padStart(4, "0")}`;
}

export function ImportExportWorkspace() {
  const { user } = useCurrentUser();
  const [importerKey, setImporterKey] = useState<string>(importers[0].key);
  const [sequences, setSequences] = useState<RecordNumberSequenceRecord[]>([]);
  const [sequenceDrafts, setSequenceDrafts] = useState<Partial<Record<RecordNumberKind, string>>>({});
  const [sequenceMessages, setSequenceMessages] = useState<Partial<Record<RecordNumberKind, string>>>({});
  const [sequenceLoading, setSequenceLoading] = useState(true);
  const [savingSequence, setSavingSequence] = useState<RecordNumberKind | null>(null);
  const availableImporters = importers.filter((candidate) => canUser(user, candidate.readPermission));
  const importer = availableImporters.find((candidate) => candidate.key === importerKey) ?? availableImporters[0];
  const canManageSequences = canUser(user, "settings:write");

  useEffect(() => {
    let active = true;
    async function loadSequences() {
      try {
        const data = await responseJson<{ sequences: RecordNumberSequenceRecord[] }>(
          await apiFetch("/api/settings/record-number-sequences", { cache: "no-store" })
        );
        if (!active) return;
        setSequences(data.sequences);
        setSequenceDrafts(Object.fromEntries(
          data.sequences.map((sequence) => [sequence.kind, sequence.currentNumber])
        ));
      } catch (error) {
        if (active) {
          setSequenceMessages({
            request: error instanceof Error ? error.message : "Unable to load record number sequences."
          });
        }
      } finally {
        if (active) setSequenceLoading(false);
      }
    }
    void loadSequences();
    return () => {
      active = false;
    };
  }, []);

  async function saveSequence(sequence: RecordNumberSequenceRecord) {
    const currentNumber = sequenceDrafts[sequence.kind]?.trim().toUpperCase() ?? "";
    try {
      setSavingSequence(sequence.kind);
      setSequenceMessages((messages) => ({ ...messages, [sequence.kind]: "Saving…" }));
      const data = await responseJson<{ sequence: RecordNumberSequenceRecord }>(
        await apiFetch(`/api/settings/record-number-sequences/${sequence.kind}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentNumber,
            expectedUpdatedAt: sequence.updatedAt
          })
        })
      );
      setSequences((items) => items.map((item) =>
        item.kind === data.sequence.kind ? data.sequence : item
      ));
      setSequenceDrafts((drafts) => ({
        ...drafts,
        [data.sequence.kind]: data.sequence.currentNumber
      }));
      setSequenceMessages((messages) => ({
        ...messages,
        [data.sequence.kind]: `Saved. The next ${sequence.kind} will be ${data.sequence.nextNumber ?? "unavailable"}.`
      }));
    } catch (error) {
      setSequenceMessages((messages) => ({
        ...messages,
        [sequence.kind]: error instanceof Error ? error.message : "Unable to save this sequence."
      }));
    } finally {
      setSavingSequence(null);
    }
  }

  return (
    <div className="import-export-workspace">
      <section className="settings-card record-number-sequences" aria-labelledby="record-number-sequences-title">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><Hash size={20} /></div>
          <div>
            <h2 id="record-number-sequences-title">Record number sequences</h2>
            <p>Review or change the current-year cursor before importing data. The next generated number is one higher.</p>
          </div>
        </div>
        {sequenceLoading ? (
          <p className="settings-inline-message" aria-live="polite">Loading record number sequences…</p>
        ) : sequences.length ? (
          <div className="record-number-sequence-grid">
            {sequences.map((sequence) => {
              const draft = sequenceDrafts[sequence.kind] ?? sequence.currentNumber;
              const preview = nextNumberPreview(sequence, draft);
              const valid = preview !== null || draft.trim().toUpperCase() === `${sequence.prefix}${String(sequence.year).padStart(2, "0")}9999`;
              const dirty = draft.trim().toUpperCase() !== sequence.currentNumber;
              return (
                <form
                  className="record-number-sequence-control"
                  key={sequence.kind}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveSequence(sequence);
                  }}
                >
                  <label>
                    <span>{sequenceLabels[sequence.kind]} cursor</span>
                    <input
                      aria-describedby={`${sequence.kind}-sequence-help`}
                      disabled={!canManageSequences || savingSequence === sequence.kind}
                      inputMode="text"
                      maxLength={8}
                      pattern={`${sequence.prefix}${String(sequence.year).padStart(2, "0")}\\d{4}`}
                      value={draft}
                      onChange={(event) => {
                        setSequenceDrafts((drafts) => ({
                          ...drafts,
                          [sequence.kind]: event.target.value.toUpperCase()
                        }));
                        setSequenceMessages((messages) => ({
                          ...messages,
                          [sequence.kind]: ""
                        }));
                      }}
                    />
                  </label>
                  <p id={`${sequence.kind}-sequence-help`} className="record-number-sequence-next">
                    {preview
                      ? <>Next: <strong>{preview}</strong></>
                      : valid
                        ? <strong>Sequence exhausted at 9999</strong>
                        : <>Use {sequence.prefix}{String(sequence.year).padStart(2, "0")} followed by four digits.</>}
                  </p>
                  <button
                    className="primary-button compact"
                    type="submit"
                    disabled={!canManageSequences || !dirty || !valid || savingSequence !== null}
                  >
                    <Save size={15} />
                    {savingSequence === sequence.kind ? "Saving…" : "Save"}
                  </button>
                  <p className="settings-inline-message" role="status" aria-live="polite">
                    {sequenceMessages[sequence.kind] ?? ""}
                  </p>
                </form>
              );
            })}
          </div>
        ) : (
          <p className="settings-inline-message" role="status" aria-live="polite">
            {sequenceMessages.request || "Record number sequences are unavailable."}
          </p>
        )}
        {!canManageSequences && !sequenceLoading ? (
          <p className="settings-callout">Workspace management access is required to change a sequence.</p>
        ) : null}
      </section>
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
      {importer ? <section className="settings-card import-export-selector" aria-labelledby="importer-selector-title">
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
      </section> : (
        <div className="settings-empty">Client, item, or quote viewing access is required to use an importer.</div>
      )}
      {importer ? <ClientBulkWorkspace key={importer.key} config={importer} /> : null}
    </div>
  );
}
