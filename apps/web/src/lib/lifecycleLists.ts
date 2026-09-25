import { requestStatuses, requestPriorities, requestSources, serviceCategories, type RequestRecord } from "@pulse/contracts/requests";
import { quoteLifecycleGroup, quoteLifecycleGroups, quoteLifecycleGroupLabels, quoteStatusLabel } from "@pulse/contracts/quote-lifecycle";
import { quoteStatuses, projectStatuses, invoiceStatuses, type QuoteRecord, type ProjectRecord, type InvoiceRecord } from "@pulse/contracts/work";
import { options, uniqueOptions, type ListDefinition } from "./listState";
export type LifecycleRow = RequestRecord | QuoteRecord | ProjectRecord | InvoiceRecord;
export type LifecycleKind = "requests" | "quotes" | "projects" | "invoices";
export const openStatuses: Record<LifecycleKind, readonly string[]> = {
  requests: requestStatuses.filter(status => !["Converted to Quote", "No Bid", "Cancelled", "Duplicate"].includes(status)),
  quotes: ["Draft", "Review", "On Hold", "Sent"],
  projects: ["Ready", "In Progress", "Field Work", "On Hold"],
  invoices: ["Draft", "Review", "Sent", "Overdue"]
};
const allStatuses = { requests: requestStatuses, quotes: quoteStatuses, projects: projectStatuses, invoices: invoiceStatuses };
export function lifecycleNumber(row: LifecycleRow) { return "calculationMode" in row ? row.quoteNumber : "requestNumber" in row ? row.requestNumber : "invoiceNumber" in row ? row.invoiceNumber : (row as ProjectRecord).projectNumber; }
export function lifecycleName(row: LifecycleRow) { return "companyName" in row ? row.companyName : row.clientName; }
export function lifecycleOwner(row: LifecycleRow) { return "assignedToName" in row ? row.assignedToName : row.assignedTo?.name ?? "Unassigned"; }
export function lifecycleMine(row: LifecycleRow, userId: string) {
  return Boolean(userId && (row.assignedToId === userId || ("collaborators" in row && row.collaborators.some(person => person.id === userId)) || ("currentStep" in row && row.currentStep?.assignee?.id === userId)));
}
export function lifecycleDefinition<T extends LifecycleRow>(kind: LifecycleKind, rows: T[]): ListDefinition<T> {
  const statuses = allStatuses[kind]; const open = openStatuses[kind];
  const isOpen = (row: T) => open.includes(row.status);
  const definition: ListDefinition<T> = {
    id: kind, label: kind === "invoices" ? "invoices" : kind,
    defaultView: "open", defaultSort: "activity", defaultDirection: "desc",
    views: [
      { key: "open", label: "All open", statuses: open, matches: isOpen },
      { key: "my", label: "My work", statuses: open, matches: (row, id) => isOpen(row) && lifecycleMine(row, id) },
      { key: "closed", label: "Closed", statuses: statuses.filter(status => !open.includes(status)), matches: row => !isOpen(row) },
      { key: "all", label: "All", matches: () => true }
    ],
    filters: [
      { key: "status", label: "Status", options: options(statuses), values: row => row.status },
      { key: "client", label: "Client", options: uniqueOptions(rows.map(row => ({ value: row.clientId || "__unassigned", label: lifecycleName(row) || "Unlinked client" }))), values: row => row.clientId },
      { key: "owner", label: "Assigned to", options: [{ value: "__me", label: "Assigned to me" }, { value: "__unassigned", label: "Unassigned" }, ...uniqueOptions(rows.filter(row => row.assignedToId).map(row => ({ value: row.assignedToId!, label: lifecycleOwner(row) })))], values: row => row.assignedToId }
    ],
    dates: [
      { key: "createdAt", label: "Created", value: row => row.createdAt },
      { key: "updatedAt", label: "Updated", value: row => row.updatedAt },
      { key: "dueDate", label: kind === "quotes" ? "Send-by" : kind === "requests" ? "Request deadline" : "Due", value: row => row.dueDate }
    ],
    sorts: [
      { key: "activity", label: "Updated", date: true, orderLabels: { asc: "Least recently updated", desc: "Most recently updated" }, value: row => "lastActivityAt" in row ? row.lastActivityAt || row.updatedAt : row.updatedAt, direction: "desc" },
      { key: kind === "requests" ? "request" : "number", label: "Record number", numeric: true, value: lifecycleNumber, direction: "desc" },
      { key: "due", label: kind === "quotes" ? "Send-by date" : "Due date", value: row => kind === "quotes" && "sentAt" in row && row.sentAt ? null : row.dueDate, direction: "asc", date: true }
    ],
    search: row => [lifecycleNumber(row), row.title, lifecycleName(row), lifecycleOwner(row), row.status, kind === "quotes" ? quoteStatusLabel(row.status) : "",
      "serviceCategories" in row ? row.serviceCategories.join(" ") : "trades" in row ? row.trades.join(" ") : "",
      "currentStep" in row ? row.currentStep?.title : "",
      "contactName" in row ? [row.contactName, row.siteName, row.siteAddress].join(" ") : ""].join(" "),
    rowId: row => row.id
  };
  if (kind === "requests") {
    definition.filters.push(
      { key: "priority", label: "Priority", options: options(requestPriorities), values: row => (row as RequestRecord).priority },
      { key: "category", label: "Category", options: options(serviceCategories), values: row => (row as RequestRecord).serviceCategories },
      { key: "source", label: "Source", options: options(requestSources), values: row => (row as RequestRecord).source }
    );
    definition.dates!.push({ key: "receivedDate", label: "Received", value: row => (row as RequestRecord).receivedDate });
    definition.sorts.push({ key: "priority", label: "Priority", orderLabels: { asc: "Low to urgent", desc: "Urgent first" }, value: row => ["Low", "Normal", "High", "Urgent"].indexOf((row as RequestRecord).priority), direction: "desc" });
  } else {
    definition.sorts.push({ key: "value", label: "Value", numeric: true, value: row => "total" in row ? row.total : "budget" in row ? row.budget : (row as InvoiceRecord).amount, direction: "desc" });
  }
  if (kind === "requests" || kind === "quotes") definition.dates!.push({ key: "nextAction", label: "Next-action target", value: row => "currentStep" in row ? row.currentStep?.targetDate : "" });
  if (kind === "quotes") {
    definition.filters[0] = { ...definition.filters[0], label: "Stage / outcome", options: statuses.map(value => ({ value, label: quoteStatusLabel(value) })) };
    definition.filters.unshift({ key: "group", label: "Lifecycle group", options: quoteLifecycleGroups.map(value => ({ value, label: quoteLifecycleGroupLabels[value], statuses: statuses.filter(status => quoteLifecycleGroup(status) === value) })), values: row => quoteLifecycleGroup(row.status) });
    definition.dates!.push({ key: "sentAt", label: "Sent", value: row => (row as QuoteRecord).sentAt });
    definition.views!.push({ key: "sent", label: "Sent", statuses: ["Sent"], matches: row => row.status === "Sent" }, { key: "completed", label: "Completed", statuses: statuses.filter(s => !open.includes(s)), matches: row => !isOpen(row) });
  }
  if (kind === "projects") {
    definition.dates!.push({ key: "startDate", label: "Start", value: row => (row as ProjectRecord).startDate });
    for (const [key, label, allowed] of [["active", "Active", ["Ready", "In Progress", "Field Work"]], ["hold", "On hold", ["On Hold"]], ["completed", "Completed", ["Completed"]], ["cancelled", "Cancelled", ["Cancelled"]]] as const)
      definition.views!.push({ key, label, statuses: allowed, matches: row => (allowed as readonly string[]).includes(row.status) });
  }
  if (kind === "invoices") {
    definition.dates!.push({ key: "issuedDate", label: "Issued", value: row => (row as InvoiceRecord).issuedDate });
    for (const [key, label] of [["paid", "Paid"], ["overdue", "Overdue"], ["void", "Void"]]) definition.views!.push({ key, label, statuses: [label], matches: row => row.status === label });
  }
  definition.sorts.push(
    { key: "created", label: "Created", date: true, direction: "desc", orderLabels: { asc: "Oldest first", desc: "Newest first" }, value: row => row.createdAt },
    { key: "client", label: "Client", value: lifecycleName },
    { key: "owner", label: "Assigned to", value: row => row.assignedToId ? lifecycleOwner(row) : null },
    { key: "status", label: "Status", orderLabels: { asc: "Workflow order", desc: "Reverse workflow order" }, value: row => statuses.indexOf(row.status as never) }
  );
  if (kind === "requests" || kind === "quotes") definition.sorts.splice(2, 0,
    { key: "nextAction", label: "Next-action target", date: true, direction: "asc", value: row => "currentStep" in row ? row.currentStep?.targetDate : null });
  if (kind === "requests") definition.sorts.push({ key: "received", label: "Received", date: true, direction: "desc", value: row => (row as RequestRecord).receivedDate });
  if (kind === "quotes") definition.sorts.push({ key: "sent", label: "Sent", date: true, direction: "desc", value: row => (row as QuoteRecord).sentAt });
  if (kind === "projects") definition.sorts.push({ key: "start", label: "Start date", date: true, direction: "asc", value: row => (row as ProjectRecord).startDate });
  if (kind === "invoices") definition.sorts.push({ key: "issued", label: "Issued", date: true, direction: "desc", value: row => (row as InvoiceRecord).issuedDate });
  return definition;
}
