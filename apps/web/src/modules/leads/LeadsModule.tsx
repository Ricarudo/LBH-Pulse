"use client";

import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Edit3,
  Filter,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  StickyNote,
  UserCheck,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  formatCurrency,
  leadOwners,
  leadPriorities,
  leadSources,
  leadStatuses,
  serviceInterests,
  type LeadPriority,
  type LeadRecord,
  type LeadSource,
  type LeadStatus,
  type ServiceInterest
} from "./leadData";

type LeadView =
  | "All Open"
  | "My Leads"
  | "Unassigned"
  | "Needs Follow-Up"
  | "Qualified"
  | "Lost / Unqualified";

type LeadFormState = {
  name: string;
  companyName: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  leadSource: LeadSource;
  serviceInterest: ServiceInterest;
  siteName: string;
  siteAddress: string;
  city: string;
  state: string;
  estimatedValue: string;
  status: LeadStatus;
  priority: LeadPriority;
  assignedOwner: string;
  nextFollowUpDate: string;
  notes: string;
};

type LeadListResponse = {
  leads: LeadRecord[];
};

type LeadResponse = {
  lead: LeadRecord;
};

const leadViews: LeadView[] = [
  "All Open",
  "My Leads",
  "Unassigned",
  "Needs Follow-Up",
  "Qualified",
  "Lost / Unqualified"
];

const today = "2026-05-09";

function createFormState(lead?: LeadRecord): LeadFormState {
  return {
    name: lead?.name ?? "",
    companyName: lead?.companyName ?? "",
    contactName: lead?.contactName ?? "",
    contactTitle: lead?.contactTitle ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    leadSource: lead?.leadSource ?? "Referral",
    serviceInterest: lead?.serviceInterest ?? "Access Control",
    siteName: lead?.siteName ?? "",
    siteAddress: lead?.siteAddress ?? "",
    city: lead?.city ?? "",
    state: lead?.state ?? "PR",
    estimatedValue:
      lead?.estimatedValue !== undefined && lead.estimatedValue > 0
        ? String(lead.estimatedValue)
        : "",
    status: lead?.status ?? "New",
    priority: lead?.priority ?? "Normal",
    assignedOwner: lead?.assignedOwner ?? "Alex Morgan",
    nextFollowUpDate: lead?.nextFollowUpDate ?? today,
    notes: lead?.notes ?? ""
  };
}

function getStatusClass(status: LeadStatus) {
  if (status === "Lost" || status === "Unqualified") {
    return "status-pill danger";
  }

  if (
    status === "Site Visit Needed" ||
    status === "Estimating" ||
    status === "Proposal Needed" ||
    status === "Proposal Sent"
  ) {
    return "status-pill warning";
  }

  return "status-pill";
}

function getPriorityClass(priority: LeadPriority) {
  if (priority === "Urgent") {
    return "lead-priority urgent";
  }

  if (priority === "High") {
    return "lead-priority high";
  }

  return "lead-priority";
}

function isOpenLead(lead: LeadRecord) {
  return !["Won / Converted", "Lost", "Unqualified"].includes(lead.status);
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Lead request failed."
    );
  }

  return data as T;
}

function buildLeadPayload(formState: LeadFormState) {
  const estimatedValue = Number(formState.estimatedValue || 0);

  return {
    ...formState,
    estimatedValue,
    qualificationContactIdentified: Boolean(formState.contactName),
    qualificationSiteKnown: Boolean(formState.siteName || formState.siteAddress),
    qualificationBudgetKnown: estimatedValue > 0,
    qualificationFollowUpScheduled: Boolean(formState.nextFollowUpDate)
  };
}

