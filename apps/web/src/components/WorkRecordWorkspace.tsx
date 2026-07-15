"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  FileText,
  ReceiptText,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { LifecycleUpdatesPanel } from "@/components/LifecycleUpdatesPanel";
import { ViewportPortal } from "@/components/ViewportPortal";
import {
  fetchWorkRecord,
  fetchWorkUsers,
  updateWorkRecord,
  type WorkApiStage
} from "@/lib/api/work";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { canUser } from "@pulse/contracts/auth";
import type { RequestAssignee } from "@pulse/contracts/requests";
import {
  invoiceStatuses,
  projectStatuses,
  type InvoiceDetailRecord,
  type InvoiceStatus,
  type ProjectDetailRecord,
  type ProjectStatus
} from "@pulse/contracts/work";

type WorkDetailRecord = ProjectDetailRecord | InvoiceDetailRecord;
type RecordTab = "overview" | "files" | "updates";

type Props = {
  stage: WorkApiStage;
  recordId: string;
  initialTab?: RecordTab;
};

const tabs: Array<{ id: RecordTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
  { id: "updates", label: "Updates" }
];

function statusTone(status: string) {
  if (["Paid", "Completed"].includes(status)) return "success";
  if (["Cancelled", "Overdue", "Void"].includes(status)) return "danger";
  if (["Draft", "Review", "On Hold"].includes(status)) return "warning";
  return "info";
}

function displayDate(value: string) {
  return formatWorkspaceDate(value) || "Not set";
}

function recordNumber(record: WorkDetailRecord) {
  return "invoiceNumber" in record ? record.invoiceNumber : record.projectNumber;
}

function recordValue(record: WorkDetailRecord) {
  return "budget" in record ? record.budget : record.amount;
}

