"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  FileText,
  GripVertical,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { LifecycleUpdatesPanel } from "@/components/LifecycleUpdatesPanel";
import { ViewportPortal } from "@/components/ViewportPortal";
import {
  archiveProjectTask,
  createProjectTask,
  fetchWorkRecord,
  fetchWorkUsers,
  reorderProjectTasks,
  updateProjectTask,
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
  projectTaskStatuses,
  type InvoiceDetailRecord,
  type InvoiceStatus,
  type LifecycleTab,
  type ProjectDetailRecord,
  type ProjectStatus,
  type ProjectTaskRecord,
  type ProjectTaskStatus
} from "@pulse/contracts/work";

type WorkDetailRecord = ProjectDetailRecord | InvoiceDetailRecord;

type Props = {
  stage: WorkApiStage;
  recordId: string;
  initialTab?: LifecycleTab;
};

const tabs: Array<{ id: LifecycleTab; label: string }> = [
  { id: "work", label: "Work" },
  { id: "details", label: "Details" },
  { id: "files", label: "Files" },
  { id: "updates", label: "Updates" }
];

const taskStatusLabels: Record<ProjectTaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done"
};

function statusTone(status: string) {
  if (["Paid", "Completed", "DONE"].includes(status)) return "success";
  if (["Cancelled", "Overdue", "Void", "BLOCKED"].includes(status)) return "danger";
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

export function WorkRecordWorkspace({ stage, recordId, initialTab = "work" }: Props) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [record, setRecord] = useState<WorkDetailRecord | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [activeTab, setActiveTab] = useState<LifecycleTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskWeight, setTaskWeight] = useState("1");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const dragTaskId = useRef<string | null>(null);
  const tabRefs = useRef<Record<LifecycleTab, HTMLButtonElement | null>>({
    work: null,
    details: null,
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
        let nextRecord: WorkDetailRecord;
        let users: Awaited<ReturnType<typeof fetchWorkUsers>>;
        if (stage === "project") {
          const [recordData, loadedUsers] = await Promise.all([
            fetchWorkRecord("project", recordId, { cache: "no-store" }),
            fetchWorkUsers("project", { cache: "no-store" })
          ]);
          nextRecord = recordData.project;
          users = loadedUsers;
        } else {
          const [recordData, loadedUsers] = await Promise.all([
            fetchWorkRecord("invoice", recordId, { cache: "no-store" }),
            fetchWorkUsers("invoice", { cache: "no-store" })
          ]);
          nextRecord = recordData.invoice;
          users = loadedUsers;
        }
        setRecord(nextRecord);
        setDetailsDraft(nextRecord.lifecycleContext.details);
        setAssigneeDraft(nextRecord.assignedToId ?? "");
        setAssignees(users.assignees);
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

  function selectTab(tab: LifecycleTab, focus = true) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    if (focus) window.setTimeout(() => tabRefs.current[tab]?.focus(), 0);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: LifecycleTab) {
    const index = tabs.findIndex((item) => item.id === tab);
    const next = event.key === "ArrowRight"
      ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft"
        ? tabs[(index - 1 + tabs.length) % tabs.length]
        : event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs[tabs.length - 1]
            : null;
    if (next) {
      event.preventDefault();
      selectTab(next.id);
    }
  }

  async function changeStatus(status: string) {
    if (!record || !canWriteRecord || busy) return;
    try {
      setBusy(true);
      const updated = stage === "project"
        ? (await updateWorkRecord("project", record.id, { status: status as ProjectStatus })).project
        : (await updateWorkRecord("invoice", record.id, { status: status as InvoiceStatus })).invoice;
      setRecord((current) => current ? { ...current, ...updated } as WorkDetailRecord : current);
      setToast(`${recordNumber(record)} moved to ${status}.`);
    } catch (updateError) {
      setToast(updateError instanceof Error ? updateError.message : "Unable to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    if (!record || !canWriteRecord || busy) return;
    try {
      setBusy(true);
      const input = { assignedToId: assigneeDraft || null, lifecycleDetails: detailsDraft };
      const updated = stage === "project"
        ? (await updateWorkRecord("project", record.id, input)).project
        : (await updateWorkRecord("invoice", record.id, input)).invoice;
      setRecord((current) => current ? {
        ...current,
        ...updated,
        lifecycleContext: {
          ...current.lifecycleContext,
          details: detailsDraft,
          updatedAt: new Date().toISOString(),
          updatedByName: user?.name ?? "Pulse System"
        }
      } as WorkDetailRecord : current);
      setDetailsEditing(false);
      setToast("Details saved for the full lifecycle.");
    } catch (updateError) {
      setToast(updateError instanceof Error ? updateError.message : "Unable to save details.");
    } finally {
      setBusy(false);
    }
  }

  async function assignPerson(assignedToId: string) {
    if (!record || !canWriteRecord || busy) return;
    const previousAssigneeId = record.assignedToId ?? "";
    setAssigneeDraft(assignedToId);
    try {
      setBusy(true);
      const input = { assignedToId: assignedToId || null };
      const updated = stage === "project"
        ? (await updateWorkRecord("project", record.id, input)).project
        : (await updateWorkRecord("invoice", record.id, input)).invoice;
      setRecord((current) => current ? { ...current, ...updated } as WorkDetailRecord : current);
      setToast(`${recordNumber(record)} assigned to ${updated.assignedTo?.name ?? "Unassigned"}.`);
    } catch (updateError) {
      setAssigneeDraft(previousAssigneeId);
      setToast(updateError instanceof Error ? updateError.message : "Unable to update assigned person.");
    } finally {
      setBusy(false);
    }
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!record || !isProject || !taskTitle.trim() || busy) return;
    try {
      setBusy(true);
      const data = await createProjectTask(record.id, {
        title: taskTitle.trim(),
        status: "NOT_STARTED",
        weight: Number(taskWeight || 1),
        assignedToId: taskAssigneeId || null,
        dueDate: taskDueDate || undefined
      });
      setRecord((current) => current && "tasks" in current ? {
        ...current,
        tasks: [...current.tasks, data.task],
        progress: data.progress
      } : current);
      setTaskTitle("");
      setTaskWeight("1");
      setTaskAssigneeId("");
      setTaskDueDate("");
      setToast("Project task added.");
    } catch (taskError) {
      setToast(taskError instanceof Error ? taskError.message : "Unable to add task.");
    } finally {
      setBusy(false);
    }
  }

  async function patchTask(task: ProjectTaskRecord, input: Parameters<typeof updateProjectTask>[2]) {
    if (!record || !isProject || busy) return;
    try {
      setBusy(true);
      const data = await updateProjectTask(record.id, task.id, input);
      setRecord((current) => current && "tasks" in current ? {
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? data.task : item),
        progress: data.progress
      } : current);
    } catch (taskError) {
      setToast(taskError instanceof Error ? taskError.message : "Unable to update task.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(task: ProjectTaskRecord) {
    if (!record || !isProject || busy) return;
    try {
      setBusy(true);
      const data = await archiveProjectTask(record.id, task.id);
      setRecord((current) => current && "tasks" in current ? {
        ...current,
        tasks: data.tasks,
        progress: data.progress
      } : current);
      setToast("Task archived.");
    } catch (taskError) {
      setToast(taskError instanceof Error ? taskError.message : "Unable to archive task.");
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(taskId: string, direction: -1 | 1, targetId?: string) {
    if (!record || !("tasks" in record) || busy) return;
    const tasks = [...record.tasks];
    const from = tasks.findIndex((task) => task.id === taskId);
    const to = targetId ? tasks.findIndex((task) => task.id === targetId) : from + direction;
    if (from < 0 || to < 0 || to >= tasks.length || from === to) return;
    const [moved] = tasks.splice(from, 1);
    tasks.splice(to, 0, moved);
    setRecord({ ...record, tasks });
    try {
      const data = await reorderProjectTasks(record.id, { taskIds: tasks.map((task) => task.id) });
      setRecord((current) => current && "tasks" in current ? {
        ...current,
        tasks: data.tasks,
        progress: data.progress
      } : current);
    } catch (taskError) {
      setToast(taskError instanceof Error ? taskError.message : "Unable to reorder tasks.");
      const refreshed = await fetchWorkRecord("project", record.id, { cache: "no-store" }).catch(() => null);
      if (refreshed) setRecord(refreshed.project);
    }
  }

  if (loading) return <section className="work-record-page"><div className="work-queue-state">Loading workspace…</div></section>;

  if (!record) {
    return (
      <section className="work-record-page">
        <div className="work-queue-state error"><AlertTriangle size={20} /><div><strong>Workspace unavailable</strong><span>{error || "Record not found."}</span></div></div>
        <Link className="toolbar-button compact" href={collectionHref}><ArrowLeft size={16} />Back to {collectionLabel.toLowerCase()}</Link>
      </section>
    );
  }

  const statuses = isProject ? projectStatuses : invoiceStatuses;
  const project = "tasks" in record ? record : null;
  const invoice = "billingSummary" in record ? record : null;
  const sourceNumber = project?.quoteNumber ?? invoice?.projectNumber ?? "";
  const sourceHref = project?.quoteId
    ? `/quotes/${project.quoteId}`
    : invoice?.projectId
      ? `/projects/${invoice.projectId}`
      : "";
  const primaryDate = project?.startDate ?? invoice?.issuedDate ?? "";

  return (
    <section className="work-record-page lifecycle-workspace">
      <header className="work-record-header lifecycle-record-header">
        <Link
          className="lifecycle-record-back"
          href={collectionHref}
          aria-label={`Back to ${collectionLabel.toLowerCase()} queue`}
          title={`Back to ${collectionLabel.toLowerCase()} queue`}
        >
          <ArrowLeft size={17} />
        </Link>
        <div className="lifecycle-record-identity">
          <span>{recordNumber(record)}</span>
          <h1>{record.title}</h1>
          <p>{record.clientName} · {sourceNumber ? `From ${sourceNumber}` : "Direct entry"}</p>
        </div>
        <label className="work-record-header-actions lifecycle-record-actions">
          <span className="sr-only">Status</span>
          <select className={`work-queue-status-select tone-${statusTone(record.status)}`} value={record.status} disabled={!canWriteRecord || busy} onChange={(event) => void changeStatus(event.target.value)}>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      </header>

      <section className="work-record-highlights lifecycle-key-details" aria-label={`${isProject ? "Project" : "Billing"} highlights`}>
        <Link
          className="lifecycle-client-key"
          href={`/clients/${record.clientId}`}
          aria-label={`Open client workspace for ${record.clientName}`}
        >
          <span>Client</span>
          <strong>{record.clientName}</strong>
          <small>{record.contact?.name || "No point of contact"}</small>
        </Link>
        <article><span>Assigned person</span><strong><UserRound size={15} />{record.assignedTo?.name ?? "Unassigned"}</strong><small>{record.assignedTo?.roleLabel ?? "Linked Pulse user"}</small></article>
        <article><span>Timing</span><strong><CalendarClock size={15} />{record.dueDate ? `Due ${displayDate(record.dueDate)}` : "No due date"}</strong><small>{primaryDate ? `${isProject ? "Started" : "Issued"} ${displayDate(primaryDate)}` : "Primary date not set"}</small></article>
        <article><span>{isProject ? "Progress" : "Milestone"}</span><strong><ReceiptText size={15} />{project ? `${project.progress.percent}%` : formatMoney(recordValue(record))}</strong><small>{record.currentStep ? <button type="button" className="lifecycle-highlight-link" onClick={() => selectTab("updates", false)}>{record.currentStep.title || "View current step"}</button> : "No current step"}</small></article>
      </section>

      {record.relationshipWarnings.map((warning) => <div key={`${warning.field}:${warning.legacyValue}`} className="request-record-alert" role="status"><AlertTriangle size={18} /><span>{warning.message} <strong>{warning.legacyValue}</strong></span></div>)}

      <section className="work-record-surface request-supporting-panel">
        <div className="request-supporting-tabs work-record-tabs lifecycle-tabs" role="tablist" aria-label="Workspace sections">
          {tabs.map((tab) => (
            <button key={tab.id} id={`work-tab-${tab.id}`} ref={(element) => { tabRefs.current[tab.id] = element; }} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`work-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id, false)} onKeyDown={(event) => handleTabKeyDown(event, tab.id)}>
              {tab.label}
              {tab.id === "files" && record.documents.length ? <span>{record.documents.length}</span> : null}
              {tab.id === "updates" && record.unreadMentionCount ? <span>{record.unreadMentionCount}</span> : null}
            </button>
          ))}
        </div>

        <div id={`work-panel-${activeTab}`} role="tabpanel" aria-labelledby={`work-tab-${activeTab}`} tabIndex={0} className="request-supporting-content work-record-tab-content">
          {activeTab === "work" && project ? (
            <div className="lifecycle-work-grid">
              <section className="project-task-panel">
                <div className="panel-header"><div><h2>Project tasks</h2><p className="panel-note">Done weight determines delivery progress.</p></div><strong>{project.progress.completedWeight} / {project.progress.totalWeight} weight</strong></div>
                <div className="project-progress" aria-label={`${project.progress.percent}% complete`}><span style={{ width: `${project.progress.percent}%` }} /></div>
                <ol className="project-task-list">
                  {project.tasks.map((task, index) => (
                    <li key={task.id} draggable={canWriteRecord && !busy} onDragStart={() => { dragTaskId.current = task.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { const dragged = dragTaskId.current; dragTaskId.current = null; if (dragged) void moveTask(dragged, 1, task.id); }}>
                      <div className="project-task-reorder"><GripVertical size={18} aria-hidden="true" /><button type="button" aria-label={`Move ${task.title} up`} disabled={!canWriteRecord || busy || index === 0} onClick={() => void moveTask(task.id, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Move ${task.title} down`} disabled={!canWriteRecord || busy || index === project.tasks.length - 1} onClick={() => void moveTask(task.id, 1)}><ArrowDown size={15} /></button></div>
                      <div className="project-task-fields">
                        <input aria-label="Task title" defaultValue={task.title} disabled={!canWriteRecord || busy} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== task.title) void patchTask(task, { title: event.target.value }); }} />
                        <select aria-label="Task status" value={task.status} disabled={!canWriteRecord || busy} onChange={(event) => void patchTask(task, { status: event.target.value as ProjectTaskStatus })}>{projectTaskStatuses.map((status) => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}</select>
                        <label><span>Weight</span><input type="number" min="1" max="1000" defaultValue={task.weight} disabled={!canWriteRecord || busy} onBlur={(event) => { const weight = Number(event.target.value); if (weight !== task.weight) void patchTask(task, { weight }); }} /></label>
                        <label><span>Assigned</span><select value={task.assignedToId ?? ""} disabled={!canWriteRecord || busy} onChange={(event) => void patchTask(task, { assignedToId: event.target.value || null })}><option value="">Unassigned</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select></label>
                        <label><span>Due</span><input type="date" defaultValue={task.dueDate} disabled={!canWriteRecord || busy} onBlur={(event) => { if (event.target.value !== task.dueDate) void patchTask(task, { dueDate: event.target.value }); }} /></label>
                        <textarea aria-label="Task notes" placeholder="Task notes" defaultValue={task.notes} disabled={!canWriteRecord || busy} onBlur={(event) => { if (event.target.value !== task.notes) void patchTask(task, { notes: event.target.value }); }} />
                      </div>
                      <button className="icon-button" type="button" aria-label={`Archive ${task.title}`} disabled={!canWriteRecord || busy} onClick={() => void removeTask(task)}><Trash2 size={16} /></button>
                    </li>
                  ))}
                  {!project.tasks.length ? <li className="work-queue-state">No project tasks yet. Add the first weighted task below.</li> : null}
                </ol>
                {canWriteRecord ? <form className="project-task-add" onSubmit={addTask}><input required maxLength={200} placeholder="Add a project task" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /><label><span>Weight</span><input type="number" min="1" max="1000" value={taskWeight} onChange={(event) => setTaskWeight(event.target.value)} /></label><select aria-label="Assigned person" value={taskAssigneeId} onChange={(event) => setTaskAssigneeId(event.target.value)}><option value="">Unassigned</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select><input aria-label="Due date" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /><button className="primary-button compact" type="submit" disabled={busy}><Plus size={16} />Add task</button></form> : null}
              </section>
              <aside className="lifecycle-summary-rail"><section><span>Delivery progress</span><strong>{project.progress.percent}%</strong><p>{project.progress.completedTasks} of {project.progress.totalTasks} tasks done</p></section><section><span>Project budget</span><strong>{formatMoney(project.budget)}</strong><p>{project.invoiceCount} billing milestone{project.invoiceCount === 1 ? "" : "s"}</p></section><section><span>Assigned tech</span><strong>{project.assignedTo?.name ?? "Unassigned"}</strong><p>{project.assignedTo?.roleLabel ?? "Set in Details"}</p></section></aside>
            </div>
          ) : null}

          {activeTab === "work" && invoice ? (
            <div className="lifecycle-work-grid billing-work-grid">
              <section className="billing-milestones-panel"><div className="panel-header"><div><h2>Billing milestones</h2><p className="panel-note">This invoice is one milestone in the project billing plan.</p></div><strong>{invoice.billingSummary.milestones.length} milestone{invoice.billingSummary.milestones.length === 1 ? "" : "s"}</strong></div><div className="billing-milestone-table"><table className="data-table"><thead><tr><th>Invoice</th><th>Status</th><th>Issued</th><th>Due</th><th>Amount</th></tr></thead><tbody>{invoice.billingSummary.milestones.map((milestone) => <tr key={milestone.invoiceId} className={milestone.isCurrent ? "is-current" : ""}><td><Link href={`/billing/${milestone.invoiceId}?tab=work`}>{milestone.invoiceNumber}</Link><br /><span className="table-muted">{milestone.title}{milestone.isCurrent ? " · Current" : ""}</span></td><td><span className={`status-chip tone-${statusTone(milestone.status)}`}>{milestone.status}</span></td><td>{displayDate(milestone.issuedDate)}</td><td>{displayDate(milestone.dueDate)}</td><td><strong>{formatMoney(milestone.amount)}</strong></td></tr>)}</tbody></table></div></section>
              <aside className="lifecycle-summary-rail billing-summary"><section><span>Project budget</span><strong>{invoice.billingSummary.projectId ? formatMoney(invoice.billingSummary.projectBudget) : "Standalone"}</strong><p>{invoice.billingSummary.projectNumber || "No project linked"}</p></section><section><span>Planned</span><strong>{formatMoney(invoice.billingSummary.planned)}</strong><p>All non-void milestones</p></section><section><span>Invoiced</span><strong>{formatMoney(invoice.billingSummary.invoiced)}</strong><p>Sent, paid, and overdue</p></section><section><span>Paid</span><strong>{formatMoney(invoice.billingSummary.paid)}</strong><p>Paid milestones</p></section><section><span>Outstanding</span><strong>{formatMoney(invoice.billingSummary.outstanding)}</strong><p>Sent and overdue</p></section><section><span>Remaining</span><strong>{formatMoney(invoice.billingSummary.remaining)}</strong><p>Budget less planned</p></section></aside>
            </div>
          ) : null}

          {activeTab === "details" ? (
            <section className="lifecycle-details-panel">
              <div className="panel-header"><div><h2>Details</h2><p className="panel-note">Linked stage data plus one shared note across the lifecycle.</p></div>{detailsEditing ? <div className="settings-inline-actions"><button type="button" className="toolbar-button compact" disabled={busy} onClick={() => { setDetailsEditing(false); setDetailsDraft(record.lifecycleContext.details); }}><X size={15} />Cancel</button><button type="button" className="primary-button compact" disabled={busy} onClick={() => void saveDetails()}><Save size={15} />Save</button></div> : <button type="button" className="toolbar-button compact" disabled={!canWriteRecord} onClick={() => setDetailsEditing(true)}>Edit note</button>}</div>
              <div className="request-details-grid lifecycle-linked-grid"><section><span>Client</span><h3><Link href={`/clients/${record.clientId}`}>{record.clientName}</Link></h3><p>Linked for this stage</p></section><section><span>Point of contact</span><h3>{record.contact?.name ?? "Not linked"}</h3><p>{record.contact?.email || record.contact?.phone || "Optional for this stage"}</p></section><section><span>Site</span><h3>{record.site?.siteName ?? "Not linked"}</h3><p>{record.site ? [record.site.address, record.site.city, record.site.state].filter(Boolean).join(", ") : "Optional for this stage"}</p></section><section><span>Source</span><h3>{sourceNumber || "Direct entry"}</h3><p>{sourceHref ? <Link href={sourceHref}>Open upstream workspace</Link> : "No upstream record"}</p></section></div>
              <label className="material-field lifecycle-assignee-field"><span>Assigned person</span><select value={assigneeDraft} disabled={!canWriteRecord || busy} onChange={(event) => void assignPerson(event.target.value)}><option value="">Unassigned</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.roleLabel}</option>)}</select><small>Changes apply immediately to this {isProject ? "project" : "billing"} workspace.</small></label>
              <label className="material-field lifecycle-details-note"><span>Shared lifecycle details</span>{detailsEditing ? <textarea maxLength={5000} value={detailsDraft} onChange={(event) => setDetailsDraft(event.target.value)} /> : <p>{record.lifecycleContext.details || "No shared details have been added."}</p>}<small>{detailsEditing ? `${detailsDraft.length}/5,000` : `Last updated by ${record.lifecycleContext.updatedByName}${record.lifecycleContext.updatedAt ? ` · ${formatWorkspaceDate(record.lifecycleContext.updatedAt, true)}` : ""}`}</small></label>
            </section>
          ) : null}

          {activeTab === "files" ? <LifecycleDocuments stage={stage} recordId={record.id} documents={record.documents} canWrite={canWriteRecord} onChange={(documents) => setRecord((current) => current ? { ...current, documents } : current)} /> : null}
          {activeTab === "updates" ? <LifecycleUpdatesPanel stage={stage} recordId={record.id} initialUpdates={record.updates} initialCurrentStep={record.currentStep} unreadMentionCount={record.unreadMentionCount} canWrite={canWriteUpdates} onToast={setToast} onChange={(state) => setRecord((current) => current ? { ...current, updates: state.updates, currentStep: state.currentStep, unreadMentionCount: state.unreadMentionCount } : current)} /> : null}
        </div>
      </section>

      {toast ? <ViewportPortal><div className="work-queue-toast" role="status" aria-live="polite">{toast}</div></ViewportPortal> : null}
    </section>
  );
}
