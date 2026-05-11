"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Plus, SlidersHorizontal } from "lucide-react";
import type { WorkspaceRow } from "@/lib/starterData";

type OperationsWorkspaceProps = {
  title: string;
  primaryAction: string;
  secondaryAction: string;
  rows: WorkspaceRow[];
  newRow: WorkspaceRow;
  nextStatus: string;
  valueLabel: string;
};

function statusClass(status: string) {
  const lowered = status.toLowerCase();

  if (
    lowered.includes("waiting") ||
    lowered.includes("review") ||
    lowered.includes("draft")
  ) {
    return "status-pill warning";
  }

  if (lowered.includes("blocked") || lowered.includes("overdue")) {
    return "status-pill danger";
  }

  return "status-pill";
}

export function OperationsWorkspace({
  title,
  primaryAction,
  secondaryAction,
  rows,
  newRow,
  nextStatus,
  valueLabel
}: OperationsWorkspaceProps) {
  const [items, setItems] = useState(rows);
  const [activeFilter, setActiveFilter] = useState("All");
  const [lastAction, setLastAction] = useState<string | null>(null);

  const filters = useMemo(
    () => ["All", ...Array.from(new Set(items.map((item) => item.status)))],
    [items]
  );

  const visibleItems =
    activeFilter === "All"
      ? items
      : items.filter((item) => item.status === activeFilter);

  function addItem() {
    const nextNumber = items.length + 1;
    const item = {
      ...newRow,
      id: `${newRow.id}-${nextNumber.toString().padStart(2, "0")}`
    };

    setItems((current) => [item, ...current]);
    setActiveFilter("All");
    setLastAction(`${item.id} added to ${title}.`);
  }

  function advanceFirstItem() {
    const target = visibleItems[0];

    if (!target) {
      setLastAction(`No ${title.toLowerCase()} records match this filter.`);
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === target.id ? { ...item, status: nextStatus } : item
      )
    );
    setLastAction(`${target.id} moved to ${nextStatus}.`);
  }

  return (
    <div className="workspace-stack">
      <section className="metric-grid" aria-label={`${title} metrics`}>
        <article className="metric-card">
          <p className="metric-label">Visible Records</p>
          <p className="metric-value">{visibleItems.length}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Total Records</p>
          <p className="metric-value">{items.length}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Active Filter</p>
          <p className="metric-value metric-text">{activeFilter}</p>
        </article>
      </section>

      <section className="panel" aria-labelledby={`${title}-table-title`}>
        <div className="panel-header">
          <div>
            <h2 id={`${title}-table-title`}>{title} Board</h2>
            {lastAction ? <p className="panel-note">{lastAction}</p> : null}
          </div>
          <div className="workspace-actions">
            <button className="toolbar-button compact" type="button" onClick={advanceFirstItem}>
              <CheckCircle2 size={17} />
              {secondaryAction}
            </button>
            <button className="primary-button" type="button" onClick={addItem}>
              <Plus size={17} />
              {primaryAction}
            </button>
          </div>
        </div>

        <div className="filter-strip" aria-label={`${title} filters`}>
          <SlidersHorizontal size={16} />
          {filters.map((filter) => (
            <button
              className={filter === activeFilter ? "filter-chip active" : "filter-chip"}
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Work</th>
              <th>Customer / Project</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Due</th>
              <th>{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.id}</strong>
                </td>
                <td>
                  {item.title}
                  <br />
                  <span className="table-muted">{item.detail}</span>
                </td>
                <td>{item.customer}</td>
                <td>{item.owner}</td>
                <td>
                  <span className={statusClass(item.status)}>{item.status}</span>
                </td>
                <td>{item.due}</td>
                <td>
                  <span className="table-value">
                    {item.value}
                    <ArrowRight size={14} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

