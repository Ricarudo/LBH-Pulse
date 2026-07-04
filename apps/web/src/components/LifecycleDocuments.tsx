"use client";

import { Download, Eye, FileText, Maximize2, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  projectDocumentCategories,
  quoteDocumentCategories,
  requestDocumentCategories,
  type LifecycleDocumentRecord
} from "@/types/document";
import { formatWorkspaceDate } from "@/lib/formatting";

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

function DocumentPreviewModal({
  fileDocument,
  onClose
}: {
  fileDocument: LifecycleDocumentRecord;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfTimedOut, setPdfTimedOut] = useState(false);
  const isImage = fileDocument.mediaType.startsWith("image/");

  useEffect(() => {
    const previouslyFocused = window.document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && window.document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && window.document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (isImage) return;
    const timeout = window.setTimeout(() => setPdfTimedOut(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [isImage]);

  function fitImage() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  return createPortal(
    <div
      className="document-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={modalRef} className="document-preview-modal" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
        <header className="document-preview-header">
          <div>
            <h2 id="document-preview-title">{fileDocument.originalFileName}</h2>
            <p>
              {fileDocument.category} · {formatBytes(fileDocument.byteSize)} · {fileDocument.sourceNumber} · {fileDocument.uploadedByName}
            </p>
          </div>
          <div className="document-preview-actions">
            {isImage ? (
              <>
                <button type="button" className="toolbar-button compact" onClick={() => setScale((value) => Math.max(0.25, value - 0.25))} aria-label="Zoom out">
                  <ZoomOut size={16} />
                </button>
                <span className="document-zoom-label">{Math.round(scale * 100)}%</span>
                <button type="button" className="toolbar-button compact" onClick={() => setScale((value) => Math.min(5, value + 0.25))} aria-label="Zoom in">
                  <ZoomIn size={16} />
                </button>
                <button type="button" className="toolbar-button compact" onClick={fitImage}>
                  <Maximize2 size={16} /> Fit
                </button>
              </>
            ) : null}
            {fileDocument.downloadUrl ? (
              <a className="toolbar-button compact" href={fileDocument.downloadUrl}>
                <Download size={16} /> Download
              </a>
            ) : null}
            {!isImage && fileDocument.previewUrl ? (
              <a className="toolbar-button compact" href={fileDocument.previewUrl} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            ) : null}
            <button ref={closeRef} type="button" className="toolbar-button compact" onClick={onClose} aria-label="Close document preview">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className={isImage ? "document-preview-stage image" : "document-preview-stage pdf"}>
          {fileDocument.previewUrl && isImage ? (
            <img
              src={fileDocument.previewUrl}
              alt={fileDocument.originalFileName}
              draggable={false}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  offsetX: offset.x,
                  offsetY: offset.y
                };
              }}
              onPointerMove={(event) => {
                if (!dragRef.current) return;
                setOffset({
                  x: dragRef.current.offsetX + event.clientX - dragRef.current.x,
                  y: dragRef.current.offsetY + event.clientY - dragRef.current.y
                });
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
              onDoubleClick={fitImage}
            />
          ) : fileDocument.previewUrl ? (
            <>
              {!pdfLoaded ? (
                <div className="document-preview-status">
                  <strong>{pdfTimedOut ? "PDF preview is taking longer than expected." : "Loading PDF preview..."}</strong>
                  <span>{pdfTimedOut ? "Open it in a new tab or download the file if this browser cannot embed PDFs." : "Large construction drawings may take a moment."}</span>
                </div>
              ) : null}
              <iframe
                src={fileDocument.previewUrl}
                title={`Preview of ${fileDocument.originalFileName}`}
                className={pdfLoaded ? "loaded" : ""}
                onLoad={() => setPdfLoaded(true)}
              />
            </>
          ) : null}
        </div>
        <footer className="document-preview-footer">
          <span>Uploaded {formatWorkspaceDate(fileDocument.createdAt, true)}</span>
          <span>If preview is unavailable in this browser, use Download.</span>
        </footer>
      </section>
    </div>,
    window.document.body
  );
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
  const [previewDocument, setPreviewDocument] = useState<LifecycleDocumentRecord | null>(null);
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

  async function remove(fileDocument: LifecycleDocumentRecord) {
    const response = await fetch(`/api/documents/${fileDocument.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(typeof data.error === "string" ? data.error : "Unable to remove document.");
      return;
    }
    onChange(documents.filter((item) => item.id !== fileDocument.id));
    setMessage(`${fileDocument.originalFileName} was removed from the lifecycle.`);
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
          {group.items.map((fileDocument) => (
            <div className="document-row" key={fileDocument.id}>
              <FileText size={18} />
              <span className="document-description">
                {fileDocument.previewUrl ? (
                  <button type="button" className="document-preview-link" onClick={() => setPreviewDocument(fileDocument)}>
                    {fileDocument.originalFileName}
                  </button>
                ) : <strong>{fileDocument.originalFileName}</strong>}
                <small>
                  {fileDocument.category} · {formatBytes(fileDocument.byteSize)} · {fileDocument.uploadedByName} · {formatWorkspaceDate(fileDocument.createdAt)}
                  {fileDocument.inherited ? ` · ${fileDocument.sourceNumber}` : ""}
                </small>
                {!fileDocument.available ? <em>{fileDocument.scanStatus} — unavailable for preview or download</em> : null}
              </span>
              {fileDocument.previewUrl ? (
                <button className="toolbar-button compact" type="button" onClick={() => setPreviewDocument(fileDocument)}>
                  <Eye size={14} /> View
                </button>
              ) : null}
              {fileDocument.downloadUrl ? (
                <a className="toolbar-button compact" href={fileDocument.downloadUrl}>
                  <Download size={14} /> Download
                </a>
              ) : null}
              {canWrite && fileDocument.canDelete ? (
                <button className="toolbar-button compact danger" type="button" onClick={() => void remove(fileDocument)}>
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
      {previewDocument ? (
        <DocumentPreviewModal
          fileDocument={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