export function WorkRecordWorkspace({
  stage,
  recordId,
  initialTab = "overview"
}: Props) {
  const { user } = useCurrentUser();
  const [record, setRecord] = useState<WorkDetailRecord | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [activeTab, setActiveTab] = useState<RecordTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const tabRefs = useRef<Record<RecordTab, HTMLButtonElement | null>>({
    overview: null,
    files: null,
    updates: null
  });

  const isProject = stage === "project";
  const collectionHref = isProject ? "/projects" : "/billing";
  const collectionLabel = isProject ? "Projects" : "Billing";
  const writePermission = isProject ? "projects:write" : "billing:write";
  const canWriteRecord = canUser(user, writePermission);
  const canWriteUpdates = canUser(user, "activity:write");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");
        if (stage === "project") {
          const [recordData, users] = await Promise.all([
            fetchWorkRecord("project", recordId, { cache: "no-store" }),
            fetchWorkUsers("project", { cache: "no-store" })
          ]);
          setRecord(recordData.project);
          setAssignees(users.assignees);
        } else {
          const [recordData, users] = await Promise.all([
            fetchWorkRecord("invoice", recordId, { cache: "no-store" }),
            fetchWorkUsers("invoice", { cache: "no-store" })
          ]);
          setRecord(recordData.invoice);
          setAssignees(users.assignees);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : `Unable to load ${stage}.`);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [recordId, stage]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function selectTab(tab: RecordTab) {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: RecordTab) {
    const index = tabs.findIndex((item) => item.id === tab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab(tabs[(index + 1) % tabs.length].id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab(tabs[(index - 1 + tabs.length) % tabs.length].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(tabs[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(tabs[tabs.length - 1].id);
    }
  }

  async function changeStatus(status: string) {
    if (!record || !canWriteRecord || busy) return;
    try {
      setBusy(true);
      if (stage === "project") {
        const data = await updateWorkRecord("project", record.id, {
          status: status as ProjectStatus
        });
        setRecord((current) => current ? { ...current, ...data.project } : current);
      } else {
        const data = await updateWorkRecord("invoice", record.id, {
          status: status as InvoiceStatus
        });
        setRecord((current) => current ? { ...current, ...data.invoice } : current);
      }
      setToast(`${recordNumber(record)} moved to ${status}.`);
    } catch (updateError) {
      setToast(updateError instanceof Error ? updateError.message : "Unable to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function changeAssignee(assignedToId: string) {
    if (!record || !canWriteRecord || busy) return;
    try {
      setBusy(true);
      if (stage === "project") {
        const data = await updateWorkRecord("project", record.id, { assignedToId });
        setRecord((current) => current ? { ...current, ...data.project } : current);
      } else {
        const data = await updateWorkRecord("invoice", record.id, { assignedToId });
        setRecord((current) => current ? { ...current, ...data.invoice } : current);
      }
      const assigned = assignees.find((candidate) => candidate.id === assignedToId);
      setToast(assigned ? `Assigned to ${assigned.name}.` : "Assignment cleared.");
    } catch (updateError) {
      setToast(updateError instanceof Error ? updateError.message : "Unable to update assignment.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className="work-record-page"><div className="work-queue-state">Loading workspace…</div></section>;
  }

  if (!record) {
    return (
      <section className="work-record-page">
        <div className="work-queue-state error">
          <AlertTriangle size={20} />
          <div><strong>Workspace unavailable</strong><span>{error || `${isProject ? "Project" : "Invoice"} not found.`}</span></div>
        </div>
        <Link className="toolbar-button compact" href={collectionHref}><ArrowLeft size={16} />Back to {collectionLabel.toLowerCase()}</Link>
      </section>
    );
  }

  const statuses = isProject ? projectStatuses : invoiceStatuses;
  const projectRecord = "budget" in record ? record : null;
  const invoiceRecord = "amount" in record ? record : null;
  const sourceNumber = projectRecord?.quoteNumber ?? invoiceRecord?.projectNumber ?? "";
  const sourceHref = projectRecord?.quoteId
    ? `/quotes/${projectRecord.quoteId}`
    : invoiceRecord?.projectId
      ? `/projects/${invoiceRecord.projectId}`
      : "";
  const primaryDate = projectRecord?.startDate ?? invoiceRecord?.issuedDate ?? "";

  return (
    <section className="work-record-page">
      <header className="work-record-header">
        <div>
          <Link className="toolbar-button compact" href={collectionHref}><ArrowLeft size={16} />{collectionLabel}</Link>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/hub">Home</Link><span>/</span><Link href={collectionHref}>{collectionLabel}</Link><span>/</span><span>{recordNumber(record)}</span>
          </nav>
          <h1>{record.title}</h1>
          <p>{recordNumber(record)} · {record.clientName} · {sourceNumber ? `From ${sourceNumber}` : "Direct entry"}</p>
        </div>
        <div className="work-record-header-actions">
          <label>
            <span className="sr-only">Status</span>
            <select
              className={`work-queue-status-select tone-${statusTone(record.status)}`}
              value={record.status}
              disabled={!canWriteRecord || busy}
              onChange={(event) => void changeStatus(event.target.value)}
            >
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
      </header>

      <section className="work-record-highlights" aria-label={`${isProject ? "Project" : "Invoice"} highlights`}>
        <article>
          <span>Client</span>
          <Link href={`/clients/${record.clientId}`}>{record.clientName}</Link>
          <small>Client-linked lifecycle</small>
        </article>
        <article>
          <span>Assigned person</span>
          <strong><UserRound size={15} />{record.assignedTo?.name ?? "Unassigned"}</strong>
          <small>{record.assignedTo?.roleLabel ?? "Choose an active Pulse user"}</small>
        </article>
        <article>
          <span>Timing</span>
          <strong><CalendarClock size={15} />{record.dueDate ? `Due ${displayDate(record.dueDate)}` : "No due date"}</strong>
          <small>{primaryDate ? `${isProject ? "Started" : "Issued"} ${displayDate(primaryDate)}` : `${isProject ? "Start" : "Issue"} date not set`}</small>
        </article>
        <article>
          <span>{isProject ? "Budget" : "Invoice amount"}</span>
          <strong><ReceiptText size={15} />{formatMoney(recordValue(record))}</strong>
          <small>{record.documents.length} file{record.documents.length === 1 ? "" : "s"} in this lifecycle</small>
        </article>
      </section>

      {error ? (
        <div className="request-record-alert" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>
      ) : null}

      <section className="work-record-surface request-supporting-panel">
        <div className="request-supporting-tabs work-record-tabs" role="tablist" aria-label="Workspace sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`work-tab-${tab.id}`}
              ref={(element) => { tabRefs.current[tab.id] = element; }}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`work-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              {tab.label}
              {tab.id === "files" && record.documents.length ? <span>{record.documents.length}</span> : null}
              {tab.id === "updates" && record.unreadMentionCount ? <span>{record.unreadMentionCount}</span> : null}
            </button>
          ))}
        </div>

        <div
          id={`work-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`work-tab-${activeTab}`}
          tabIndex={0}
          className="request-supporting-content work-record-tab-content"
        >
          {activeTab === "overview" ? (
            <div className="request-details-grid work-record-overview">
              <section>
                <span>Assigned person</span>
                <label>
                  <span className="sr-only">Assigned person</span>
                  <select
                    value={record.assignedToId ?? ""}
                    disabled={!canWriteRecord || busy}
                    onChange={(event) => void changeAssignee(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.roleLabel}</option>
                    ))}
                  </select>
                </label>
                <small>Assignment is linked to an active Pulse account.</small>
              </section>
              <section>
                <span>Lifecycle source</span>
                {sourceHref ? <Link href={sourceHref}><h3>{sourceNumber}</h3></Link> : <h3>Direct entry</h3>}
                <p>{projectRecord ? "Approved quote handoff" : invoiceRecord?.projectId ? "Project billing" : "Standalone billing"}</p>
              </section>
              <section>
                <span>{isProject ? "Project window" : "Billing dates"}</span>
                <h3>{primaryDate ? displayDate(primaryDate) : "Not set"}</h3>
                <p>{record.dueDate ? `Due ${displayDate(record.dueDate)}` : "No due date"}</p>
              </section>
              <section>
                <span>{isProject ? "Billing readiness" : "Payment status"}</span>
                <h3>{record.status}</h3>
                <p>{isProject && "invoiceCount" in record ? `${record.invoiceCount} invoice${record.invoiceCount === 1 ? "" : "s"} created` : `Current amount ${formatMoney(recordValue(record))}`}</p>
              </section>
            </div>
          ) : null}

          {activeTab === "files" ? (
            <LifecycleDocuments
              stage={stage}
              recordId={record.id}
              documents={record.documents}
              canWrite={canWriteRecord}
              onChange={(documents) => setRecord((current) => current ? { ...current, documents } : current)}
            />
          ) : null}

          {activeTab === "updates" ? (
            <LifecycleUpdatesPanel
              stage={stage}
              recordId={record.id}
              initialUpdates={record.updates}
              initialCurrentStep={record.currentStep}
              unreadMentionCount={record.unreadMentionCount}
              canWrite={canWriteUpdates}
              onToast={setToast}
              onChange={(state) => setRecord((current) => current ? {
                ...current,
                updates: state.updates,
                currentStep: state.currentStep,
                unreadMentionCount: state.unreadMentionCount
              } : current)}
            />
          ) : null}
        </div>
      </section>

      {toast ? (
        <ViewportPortal><div className="work-queue-toast" role="status" aria-live="polite">{toast}</div></ViewportPortal>
      ) : null}
    </section>
  );
}
