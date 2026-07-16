"use client";

import { CheckCircle2, CircleAlert, Download, Eye, FileText, FolderOpen, Maximize2, Plus, Search, Tag, Trash2, Upload, UploadCloud, X, ZoomIn, ZoomOut } from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  documentTagLimits,
  invoiceDocumentCategories,
  projectDocumentCategories,
  quoteDocumentCategories,
  requestDocumentCategories,
  suggestedDocumentPurposeTags,
  type LifecycleDocumentRecord
} from "@pulse/contracts/documents";
import { filterLifecycleDocuments } from "@/lib/documents";
import { formatWorkspaceDate } from "@/lib/formatting";

type Stage = "request" | "quote" | "project" | "invoice";

type Props = {
  stage: Stage;
  recordId: string;
  documents: LifecycleDocumentRecord[];
  canWrite: boolean;
  onChange: (documents: LifecycleDocumentRecord[]) => void;
};

function formatBytes(bytes: number) {
  if (!bytes) return "Metadata only";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function categories(stage: Stage) {
  if (stage === "request") return requestDocumentCategories;
  if (stage === "quote") return quoteDocumentCategories;
  if (stage === "project") return projectDocumentCategories;
  return invoiceDocumentCategories;
}

function endpoint(stage: Stage, id: string) {
  const collection = stage === "request"
    ? "requests"
    : stage === "quote"
      ? "quotes"
      : stage === "project"
        ? "projects"
        : "invoices";
  return `/api/${collection}/${id}/documents`;
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
              {fileDocument.tags.length ? ` · ${fileDocument.tags.join(" · ")}` : ""}
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [uploadOpen, setUploadOpen] = useState(documents.length === 0);
  const [dragActive, setDragActive] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<LifecycleDocumentRecord | null>(null);
  const isUploading = progress !== null;
  const messageIsError = /failed|unable|cannot|can't|limit|up to|one file/i.test(message);
  const visibleDocuments = useMemo(
    () => filterLifecycleDocuments(documents, searchQuery),
    [documents, searchQuery]
  );
  const groups = useMemo(
    () => [
      { label: "Added here", items: visibleDocuments.filter((document) => !document.inherited) },
      {
        label: "From Request",
        items: visibleDocuments.filter((document) => document.inherited && document.sourceType === "Request")
      },
      {
        label: "From Quote",
        items: visibleDocuments.filter((document) => document.inherited && document.sourceType === "Quote")
      },
      {
        label: "From Project",
        items: visibleDocuments.filter((document) => document.inherited && document.sourceType === "Project")
      }
    ].filter((group) => group.items.length),
    [visibleDocuments]
  );

  function toggleSuggestedTag(tag: string) {
    setTags((current) => {
      if (current.includes(tag)) return current.filter((item) => item !== tag);
      if (current.length >= documentTagLimits.count) {
        setMessage(`You can add up to ${documentTagLimits.count} purpose tags.`);
        return current;
      }
      return [...current, tag];
    });
  }

  function addCustomTag() {
    const normalized = tagDraft.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!normalized) return;
    if (normalized.length > documentTagLimits.length || /[,\u0000-\u001f\u007f]/.test(normalized)) {
      setMessage(`Purpose tags cannot contain commas and may be up to ${documentTagLimits.length} characters.`);
      return;
    }
    const suggested = suggestedDocumentPurposeTags.find(
      (tag) => tag.toLocaleLowerCase("en-US") === normalized.toLocaleLowerCase("en-US")
    );
    const tag = suggested ?? normalized;
    if (tags.some((item) => item.toLocaleLowerCase("en-US") === tag.toLocaleLowerCase("en-US"))) {
      setTagDraft("");
      return;
    }
    if (tags.length >= documentTagLimits.count) {
      setMessage(`You can add up to ${documentTagLimits.count} purpose tags.`);
      return;
    }
    setTags((current) => [...current, tag]);
    setTagDraft("");
    setMessage("");
  }

  function selectFile(file?: File) {
    if (!file || isUploading) return;
    setMessage("");
    upload(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!canWrite || isUploading) return;
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    if (files.length > 1) {
      setMessage("Upload one file at a time so its category and purpose tags stay accurate.");
      return;
    }
    selectFile(files[0]);
  }

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("category", category);
    form.set("tags", JSON.stringify(tags));
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
      let data: {
        document?: LifecycleDocumentRecord;
        error?: string;
      } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.document) {
        onChange([data.document, ...documents]);
        setMessage(`${data.document.originalFileName} passed inspection and was stored.`);
        setTags([]);
        setTagDraft("");
        setUploadOpen(false);
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
    setDeleteCandidateId(null);
    setMessage(`${fileDocument.originalFileName} was removed from the lifecycle.`);
  }

  return (
    <div className="lifecycle-documents">
      <header className="document-files-header">
        <div className="document-files-heading">
          <span className="document-files-icon"><FolderOpen size={19} /></span>
          <div>
            <h2>Files <span>{documents.length}</span></h2>
            <p>Documents added here and inherited from upstream work.</p>
          </div>
        </div>
        {canWrite ? (
          <button
            type="button"
            className={uploadOpen ? "toolbar-button compact" : "primary-button compact"}
            aria-expanded={uploadOpen}
            aria-controls="lifecycle-document-upload"
            onClick={() => setUploadOpen((open) => !open)}
          >
            {uploadOpen ? <X size={16} /> : <Upload size={16} />}
            {uploadOpen ? "Close upload" : "Upload file"}
          </button>
        ) : null}
      </header>

      {canWrite && uploadOpen ? (
        <section id="lifecycle-document-upload" className="document-upload-panel" aria-label="Upload a file">
          <div
            className={`document-dropzone${dragActive ? " is-dragging" : ""}${isUploading ? " is-uploading" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isUploading) setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <span className="document-dropzone-icon"><UploadCloud size={24} /></span>
            <div>
              <strong>{isUploading ? "Uploading and inspecting file" : dragActive ? "Drop file to upload" : "Drag and drop a file here"}</strong>
              <span>PDF up to 100 MB · JPEG, PNG, or WebP up to 10 MB</span>
            </div>
            <button type="button" className="primary-button compact" onClick={() => inputRef.current?.click()} disabled={isUploading}>
              <Upload size={15} />Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            {isUploading ? (
              <div className="document-upload-progress" role="progressbar" aria-label="File upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}>
                <span style={{ width: `${progress ?? 0}%` }} />
                <small>{progress ?? 0}%</small>
              </div>
            ) : null}
          </div>

          <div className="document-upload-settings">
            <label className="document-category-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={isUploading}>
                {categories(stage).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <details className="document-purpose-disclosure">
              <summary>
                <span>Purpose tags</span>
                <small>{tags.length ? `${tags.length} selected` : "Optional"}</small>
              </summary>
              <fieldset className="document-purpose-picker" disabled={isUploading}>
                <legend className="sr-only">Choose up to {documentTagLimits.count} purpose tags</legend>
                <div className="document-purpose-options">
                  {suggestedDocumentPurposeTags.map((tag) => {
                    const selected = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={selected ? "document-purpose-option selected" : "document-purpose-option"}
                        aria-pressed={selected}
                        onClick={() => toggleSuggestedTag(tag)}
                      >
                        <Tag size={13} /> {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="document-custom-tag">
                  <input
                    value={tagDraft}
                    maxLength={documentTagLimits.length}
                    placeholder="Add a custom purpose"
                    aria-label="Custom purpose tag"
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomTag();
                      }
                    }}
                  />
                  <button type="button" onClick={addCustomTag} disabled={!tagDraft.trim()}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                {tags.length ? (
                  <div className="document-selected-tags" aria-label="Selected purpose tags">
                    {tags.map((tag) => (
                      <span key={tag}>
                        {tag}
                        <button type="button" aria-label={`Remove ${tag} tag`} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </fieldset>
            </details>
            <p>Files are validated and scanned before they become available. Lifecycle storage limit: 500 MB.</p>
          </div>
        </section>
      ) : null}

      {message ? (
        <div className={`document-message ${messageIsError ? "error" : "success"}`} role={messageIsError ? "alert" : "status"}>
          {messageIsError ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
          <span>{message}</span>
          <button type="button" aria-label="Dismiss file message" onClick={() => setMessage("")}><X size={14} /></button>
        </div>
      ) : null}

      <section className="document-library" aria-labelledby="document-library-heading">
        <header className="document-library-header">
          <div>
            <h3 id="document-library-heading">Documents</h3>
            <p>{documents.length ? `${documents.length} file${documents.length === 1 ? "" : "s"} across this lifecycle` : "No files in this lifecycle yet"}</p>
          </div>
          {documents.length ? (
            <label className="document-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Search documents"
                value={searchQuery}
                placeholder="Search files"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <span>{visibleDocuments.length} of {documents.length}</span>
            </label>
          ) : null}
        </header>

        {groups.length ? groups.map((group) => (
          <section className="document-group" key={group.label} aria-labelledby={`document-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <header>
              <h4 id={`document-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`}>{group.label}</h4>
              <span>{group.items.length}</span>
            </header>
            <div className="document-list">
              {group.items.map((fileDocument) => (
                <article className={`document-row${fileDocument.available ? "" : " is-unavailable"}`} key={fileDocument.id}>
                  <span className="document-file-icon"><FileText size={18} /></span>
                  <div className="document-description">
                    {fileDocument.previewUrl ? (
                      <button type="button" className="document-preview-link" onClick={() => setPreviewDocument(fileDocument)}>
                        {fileDocument.originalFileName}
                      </button>
                    ) : <strong>{fileDocument.originalFileName}</strong>}
                    <div className="document-metadata">
                      <span className="document-category-badge">{fileDocument.category}</span>
                      <span>{formatBytes(fileDocument.byteSize)}</span>
                      <span>{fileDocument.uploadedByName}</span>
                      <span>{formatWorkspaceDate(fileDocument.createdAt)}</span>
                      {fileDocument.inherited ? <span>{fileDocument.sourceNumber}</span> : null}
                    </div>
                    {fileDocument.tags.length ? (
                      <div className="document-row-tags">
                        {fileDocument.tags.map((tag) => (
                          <button key={tag} type="button" onClick={() => setSearchQuery(tag)}>
                            <Tag size={11} /> {tag}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!fileDocument.available ? <em>{fileDocument.scanStatus} — unavailable for preview or download</em> : null}
                  </div>
                  <div className="document-row-actions">
                    {deleteCandidateId === fileDocument.id ? (
                      <div className="document-delete-confirm" role="group" aria-label={`Confirm removal of ${fileDocument.originalFileName}`}>
                        <span>Remove?</span>
                        <button type="button" onClick={() => setDeleteCandidateId(null)}>Cancel</button>
                        <button type="button" className="danger" onClick={() => void remove(fileDocument)}>Remove</button>
                      </div>
                    ) : (
                      <>
                        {fileDocument.previewUrl ? (
                          <button className="document-icon-action" type="button" onClick={() => setPreviewDocument(fileDocument)} aria-label={`Preview ${fileDocument.originalFileName}`} title="Preview">
                            <Eye size={16} />
                          </button>
                        ) : null}
                        {fileDocument.downloadUrl ? (
                          <a className="document-icon-action" href={fileDocument.downloadUrl} aria-label={`Download ${fileDocument.originalFileName}`} title="Download">
                            <Download size={16} />
                          </a>
                        ) : null}
                        {canWrite && fileDocument.canDelete ? (
                          <button className="document-icon-action danger" type="button" onClick={() => setDeleteCandidateId(fileDocument.id)} aria-label={`Remove ${fileDocument.originalFileName}`} title="Remove">
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )) : (
          <div className="document-empty-state">
            <span><FolderOpen size={24} /></span>
            <strong>{searchQuery.trim() ? "No matching files" : "No files yet"}</strong>
            <p>{searchQuery.trim() ? "Try a different filename, category, or purpose tag." : "Upload the first file or continue the lifecycle to inherit documents from upstream work."}</p>
            {canWrite && !searchQuery.trim() && !uploadOpen ? (
              <button type="button" className="primary-button compact" onClick={() => setUploadOpen(true)}><Upload size={15} />Upload first file</button>
            ) : null}
          </div>
        )}
      </section>
      {previewDocument ? (
        <DocumentPreviewModal
          fileDocument={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
