"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Clock3, Filter, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import {
  auditEventCategories,
  type AuditEventCategory,
  type AuditLogResponse
} from "@pulse/contracts/audit";
import { formatWorkspaceDate } from "@/lib/formatting";

type AuditFilters = {
  category: AuditEventCategory;
  actor: string;
  from: string;
  to: string;
};

const emptyFilters: AuditFilters = {
  category: "all",
  actor: "",
  from: "",
  to: ""
};

const categoryLabels: Record<AuditEventCategory, string> = {
  all: "All security events",
  authentication: "Authentication",
  accounts: "Accounts",
  permissions: "Permissions",
  administration: "Administration"
};

export function SettingsAuditSection() {
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [status, setStatus] = useState("Loading audit events…");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAuditEvents() {
      try {
        setLoading(true);
        setStatus("Loading audit events…");
        const query = new URLSearchParams({
          category: filters.category,
          actor: filters.actor,
          page: String(page),
          take: "30"
        });
        if (filters.from) query.set("from", filters.from);
        if (filters.to) query.set("to", filters.to);
        const response = await fetch(`/api/audit?${query}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const result = await response.json() as AuditLogResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load audit events.");
        setData(result);
        setStatus(`${result.total} audit event${result.total === 1 ? "" : "s"} found.`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setData(null);
        setStatus(error instanceof Error ? error.message : "Unable to load audit events.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAuditEvents();
    return () => controller.abort();
  }, [filters, page]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft, actor: draft.actor.trim() });
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  }

  return (
    <div className="settings-content-stack">
      <section className="settings-card" aria-labelledby="audit-log-title">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><ShieldCheck size={20} /></div>
          <div>
            <h2 id="audit-log-title">Administrator audit log</h2>
            <p>Authentication, account, permission, and workspace-administration events. Every view of this log is recorded.</p>
          </div>
        </div>
        <form className="audit-filter-form" onSubmit={applyFilters}>
          <label>
            <span>Event category</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value as AuditEventCategory })}
            >
              {auditEventCategories.map((category) => (
                <option value={category} key={category}>{categoryLabels[category]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Actor name or role</span>
            <input
              type="search"
              maxLength={80}
              value={draft.actor}
              placeholder="Search people or roles"
              onChange={(event) => setDraft({ ...draft, actor: event.target.value })}
            />
          </label>
          <label>
            <span>From</span>
            <input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
          </label>
          <div className="audit-filter-actions">
            <button type="button" className="toolbar-button compact" onClick={clearFilters}>
              <RotateCcw size={15} /> Clear
            </button>
            <button type="submit" className="primary-button">
              <Filter size={15} /> Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="settings-card audit-results" aria-labelledby="audit-results-title" aria-busy={loading}>
        <div className="audit-results-heading">
          <div>
            <h2 id="audit-results-title">Security and administration events</h2>
            <p role="status" aria-live="polite">{status}</p>
          </div>
          {data ? <span className="status-pill">Retained {data.retentionDays} days</span> : null}
        </div>

        {loading ? <div className="settings-empty">Loading audit events…</div> : null}
        {!loading && data?.events.length === 0 ? (
          <div className="settings-empty">No audit events match these filters.</div>
        ) : null}
        {!loading && data?.events.length ? (
          <div className="audit-event-list">
            {data.events.map((event) => (
              <article className="audit-event" key={event.id}>
                <div className="audit-event-icon"><ShieldCheck size={16} /></div>
                <div>
                  <div className="audit-event-heading">
                    <strong>{event.title}</strong>
                    <span>{categoryLabels[event.category]}</span>
                  </div>
                  {event.detail ? <p>{event.detail}</p> : null}
                  <div className="audit-event-meta">
                    <span><UserRound size={13} />{event.actorName} ({event.actorRole})</span>
                    <span><Clock3 size={13} />{formatWorkspaceDate(event.createdAt, true)}</span>
                    <span><CalendarDays size={13} />{event.type}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {data && data.pageCount > 1 ? (
          <nav className="audit-pagination" aria-label="Audit log pages">
            <button type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {data.page} of {data.pageCount}</span>
            <button type="button" disabled={data.page >= data.pageCount || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
