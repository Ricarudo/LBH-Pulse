"use client";
import { ListToolbar, ListTable, ListFeedback } from "./lists/ListControls";
import { useDashboardList } from "@/lib/useDashboardList";
import { options, filterCount, type ListDefinition } from "@/lib/listState";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Plus } from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { useCurrentUser } from "@/lib/useCurrentUser";
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
  const { user } = useCurrentUser();
  const canManage = canUser(user, "projects:write");
  const [items, setItems] = useState(rows);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // These are starter records: only filter fields actually present in this dataset.
  const definition: ListDefinition<WorkspaceRow> = {
    id: `starter:${title}`, label: title.toLowerCase(), defaultView: "all", defaultSort: "name", defaultDirection: "asc",
    filters: [
      { key: "status", label: "Status", options: options(items.map(row => row.status)), values: row => row.status },
      { key: "client", label: "Customer / Project", options: options(items.map(row => row.customer)), values: row => row.customer },
      { key: "owner", label: "Owner", options: options(items.map(row => row.owner)), values: row => row.owner }
    ], sorts: [{ key: "name", label: "Name", value: row => row.title }, { key: "number", label: "Record number", value: row => row.id }],
    search: row => [row.id, row.title, row.detail, row.customer, row.owner, row.status].join(" "), rowId: row => row.id
  };
  const list = useDashboardList(definition, items);
  const visibleItems = list.rows;

  function addItem() {
    const nextNumber = items.length + 1;
    const item = {
      ...newRow,
      id: `${newRow.id}-${nextNumber.toString().padStart(2, "0")}`
    };

    setItems((current) => [item, ...current]);
    list.reset();
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
    <div className="workspace-stack dashboard-list">
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
          <p className="metric-value metric-text">{filterCount(list.state) || "None"}</p>
        </article>
      </section>

      <section className="panel" aria-labelledby={`${title}-table-title`}>
        <div className="panel-header">
          <div>
            <h2 id={`${title}-table-title`}>{title} Board</h2>
            {lastAction ? <p className="panel-note">{lastAction}</p> : null}
          </div>
          <div className="workspace-actions">
            <button
              className="toolbar-button compact"
              type="button"
              disabled={!canManage}
              onClick={advanceFirstItem}
            >
              <CheckCircle2 size={17} />
              {secondaryAction}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!canManage}
              onClick={addItem}
            >
              <Plus size={17} />
              {primaryAction}
            </button>
          </div>
        </div>

        <ListToolbar list={list} count={visibleItems.length} />
        <ListFeedback empty={!visibleItems.length} filtered={Boolean(list.state.q || filterCount(list.state))} onReset={list.reset} />
        <ListTable className="data-table">
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
                <td data-label="ID">
                  <strong>{item.id}</strong>
                </td>
                <td data-label="Work">
                  {item.title}
                  <br />
                  <span className="table-muted">{item.detail}</span>
                </td>
                <td data-label="Customer / Project">{item.customer}</td>
                <td data-label="Owner">{item.owner}</td>
                <td data-label="Status">
                  <span className={statusClass(item.status)}>{item.status}</span>
                </td>
                <td data-label="Due">{item.due}</td>
                <td data-label={valueLabel}>
                  <span className="table-value">
                    {item.value}
                    <ArrowRight size={14} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </ListTable>
      </section>
    </div>
  );
}
