"use client";
import Link from "next/link";
import { ListToolbar, ListFeedback, ListTable, ListViews } from "@/components/lists/ListControls";
import { useDashboardList } from "@/lib/useDashboardList";
import { lifecycleDefinition, lifecycleNumber, lifecycleOwner, type LifecycleKind, type LifecycleRow } from "@/lib/lifecycleLists";
import { uniqueOptions, filterCount, type ListDefinition } from "@/lib/listState";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";

type Work = { kind: LifecycleKind; record: LifecycleRow };
export function ClientWorkList({ clientId, type, rows }: { clientId: string; type: string; rows: Work[] }) {
  const kinds = ["requests", "quotes", "projects", "invoices"] as const;
  const definitions = Object.fromEntries(kinds.map(kind => [kind, lifecycleDefinition(kind, rows.filter(row => row.kind === kind).map(row => row.record))])) as Record<LifecycleKind, ListDefinition<LifecycleRow>>;
  const included = kinds.filter(kind => type === "All work" || (kind === "invoices" ? "Invoices" : kind[0].toUpperCase() + kind.slice(1)) === type);
  const available = rows.filter(row => included.includes(row.kind));
  const relevant = included.map(kind => definitions[kind]);
  const keys = Array.from(new Set(relevant.flatMap(def => def.filters.map(field => field.key)))).filter(key => key !== "client");
  const dates = Array.from(new Set(relevant.flatMap(def => def.dates!.map(field => field.key))));
  const definition: ListDefinition<Work> = {
    id: `client-work:${type}`, prefix: "work.", label: type.toLowerCase(), defaultView: "open", defaultSort: "activity", defaultDirection: "desc",
    views: ["open", "my", "closed", "all"].map(key => ({ key, label: { open: "All open", my: "My work", closed: "Closed", all: "All" }[key]!,
      statuses: key === "all" ? undefined : Array.from(new Set(relevant.flatMap(def => def.views!.find(view => view.key === key)?.statuses ?? []))),
      matches: (row, id) => definitions[row.kind].views!.find(view => view.key === key)!.matches(row.record, id) })),
    filters: keys.map(key => ({ key, label: relevant.flatMap(def => def.filters).find(field => field.key === key)!.label,
      options: uniqueOptions(relevant.flatMap(def => def.filters.find(field => field.key === key)?.options ?? [])),
      values: row => definitions[row.kind].filters.find(field => field.key === key)?.values?.(row.record) })),
    dates: dates.map(key => ({ key, label: key === "dueDate" && type === "All work" ? "Deadline / Due / Send-by" : relevant.flatMap(def => def.dates!).find(field => field.key === key)!.label,
      value: row => definitions[row.kind].dates!.find(field => field.key === key)?.value(row.record) })),
    sorts: [
      { key: "activity", label: "Updated", date: true, direction: "desc", value: row => row.record.updatedAt },
      { key: "number", label: "Record number", numeric: true, value: row => lifecycleNumber(row.record) },
      { key: "due", label: "Deadline / Due", date: true, value: row => row.record.dueDate },
      { key: "value", label: "Value", numeric: true, direction: "desc", value: row => "total" in row.record ? row.record.total : "budget" in row.record ? row.record.budget : "amount" in row.record ? row.record.amount : null }
      ,{ key: "created", label: "Created", date: true, direction: "desc", value: row => row.record.createdAt },
      { key: "nextAction", label: "Next-action target", date: true, value: row => "currentStep" in row.record ? row.record.currentStep?.targetDate : null },
      { key: "owner", label: "Assigned to", value: row => row.record.assignedToId ? lifecycleOwner(row.record) : null }
    ],
    search: row => definitions[row.kind].search(row.record), rowId: row => `${row.kind}:${row.record.id}`
  };
  const list = useDashboardList(definition, available);
  const labels = { requests: "Request", quotes: "Quote", projects: "Project", invoices: "Invoice" };
  return <section className="dashboard-list" aria-label={`Client ${type.toLowerCase()}`} data-client-id={clientId}>
    <ListViews list={list} /><ListToolbar list={list} count={list.rows.length} />
    <ListFeedback empty={!list.rows.length} filtered={Boolean(list.state.q || filterCount(list.state))} onReset={list.reset} />
    {list.rows.length ? <ListTable className="data-table client-360-table">
      <thead><tr><th>Stage</th><th>Record</th><th>Status</th><th>Assigned to</th><th className="list-number-header">Value</th><th>Updated</th></tr></thead>
      <tbody>{list.rows.map(({ kind, record }) => {
        const value = definition.sorts.find(sort => sort.key === "value")!.value({ kind, record });
        return <tr key={`${kind}:${record.id}`}>
          <td data-label="Stage">{labels[kind]}</td>
          <td data-label="Record"><Link href={`/${kind === "invoices" ? "billing" : kind}/${record.id}`}><strong>{lifecycleNumber(record)}</strong></Link><br /><span className="table-muted">{record.title}</span></td>
          <td data-label="Status"><span className="status-pill">{record.status}</span></td>
          <td data-label="Assigned to">{lifecycleOwner(record)}</td>
          <td data-label="Value">{typeof value === "number" ? formatMoney(value) : "—"}</td>
          <td data-label="Updated">{formatWorkspaceDate(record.updatedAt)}</td>
        </tr>;
      })}</tbody>
    </ListTable> : null}
  </section>;
}
