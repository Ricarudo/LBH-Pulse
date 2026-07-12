"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  FileDown,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  useMemo,
  useRef,
  useState
} from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { canUser } from "@pulse/contracts/auth";
import type {
  ClientBulkCommitResult,
  ClientBulkFieldDiff,
  ClientBulkPreview,
  ClientBulkPreviewRow,
  ClientBulkRowStatus
} from "@pulse/contracts/client-bulk";

const statusOrder: ClientBulkRowStatus[] = [
  "new",
  "changed",
  "unchanged",
  "conflict",
  "invalid"
];

const statusLabels: Record<ClientBulkRowStatus, string> = {
  new: "New",
  changed: "Changed",
  unchanged: "Unchanged",
  conflict: "Conflicts",
  invalid: "Invalid"
};

const groupOrder: ClientBulkFieldDiff["group"][] = [
  "Client",
  "Primary Contact",
  "Primary Site"
];

function isSelectable(row: ClientBulkPreviewRow) {
  return row.status === "new" || row.status === "changed";
}

async function responseJson<T>(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || fallback);
  }
  return body as T;
}

function DiffValue({
  value,
  emptyLabel
}: {
  value: string;
  emptyLabel: string;
}) {
  return <span>{value || <em>{emptyLabel}</em>}</span>;
}