export function LeadsModule() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [activeView, setActiveView] = useState<LeadView>("All Open");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | LeadStatus>("All");
  const [sourceFilter, setSourceFilter] = useState<"All" | LeadSource>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] =
    useState<"All" | LeadPriority>("All");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<LeadFormState>(createFormState());
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [conversionOpen, setConversionOpen] = useState(false);
  const [createQuoteOnConvert, setCreateQuoteOnConvert] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState("Loading leads from Pulse database...");

  const selectedLead =
    leads.find((lead) => lead.id === selectedLeadId) ?? leads[0];

  useEffect(() => {
    async function loadLeads() {
      try {
        setIsLoading(true);
        const data = await requestJson<LeadListResponse>("/api/leads", {
          cache: "no-store"
        });
        setLeads(data.leads);
        setSelectedLeadId(data.leads[0]?.id ?? "");
        setToast("Lead module connected to the Pulse database.");
      } catch (error) {
        setToast(
          error instanceof Error
            ? error.message
            : "Unable to load leads from the API."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeads();
  }, []);

  useEffect(() => {
    if (leads.length > 0 && !leads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(leads[0].id);
    }
  }, [leads, selectedLeadId]);

  const metrics = useMemo(() => {
    const open = leads.filter(isOpenLead);
    const needsFollowUp = leads.filter(
      (lead) =>
        isOpenLead(lead) &&
        Boolean(lead.nextFollowUpDate) &&
        lead.nextFollowUpDate <= today
    );

    return {
      open: open.length,
      needsFollowUp: needsFollowUp.length,
      qualified: leads.filter((lead) => lead.status === "Qualified").length,
      value: open.reduce((sum, lead) => sum + lead.estimatedValue, 0)
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const searchHaystack = [
        lead.leadNumber,
        lead.name,
        lead.companyName,
        lead.contactName,
        lead.email,
        lead.phone,
        lead.siteName,
        lead.siteAddress,
        lead.city,
        lead.state,
        lead.notes,
        lead.serviceInterest
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchHaystack.includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "All" || lead.status === statusFilter;
      const matchesSource =
        sourceFilter === "All" || lead.leadSource === sourceFilter;
      const matchesOwner =
        ownerFilter === "All" || lead.assignedOwner === ownerFilter;
      const matchesPriority =
        priorityFilter === "All" || lead.priority === priorityFilter;

      let matchesView = true;
      if (activeView === "All Open") {
        matchesView = isOpenLead(lead);
      } else if (activeView === "My Leads") {
        matchesView = lead.assignedOwner === "Alex Morgan";
      } else if (activeView === "Unassigned") {
        matchesView = lead.assignedOwner === "Unassigned";
      } else if (activeView === "Needs Follow-Up") {
        matchesView =
          isOpenLead(lead) &&
          Boolean(lead.nextFollowUpDate) &&
          lead.nextFollowUpDate <= today;
      } else if (activeView === "Qualified") {
        matchesView = lead.status === "Qualified";
      } else if (activeView === "Lost / Unqualified") {
        matchesView = lead.status === "Lost" || lead.status === "Unqualified";
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSource &&
        matchesOwner &&
        matchesPriority &&
        matchesView
      );
    });
  }, [
    activeView,
    leads,
    ownerFilter,
    priorityFilter,
    searchTerm,
    sourceFilter,
    statusFilter
  ]);

  function replaceLead(updatedLead: LeadRecord) {
    setLeads((current) =>
      current.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
    );
    setSelectedLeadId(updatedLead.id);
  }

  function openCreateForm() {
    setFormMode("create");
    setFormState(createFormState());
  }

  function openEditForm(lead: LeadRecord) {
    setFormMode("edit");
    setFormState(createFormState(lead));
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.name || (!formState.companyName && !formState.contactName)) {
      setToast("Lead name and company or contact are required.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = buildLeadPayload(formState);

      if (formMode === "edit" && selectedLead) {
        const data = await requestJson<LeadResponse>(
          `/api/leads/${selectedLead.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload)
          }
        );
        replaceLead(data.lead);
        setToast(`${data.lead.leadNumber} updated.`);
      } else {
        const data = await requestJson<LeadResponse>("/api/leads", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setLeads((current) => [data.lead, ...current]);
        setSelectedLeadId(data.lead.id);
        setActiveView("All Open");
        setToast(`${data.lead.leadNumber} created.`);
      }

      setFormMode(null);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to save this lead."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateLeadStatus(status: LeadStatus) {
    if (!selectedLead) {
      return;
    }

    try {
      const data = await requestJson<LeadResponse>(
        `/api/leads/${selectedLead.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status })
        }
      );
      replaceLead(data.lead);
      setToast(`${data.lead.leadNumber} moved to ${status}.`);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to update status."
      );
    }
  }

  async function addNote() {
    if (!selectedLead) {
      return;
    }

    if (!noteText.trim()) {
      setToast("Write a note before adding it to the timeline.");
      return;
    }

    try {
      const data = await requestJson<LeadResponse>(
        `/api/leads/${selectedLead.id}/activities`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "Note",
            title: "Note added",
            body: noteText.trim(),
            actor: "Alex Morgan"
          })
        }
      );
      replaceLead(data.lead);
      setNoteText("");
      setToast("Note added to lead timeline.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add note.");
    }
  }

  async function addTask() {
    if (!selectedLead) {
      return;
    }

    if (!taskTitle.trim()) {
      setToast("Add a task title first.");
      return;
    }

    try {
      const data = await requestJson<LeadResponse>(
        `/api/leads/${selectedLead.id}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title: taskTitle.trim(),
            dueAt: selectedLead.nextFollowUpDate || today,
            owner: selectedLead.assignedOwner
          })
        }
      );
      replaceLead(data.lead);
      setTaskTitle("");
      setToast("Task added.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add task.");
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    if (!selectedLead) {
      return;
    }

    try {
      const data = await requestJson<LeadResponse>(
        `/api/leads/${selectedLead.id}/tasks/${taskId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !completed })
        }
      );
      replaceLead(data.lead);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update task.");
    }
  }

  async function convertLead() {
    if (!selectedLead) {
      return;
    }

    try {
      const data = await requestJson<LeadResponse>(
        `/api/leads/${selectedLead.id}/convert`,
        {
          method: "POST",
          body: JSON.stringify({
            createQuote: createQuoteOnConvert
          })
        }
      );
      replaceLead(data.lead);
      setConversionOpen(false);
      setToast(
        `${data.lead.leadNumber} converted to ${data.lead.convertedOpportunityId}.`
      );
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to convert this lead."
      );
    }
  }

  return (
    <div className="leads-module">
      <section className="leads-hero">
        <div>
          <p className="eyebrow">Lead Intake</p>
          <h2>Capture, qualify, and hand off work without losing context.</h2>
          <p>
            Track sources, ownership, follow-ups, site needs, and conversion readiness before the work moves into quoting or projects.
          </p>
        </div>
        <div className="leads-hero-actions">
          <button className="primary-button" type="button" onClick={openCreateForm}>
            <Plus size={17} />
            New Lead
          </button>
        </div>
      </section>

      <section className="lead-metric-grid" aria-label="Lead metrics">
        <article className="metric-card">
          <p className="metric-label">Open Leads</p>
          <p className="metric-value">{metrics.open}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Needs Follow-Up</p>
          <p className="metric-value">{metrics.needsFollowUp}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Qualified</p>
          <p className="metric-value">{metrics.qualified}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Open Value</p>
          <p className="metric-value metric-currency">{formatCurrency(metrics.value)}</p>
        </article>
      </section>

      <div className="lead-view-tabs" role="tablist" aria-label="Lead views">
        {leadViews.map((view) => (
          <button
            key={view}
            className={activeView === view ? "lead-view-tab active" : "lead-view-tab"}
            type="button"
            onClick={() => setActiveView(view)}
          >
            {view}
          </button>
        ))}
      </div>

      <section className="lead-workspace">
        <div className="lead-list-panel">
          <div className="lead-list-toolbar">
            <label className="lead-search">
              <Search size={17} />
              <input
                aria-label="Search leads"
                placeholder="Search lead, company, contact, site, phone..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <div className="lead-filter-row">
              <Filter size={16} />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | LeadStatus)}>
                <option value="All">All statuses</option>
                {leadStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "All" | LeadSource)}>
                <option value="All">All sources</option>
                {leadSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="All">All owners</option>
                {leadOwners.map((owner) => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "All" | LeadPriority)}>
                <option value="All">All priorities</option>
                {leadPriorities.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
          </div>

          <table className="lead-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Company / Contact</th>
                <th>Interest</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Owner</th>
                <th>Next Follow-Up</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className={lead.id === selectedLead?.id ? "selected" : ""}
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <td>
                    <strong>{lead.name}</strong>
                    <span>{lead.leadNumber}</span>
                  </td>
                  <td>
                    <strong>{lead.companyName || "No company yet"}</strong>
                    <span>{lead.contactName || "No contact yet"}</span>
                  </td>
                  <td>
                    {lead.serviceInterest}
                    <span>{lead.siteName}</span>
                  </td>
                  <td>
                    <span className={getStatusClass(lead.status)}>{lead.status}</span>
                  </td>
                  <td>
                    <span className={getPriorityClass(lead.priority)}>{lead.priority}</span>
                  </td>
                  <td>{lead.assignedOwner}</td>
                  <td>{lead.nextFollowUpDate || "Not set"}</td>
                  <td>{formatCurrency(lead.estimatedValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!isLoading && filteredLeads.length === 0 ? (
            <div className="lead-empty-state">
              <strong>No leads match this view.</strong>
              <span>Adjust the filters or create a new lead.</span>
            </div>
          ) : null}
        </div>

        <aside className="lead-detail-panel" aria-label="Lead details">
          {selectedLead ? (
            <>
              <div className="lead-detail-header">
                <div>
                  <p>{selectedLead.leadNumber}</p>
                  <h2>{selectedLead.name}</h2>
                  <span className={getStatusClass(selectedLead.status)}>{selectedLead.status}</span>
                </div>
                <div className="lead-detail-actions">
                  <button
                    className="toolbar-button compact"
                    type="button"
                    onClick={() => openEditForm(selectedLead)}
                  >
                    <Edit3 size={16} />
                    Edit
                  </button>
                  <button className="toolbar-button compact" type="button" onClick={() => setConversionOpen(true)}>
                    <UserCheck size={17} />
                    Convert
                  </button>
                </div>
              </div>

              <div className="lead-detail-grid">
                <div>
                  <span>Company</span>
                  <strong>{selectedLead.companyName || "Not captured"}</strong>
                </div>
                <div>
                  <span>Contact</span>
                  <strong>{selectedLead.contactName || "Not captured"}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selectedLead.leadSource}</strong>
                </div>
                <div>
                  <span>Value</span>
                  <strong>{formatCurrency(selectedLead.estimatedValue)}</strong>
                </div>
              </div>

              <div className="lead-contact-card">
                <p><Mail size={15} /> {selectedLead.email || "No email captured"}</p>
                <p><Phone size={15} /> {selectedLead.phone || "No phone captured"}</p>
                <p>
                  <MapPin size={15} />{" "}
                  {[selectedLead.siteName, selectedLead.siteAddress, selectedLead.city, selectedLead.state]
                    .filter(Boolean)
                    .join(", ") || "No site captured"}
                </p>
                <p><CalendarClock size={15} /> Next follow-up: {selectedLead.nextFollowUpDate || "Not set"}</p>
              </div>

              <section className="lead-section">
                <h3>Qualification Checklist</h3>
                <div className="checklist">
                  <span className={selectedLead.qualificationContactIdentified ? "done" : ""}>Contact identified</span>
                  <span className={selectedLead.qualificationSiteKnown ? "done" : ""}>Site/location known</span>
                  <span className={selectedLead.qualificationBudgetKnown ? "done" : ""}>Estimated value</span>
                  <span className={selectedLead.qualificationFollowUpScheduled ? "done" : ""}>Follow-up scheduled</span>
                </div>
              </section>

              <section className="lead-section">
                <h3>Quick Status</h3>
                <div className="status-action-grid">
                  {["Contacted", "Qualified", "Site Visit Needed", "Estimating", "Proposal Needed", "Lost"].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateLeadStatus(status as LeadStatus)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <section className="lead-section">
                <h3>Notes</h3>
                <p className="lead-notes">{selectedLead.notes || "No lead notes yet."}</p>
                <textarea
                  placeholder="Add a note to the timeline..."
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
                <button className="toolbar-button compact" type="button" onClick={addNote}>
                  <StickyNote size={16} />
                  Add Note
                </button>
              </section>

              <section className="lead-section">
                <h3>Tasks</h3>
                <div className="task-composer">
                  <input
                    placeholder="Add follow-up task..."
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                  />
                  <button type="button" onClick={addTask}>Add</button>
                </div>
                <div className="task-list">
                  {selectedLead.tasks.map((task) => (
                    <button
                      key={task.id}
                      className="task-row"
                      type="button"
                      onClick={() => toggleTask(task.id, task.completed)}
                    >
                      {task.completed ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
                      <span>
                        <strong>{task.title}</strong>
                        <small>{task.owner} · {task.dueAt || "No due date"}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="lead-section">
                <h3>Activity Timeline</h3>
                <div className="lead-timeline">
                  {selectedLead.activity.map((item) => (
                    <article key={item.id}>
                      <Activity size={15} />
                      <div>
                        <strong>{item.title}</strong>
                        {item.body ? <p>{item.body}</p> : null}
                        <span>{item.actor} · {item.at}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="lead-empty-state detail">
              <strong>{isLoading ? "Loading lead details..." : "No lead selected."}</strong>
              <span>{isLoading ? "Pulse is reading from the local database." : "Create a lead to begin."}</span>
            </div>
          )}
        </aside>
      </section>

      <section className="lead-reporting-panel">
        <div>
          <h3>Lead Analytics Preview</h3>
          <p>Live MVP reporting from persisted lead status counts. Advanced analytics can move into dedicated API summaries later.</p>
        </div>
        <div className="mini-bars">
          {leadStatuses.slice(0, 6).map((status) => {
            const count = leads.filter((lead) => lead.status === status).length;
            return (
              <div key={status}>
                <span>{status}</span>
                <strong style={{ width: `${Math.max(8, count * 42)}px` }} />
                <em>{count}</em>
              </div>
            );
          })}
        </div>
      </section>

      <div className="lead-toast">{toast}</div>

      {formMode ? (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true">
          <form className="lead-form-modal" onSubmit={saveLead}>
            <div className="modal-heading">
              <div>
                <h2>{formMode === "edit" ? "Edit Lead" : "Create Lead"}</h2>
                <p>Fast capture now, structured conversion later.</p>
              </div>
              <button type="button" onClick={() => setFormMode(null)} aria-label="Close form">
                <X size={20} />
              </button>
            </div>

            <div className="lead-form-grid">
              <label>
                Lead name
                <input value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} />
              </label>
              <label>
                Company
                <input value={formState.companyName} onChange={(event) => setFormState({ ...formState, companyName: event.target.value })} />
              </label>
              <label>
                Contact person
                <input value={formState.contactName} onChange={(event) => setFormState({ ...formState, contactName: event.target.value })} />
              </label>
              <label>
                Contact title
                <input value={formState.contactTitle} onChange={(event) => setFormState({ ...formState, contactTitle: event.target.value })} />
              </label>
              <label>
                Email
                <input value={formState.email} onChange={(event) => setFormState({ ...formState, email: event.target.value })} />
              </label>
              <label>
                Phone
                <input value={formState.phone} onChange={(event) => setFormState({ ...formState, phone: event.target.value })} />
              </label>
              <label>
                Lead source
                <select value={formState.leadSource} onChange={(event) => setFormState({ ...formState, leadSource: event.target.value as LeadSource })}>
                  {leadSources.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label>
                Service interest
                <select value={formState.serviceInterest} onChange={(event) => setFormState({ ...formState, serviceInterest: event.target.value as ServiceInterest })}>
                  {serviceInterests.map((interest) => <option key={interest} value={interest}>{interest}</option>)}
                </select>
              </label>
              <label>
                Site/location
                <input value={formState.siteName} onChange={(event) => setFormState({ ...formState, siteName: event.target.value })} />
              </label>
              <label>
                Site address
                <input value={formState.siteAddress} onChange={(event) => setFormState({ ...formState, siteAddress: event.target.value })} />
              </label>
              <label>
                City
                <input value={formState.city} onChange={(event) => setFormState({ ...formState, city: event.target.value })} />
              </label>
              <label>
                State
                <input value={formState.state} onChange={(event) => setFormState({ ...formState, state: event.target.value })} />
              </label>
              <label>
                Estimated value
                <input type="number" value={formState.estimatedValue} onChange={(event) => setFormState({ ...formState, estimatedValue: event.target.value })} />
              </label>
              <label>
                Status
                <select value={formState.status} onChange={(event) => setFormState({ ...formState, status: event.target.value as LeadStatus })}>
                  {leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                Priority
                <select value={formState.priority} onChange={(event) => setFormState({ ...formState, priority: event.target.value as LeadPriority })}>
                  {leadPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
              <label>
                Assigned owner
                <select value={formState.assignedOwner} onChange={(event) => setFormState({ ...formState, assignedOwner: event.target.value })}>
                  {leadOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                </select>
              </label>
              <label>
                Next follow-up
                <input type="date" value={formState.nextFollowUpDate} onChange={(event) => setFormState({ ...formState, nextFollowUpDate: event.target.value })} />
              </label>
              <label className="lead-form-wide">
                Notes
                <textarea value={formState.notes} onChange={(event) => setFormState({ ...formState, notes: event.target.value })} />
              </label>
            </div>

            <div className="modal-actions">
              <button className="toolbar-button compact" type="button" onClick={() => setFormMode(null)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                <Save size={17} />
                {isSaving ? "Saving..." : "Save Lead"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {conversionOpen && selectedLead ? (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true">
          <section className="conversion-modal">
            <div className="modal-heading">
              <div>
                <h2>Convert Lead</h2>
                <p>{selectedLead.leadNumber} will become an opportunity placeholder.</p>
              </div>
              <button type="button" onClick={() => setConversionOpen(false)} aria-label="Close conversion">
                <X size={20} />
              </button>
            </div>

            <div className="conversion-summary">
              <div>
                <ClipboardCheck size={22} />
                <span>
                  <strong>Create opportunity</strong>
                  <small>Opportunity ID will be generated from this lead number.</small>
                </span>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={createQuoteOnConvert}
                  onChange={(event) => setCreateQuoteOnConvert(event.target.checked)}
                />
                Also create quote placeholder
              </label>
              <p>
                Customer/contact/site matching will be added later. This starter persists conversion placeholders and records the event in the timeline.
              </p>
            </div>

            <div className="modal-actions">
              <button className="toolbar-button compact" type="button" onClick={() => setConversionOpen(false)}>Cancel</button>
              <button className="primary-button" type="button" onClick={convertLead}>
                Convert Lead
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
