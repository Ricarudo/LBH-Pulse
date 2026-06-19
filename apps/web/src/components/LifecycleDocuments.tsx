"use client";

import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  projectDocumentCategories,
  quoteDocumentCategories,
  requestDocumentCategories,
  type LifecycleDocumentRecord
} from "@/types/document";

type Stage = "request" | "quote" | "project";

type Props = {
  stage: Stage;
  recordId: string;
  documents: LifecycleDocumentRecord[];
  canWrite: boolean;
  onChange: (documents: LifecycleDocumentRecord[]) => void;
};

function formatBytes(bytes: number) {
  if (!bytes) return "Legacy metadata";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function categories(stage: Stage) {
  if (stage === "request") return requestDocumentCategories;
  if (stage === "quote") return quoteDocumentCategories;
  return projectDocumentCategories;
}

function endpoint(stage: Stage, id: string) {
  return `/api/${stage === "request" ? "requests" : stage === "quote" ? "quotes" : "projects"}/${id}/documents`;
}

export function LifecycleDocuments({
  stage,
  recordId,
  documents,
  canWrite,
  onChange
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("Other");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const groups = useMemo(
    () => [
      { label: "Added here", items: documents.filter((document) => !document.inherited) },
      {
        label: "From Request",
        items: documents.filter((document) => document.inherited && document.sourceType === "Request")
      },
      {
        label: "From Quote",
        items: documents.filter((document) => document.inherited && document.sourceType === "Quote")
      }
    ].filter((group) => group.items.length),
    [documents]
  );

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("category", category);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint(stage, recordId));
    xhr.withCredentials = true;
    setMessage("Validating and scanning file...");
    setProgress(0);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      const data = JSON.parse(xhr.responseText || "{}") as {
        document?: LifecycleDocumentRecord;
        error?: string;
      };
      if (xhr.status >= 200 && xhr.status < 300 && data.document) {
        onChange([data.document, ...documents]);
        setMessage(`${data.document.originalFileName} passed inspection and was stored.`);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setMessage(data.error || "Upload failed.");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setMessage("Upload failed before the server could inspect the file.");
    };
    xhr.send(form);
  }

  async function remove(document: LifecycleDocumentRecord) {
    const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(typeof data.error === "string" ? data.error : "Unable to remove document.");
      return;
    }
    onChange(documents.filter((item) => item.id !== document.id));
    setMessage(`${document.originalFileName} was removed from the lifecycle.`);
  }

  return (
    <div className="lifecycle-documents">
      {canWrite ? (
        <div className="document-uploader">
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories(stage).map((item) => <option key={item}>{item}</option>)}
          </select>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button type="button" className="toolbar-button compact" onClick={() => inputRef.current?.click()} disabled={progress !== null}>
            <Upload size={15} /> {progress === null ? "Add document" : `${progress}%`}
          </button>
        </div>
      ) : null}
      {message ? <p className="document-message">{message}</p> : null}
      {groups.length ? groups.map((group) => (
        <div className="document-group" key={group.label}>
          <h4>{group.label}</h4>
          {group.items.map((document) => (
            <div className="document-row" key={document.id}>
              <FileText size={18} />
              <span className="document-description">
                <strong>{document.originalFileName}</strong>
                <small>
                  {document.category} · {formatBytes(document.byteSize)} · {document.uploadedByName} · {new Date(document.createdAt).toLocaleDateString()}
                  {document.inherited ? ` · ${document.sourceNumber}` : ""}
                </small>
                {!document.available ? <em>{document.scanStatus} — unavailable for download</em> : null}
              </span>
              {document.downloadUrl ? (
                <a className="toolbar-button compact" href={document.downloadUrl}>
                  <Download size={14} /> Download
                </a>
              ) : null}
              {canWrite && document.canDelete ? (
                <button className="toolbar-button compact danger" type="button" onClick={() => void remove(document)}>
                  <Trash2 size={14} /> Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )) : (
        <p className="lead-notes">No documents have been added at this stage or inherited from upstream work.</p>
      )}
      <p className="document-policy">PDF up to 100 MB; JPEG, PNG, or WebP up to 10 MB. The full lifecycle is limited to 500 MB.</p>
    </div>
  );
}