function RowDiff({
  row,
  showUnchanged
}: {
  row: ClientBulkPreviewRow;
  showUnchanged: boolean;
}) {
  return (
    <div className="client-bulk-row-detail">
      {row.errors.length ? (
        <div className="client-bulk-row-errors" role="alert">
          <AlertTriangle size={17} />
          <div>
            {row.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        </div>
      ) : null}

      {row.candidates.length > 1 || row.status === "conflict" ? (
        <div className="client-bulk-candidates">
          {row.candidates.map((candidate) => (
            <span key={candidate.id}>
              {candidate.clientNumber} · {candidate.displayName}
              {candidate.archived ? " · Archived" : ""}
            </span>
          ))}
        </div>
      ) : null}

      {groupOrder.map((group) => {
        const diffs = row.diffs.filter(
          (diff) => diff.group === group && (showUnchanged || diff.changed)
        );
        if (!diffs.length) return null;
        return (
          <section className="client-bulk-diff-group" key={group}>
            <h4>{group}</h4>
            <div className="client-bulk-diff-table">
              <div className="client-bulk-diff-heading">
                <span>Field</span>
                <span>Current</span>
                <span>Incoming CSV</span>
              </div>
              {diffs.map((diff) => (
                <div
                  className={`client-bulk-diff-line${diff.changed ? " changed" : ""}`}
                  key={diff.field}
                >
                  <strong>{diff.label}</strong>
                  <div className="client-bulk-current-value">
                    <DiffValue value={diff.current} emptyLabel="Not set" />
                  </div>
                  <div className="client-bulk-incoming-value">
                    <DiffValue
                      value={diff.incoming}
                      emptyLabel={row.status === "new" ? "Not set" : "Keep existing"}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ClientBulkWorkspace() {
  const { user } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClientBulkPreview | null>(null);
  const [activeStatus, setActiveStatus] = useState<ClientBulkRowStatus | "all">(
    "all"
  );
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClientBulkCommitResult | null>(null);
  const canImport = canUser(user, "clients:write");

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    return activeStatus === "all"
      ? preview.rows
      : preview.rows.filter((row) => row.status === activeStatus);
  }, [activeStatus, preview]);

  const selectableRows = useMemo(
    () => preview?.rows.filter(isSelectable) ?? [],
    [preview]
  );
  const allValidSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => selectedRows.has(row.rowNumber));

  function acceptFile(nextFile: File | null) {
    setError("");
    setResult(null);
    setPreview(null);
    setSelectedRows(new Set());
    setActiveStatus("all");
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setError("Select a file with the .csv extension.");
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setFile(null);
      setError("Client CSV files may be up to 5 MB.");
      return;
    }
    setFile(nextFile);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function previewFile() {
    if (!file) {
      setError("Select a CSV file first.");
      return;
    }
    try {
      setIsPreviewing(true);
      setError("");
      setResult(null);
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/clients/bulk/preview", {
        method: "POST",
        body: form
      });
      const body = await responseJson<{ preview: ClientBulkPreview }>(
        response,
        "Unable to preview this CSV."
      );
      setPreview(body.preview);
      setSelectedRows(new Set());
    } catch (caught) {
      setPreview(null);
      setError(
        caught instanceof Error ? caught.message : "Unable to preview this CSV."
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  function toggleRow(rowNumber: number) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function toggleAllValid() {
    setSelectedRows(
      allValidSelected
        ? new Set()
        : new Set(selectableRows.map((row) => row.rowNumber))
    );
  }

  async function commitImport() {
    if (!file || !preview || !selectedRows.size) return;
    try {
      setIsCommitting(true);
      setError("");
      const selections = preview.rows
        .filter((row) => selectedRows.has(row.rowNumber))
        .map((row) => ({
          rowNumber: row.rowNumber,
          action: row.status === "new" ? "create" : "update",
          targetClientId: row.targetClientId,
          expectedUpdatedAt: row.expectedUpdatedAt
        }));
      const form = new FormData();
      form.append("file", file);
      form.append("fileDigest", preview.fileDigest);
      form.append("selections", JSON.stringify(selections));
      const response = await fetch("/api/clients/bulk/commit", {
        method: "POST",
        body: form
      });
      const body = await responseJson<{ result: ClientBulkCommitResult }>(
        response,
        "Unable to import the selected clients."
      );
      setResult(body.result);
      setPreview(null);
      setSelectedRows(new Set());
      setConfirmOpen(false);
    } catch (caught) {
      setConfirmOpen(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to import the selected clients."
      );
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div className="client-bulk-workspace">
      <section className="clients-command-bar">
        <div className="clients-command-primary">
          <Link className="toolbar-button compact" href="/clients">
            <ArrowLeft size={16} />
            Clients
          </Link>
          <div>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link href="/hub">Home</Link>
              <span>/</span>
              <Link href="/directory">Directory</Link>
              <span>/</span>
              <Link href="/clients">Clients</Link>
              <span>/</span>
              <span>CSV tools</span>
            </nav>
            <h1>Client CSV import and export</h1>
            <p>Prepare, compare, and apply client directory changes safely.</p>
          </div>
        </div>
      </section>

      <section className="client-bulk-actions" aria-label="CSV downloads">
        <article>
          <div className="client-bulk-action-icon">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h3>Start with the sample</h3>
            <p>
              Download the supported columns and one example row. Replace or
              remove the sample company before uploading.
            </p>
          </div>
          <a className="primary-button" href="/api/clients/bulk/template">
            <Download size={17} />
            Download Sample CSV
          </a>
        </article>
        <article>
          <div className="client-bulk-action-icon">
            <FileDown size={22} />
          </div>
          <div>
            <h3>Export the directory</h3>
            <p>
              Export all active clients with their primary contact and primary
              site.
            </p>
          </div>
          <a className="toolbar-button" href="/api/clients/bulk/export">
            <Download size={17} />
            Export Clients
          </a>
        </article>
      </section>

      <section className="client-bulk-upload-panel">
        <div className="section-heading">
          <div>
            <h3>Upload and review</h3>
            <p>
              Previewing never changes the directory. Blank update cells keep
              their existing values.
            </p>
          </div>
        </div>

        <div
          className={`client-bulk-dropzone${isDragging ? " dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload size={28} />
          <strong>{file ? file.name : "Drop a client CSV here"}</strong>
          <span>
            {file
              ? `${Math.max(1, Math.round(file.size / 1024))} KB selected`
              : "UTF-8 CSV · maximum 5 MB · maximum 2,000 rows"}
          </span>
          <button
            className="toolbar-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose CSV
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
          />
        </div>

        <div className="client-bulk-upload-actions">
          {file ? (
            <button
              className="toolbar-button"
              type="button"
              onClick={() => acceptFile(null)}
              disabled={isPreviewing || isCommitting}
            >
              <X size={16} />
              Clear
            </button>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={!file || isPreviewing || isCommitting}
            onClick={() => void previewFile()}
          >
            {isPreviewing ? <RefreshCw className="spin" size={17} /> : <ChevronRight size={17} />}
            {preview ? "Review Again" : "Review CSV"}
          </button>
        </div>

        {error ? (
          <div className="client-bulk-page-error" role="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      {result ? (
        <section className="client-bulk-result" aria-live="polite">
          <Check size={22} />
          <div>
            <h3>Import completed</h3>
            <p>
              {result.created} created and {result.updated} updated. Batch{" "}
              {result.batchId}.
            </p>
            <div className="client-bulk-result-links">
              {result.clients.map((client) => (
                <Link href={`/clients/${client.id}`} key={client.id}>
                  {client.clientNumber} · {client.displayName}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="client-bulk-review">
          <div className="client-bulk-review-heading">
            <div>
              <h3>Review {preview.fileName}</h3>
              <p>
                Select only the new or changed rows you intend to apply.
                Conflicts and invalid rows must be corrected in the CSV.
              </p>
            </div>
            <label className="client-bulk-show-unchanged">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(event) => setShowUnchanged(event.target.checked)}
              />
              Show unchanged fields
            </label>
          </div>

          <div className="client-bulk-summary" role="tablist" aria-label="Row status">
            <button
              type="button"
              className={activeStatus === "all" ? "active" : ""}
              onClick={() => setActiveStatus("all")}
            >
              <strong>{preview.rows.length}</strong>
              <span>All rows</span>
            </button>
            {statusOrder.map((status) => (
              <button
                type="button"
                className={`${status}${activeStatus === status ? " active" : ""}`}
                key={status}
                onClick={() => setActiveStatus(status)}
              >
                <strong>{preview.summary[status]}</strong>
                <span>{statusLabels[status]}</span>
              </button>
            ))}
          </div>

          <div className="client-bulk-selection-bar">
            <label>
              <input
                type="checkbox"
                checked={allValidSelected}
                onChange={toggleAllValid}
                disabled={!selectableRows.length}
              />
              Select all valid rows
            </label>
            <span>{selectedRows.size} selected</span>
            {canImport ? (
              <button
                className="primary-button"
                type="button"
                disabled={!selectedRows.size || isCommitting}
                onClick={() => setConfirmOpen(true)}
              >
                Apply Selected Rows
              </button>
            ) : (
              <span className="client-bulk-read-only">
                Client management access is required to apply an import.
              </span>
            )}
          </div>

          <div className="client-bulk-rows">
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <details className={`client-bulk-row ${row.status}`} key={row.rowNumber}>
                  <summary>
                    <span
                      className="client-bulk-row-select"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        aria-label={`Select CSV row ${row.rowNumber}`}
                        type="checkbox"
                        checked={selectedRows.has(row.rowNumber)}
                        disabled={!isSelectable(row)}
                        onChange={() => toggleRow(row.rowNumber)}
                      />
                    </span>
                    <span className={`client-bulk-status ${row.status}`}>
                      {statusLabels[row.status]}
                    </span>
                    <span className="client-bulk-row-name">
                      <strong>{row.displayName}</strong>
                      <small>
                        CSV row {row.rowNumber}
                        {row.targetClientNumber
                          ? ` · ${row.targetClientNumber}`
                          : ""}
                        {row.matchedBy.length
                          ? ` · Matched by ${row.matchedBy.join(", ")}`
                          : ""}
                      </small>
                    </span>
                    <ChevronRight className="client-bulk-row-chevron" size={18} />
                  </summary>
                  <RowDiff row={row} showUnchanged={showUnchanged} />
                </details>
              ))
            ) : (
              <p className="client-bulk-empty-filter">No rows in this category.</p>
            )}
          </div>
        </section>
      ) : null}

      {confirmOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="client-bulk-confirm-title"
            aria-modal="true"
            className="client-bulk-confirm-dialog"
            role="dialog"
          >
            <h3 id="client-bulk-confirm-title">Apply this client import?</h3>
            <p>
              {selectedRows.size} selected row
              {selectedRows.size === 1 ? "" : "s"} will be applied together. If
              any row is stale or invalid, nothing will be changed.
            </p>
            <div className="client-bulk-confirm-actions">
              <button
                className="toolbar-button"
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isCommitting}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void commitImport()}
                disabled={isCommitting}
              >
                {isCommitting ? <RefreshCw className="spin" size={17} /> : <Check size={17} />}
                Confirm Import
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
