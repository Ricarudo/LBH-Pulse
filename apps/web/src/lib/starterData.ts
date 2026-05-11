export type LeadRow = {
  id: string;
  title: string;
  customer: string;
  site: string;
  owner: string;
  status: "New" | "Qualified" | "Follow Up";
  due: string;
};

export type QuoteRow = {
  id: string;
  title: string;
  customer: string;
  status: "Draft" | "Waiting Approval" | "Approved";
  total: string;
  validUntil: string;
};

export const leads: LeadRow[] = [
  {
    id: "LD-1001",
    title: "Access control expansion",
    customer: "San Juan Medical Center",
    site: "North tower",
    owner: "Sales User",
    status: "Qualified",
    due: "2026-05-12"
  },
  {
    id: "LD-1002",
    title: "Fiber backbone assessment",
    customer: "Caribbean Logistics",
    site: "Bayamon warehouse",
    owner: "Project Manager User",
    status: "Follow Up",
    due: "2026-05-14"
  },
  {
    id: "LD-1003",
    title: "Camera replacement walk-through",
    customer: "Metro Retail Group",
    site: "Plaza location",
    owner: "Technician User",
    status: "New",
    due: "2026-05-16"
  }
];

export const quotes: QuoteRow[] = [
  {
    id: "QM260041",
    title: "Access control expansion",
    customer: "San Juan Medical Center",
    status: "Waiting Approval",
    total: "$42,850.00",
    validUntil: "2026-06-08"
  },
  {
    id: "QM260042",
    title: "Fiber backbone assessment",
    customer: "Caribbean Logistics",
    status: "Draft",
    total: "$18,420.00",
    validUntil: "2026-06-12"
  },
  {
    id: "QM260043",
    title: "Camera replacement walk-through",
    customer: "Metro Retail Group",
    status: "Approved",
    total: "$27,600.00",
    validUntil: "2026-06-15"
  }
];

export const activity = [
  {
    title: "Quote QM260041 sent to approval",
    detail: "Access control expansion for San Juan Medical Center"
  },
  {
    title: "Lead LD-1002 needs follow-up",
    detail: "Caribbean Logistics requested a revised site walk date"
  },
  {
    title: "Quote QM260043 approved",
    detail: "Ready for proposal/project handoff"
  }
];

export type WorkspaceRow = {
  id: string;
  title: string;
  customer: string;
  detail: string;
  owner: string;
  status: string;
  due: string;
  value?: string;
};

export const kpis = [
  {
    label: "Open Opportunities",
    value: "128",
    detail: "18% vs Apr 16 - May 15",
    tone: "blue",
    trend: [18, 22, 20, 26, 21, 24, 22, 31]
  },
  {
    label: "Active Quotes",
    value: "42",
    detail: "$1.26M in value",
    tone: "purple",
    trend: [12, 16, 23, 18, 19, 25, 31, 29, 33]
  },
  {
    label: "Projects in Progress",
    value: "26",
    detail: "2 vs last 2 weeks",
    tone: "green",
    trend: [8, 12, 14, 17, 14, 21, 19, 18]
  },
  {
    label: "Total Pipeline / Forecast",
    value: "$9.36M",
    detail: "16% vs Apr 16 - May 15",
    tone: "orange",
    trend: [14, 20, 17, 24, 22, 25, 24, 31]
  }
];

export const businessObjects = [
  {
    label: "Clients",
    detail: "Accounts, sites, contacts",
    count: "312",
    action: "View clients",
    href: "/clients",
    tone: "blue"
  },
  {
    label: "Leads",
    detail: "Prospects and opportunities",
    count: "214",
    action: "View leads",
    href: "/leads",
    tone: "green"
  },
  {
    label: "Quotes",
    detail: "Estimates and proposal outputs",
    count: "42",
    action: "View quotes",
    href: "/quotes",
    tone: "purple"
  },
  {
    label: "Projects",
    detail: "Tasks, closeout, job costing",
    count: "26",
    action: "View projects",
    href: "/projects",
    tone: "green"
  },
  {
    label: "Procurement",
    detail: "POs and vendor management",
    count: "37",
    action: "View POs",
    href: "/procurement",
    tone: "orange"
  },
  {
    label: "Field Ops",
    detail: "Labor tracking and field hours",
    count: "186",
    action: "View field ops",
    href: "/field",
    tone: "cyan"
  },
  {
    label: "Billing",
    detail: "Billing and collections",
    count: "64",
    action: "View invoices",
    href: "/billing",
    tone: "amber"
  }
];

export const lifecycle = [
  "Lead",
  "Quote",
  "Approved",
  "Project",
  "Procurement",
  "Field Work",
  "Billing"
];

export const priorities = [
  { label: "3 quotes awaiting approval", count: "3", tone: "danger" },
  { label: "2 projects waiting on materials", count: "2", tone: "orange" },
  { label: "5 follow-ups due", count: "5", tone: "blue" },
  { label: "1 invoice overdue", count: "1", tone: "danger" },
  { label: "4 technicians on active jobs", count: "4", tone: "green" }
];

export const crossObjectActivity = [
  {
    type: "QUOTE",
    text: "Quote Q-1082 generated proposal output P-220",
    time: "10:32 AM",
    tone: "purple"
  },
  {
    type: "QUOTE",
    text: "Proposal output P-220 approved for Banco Popular project",
    time: "9:58 AM",
    tone: "purple"
  },
  {
    type: "PROJECT",
    text: "PO-304 created from Project PRJ-118",
    time: "9:45 AM",
    tone: "green"
  },
  {
    type: "PO",
    text: "PO-304 sent to Apex Manufacturing",
    time: "9:20 AM",
    tone: "orange"
  },
  {
    type: "TIME",
    text: "Time entry submitted for Northfield upgrade",
    time: "8:55 AM",
    tone: "cyan"
  },
  {
    type: "INVOICE",
    text: "Invoice INV-901 sent to Northfield Industries",
    time: "8:30 AM",
    tone: "amber"
  }
];

export const projectRows: WorkspaceRow[] = [
  {
    id: "PRJ-118",
    title: "Banco Popular Tower",
    customer: "Banco Popular",
    detail: "Closeout and job costing review",
    owner: "David K.",
    status: "In Progress",
    due: "2026-06-02",
    value: "$284K"
  },
  {
    id: "PRJ-119",
    title: "Northfield Upgrade",
    customer: "Northfield Industries",
    detail: "Field work and punch list",
    owner: "Alex M.",
    status: "Field Work",
    due: "2026-05-28",
    value: "$96K"
  },
  {
    id: "PRJ-120",
    title: "Metro Retail Camera Refresh",
    customer: "Metro Retail Group",
    detail: "Procurement complete",
    owner: "Maria S.",
    status: "Ready",
    due: "2026-06-05",
    value: "$42K"
  }
];

export const procurementRows: WorkspaceRow[] = [
  {
    id: "PO-304",
    title: "Apex Manufacturing order",
    customer: "Banco Popular Tower",
    detail: "Access control panels and readers",
    owner: "Maria S.",
    status: "Sent",
    due: "Today",
    value: "$18.4K"
  },
  {
    id: "PO-305",
    title: "Fiber hardware bundle",
    customer: "Caribbean Logistics",
    detail: "Switches, SFPs, patch enclosures",
    owner: "Sales User",
    status: "Draft",
    due: "2026-05-20",
    value: "$11.7K"
  },
  {
    id: "PO-306",
    title: "Camera replacements",
    customer: "Metro Retail Group",
    detail: "Pending vendor confirmation",
    owner: "Project Manager User",
    status: "Waiting Vendor",
    due: "2026-05-22",
    value: "$9.2K"
  }
];

export const fieldRows: WorkspaceRow[] = [
  {
    id: "JOB-556",
    title: "Northfield site upgrade",
    customer: "Northfield Industries",
    detail: "Technicians on site",
    owner: "James L.",
    status: "On Site",
    due: "Today",
    value: "18 hrs"
  },
  {
    id: "JOB-557",
    title: "Warehouse fiber pull",
    customer: "Caribbean Logistics",
    detail: "Waiting on materials",
    owner: "Technician User",
    status: "Blocked",
    due: "2026-05-21",
    value: "32 hrs"
  },
  {
    id: "JOB-558",
    title: "Camera walk-through",
    customer: "Metro Retail Group",
    detail: "Survey scheduled",
    owner: "Alex M.",
    status: "Scheduled",
    due: "2026-05-24",
    value: "6 hrs"
  }
];

export const billingRows: WorkspaceRow[] = [
  {
    id: "INV-901",
    title: "Northfield progress invoice",
    customer: "Northfield Industries",
    detail: "Sent to customer",
    owner: "Sarah M.",
    status: "Sent",
    due: "Today",
    value: "$24.8K"
  },
  {
    id: "INV-902",
    title: "Banco Popular milestone billing",
    customer: "Banco Popular",
    detail: "Ready for review",
    owner: "David K.",
    status: "Review",
    due: "2026-05-19",
    value: "$76.0K"
  },
  {
    id: "INV-903",
    title: "Metro Retail deposit",
    customer: "Metro Retail Group",
    detail: "Overdue follow-up",
    owner: "Sales User",
    status: "Overdue",
    due: "2026-05-13",
    value: "$8.5K"
  }
];

export const commandRows = [
  {
    type: "QUOTE",
    ref: "Q-1082",
    description: "Northfield Industries",
    status: "Awaiting Approval",
    owner: "Alex M.",
    eta: "Today"
  },
  {
    type: "PROJECT",
    ref: "PRJ-118",
    description: "Banco Popular Tower",
    status: "In Progress",
    owner: "David K.",
    eta: "Jun 2"
  },
  {
    type: "PO",
    ref: "PO-304",
    description: "Apex Manufacturing",
    status: "Sent",
    owner: "Maria S.",
    eta: "Today"
  },
  {
    type: "FIELD",
    ref: "JOB-556",
    description: "Site - Northfield Upgrade",
    status: "On Site",
    owner: "James L.",
    eta: "On Site"
  },
  {
    type: "INVOICE",
    ref: "INV-901",
    description: "Northfield Industries",
    status: "Sent",
    owner: "Sarah M.",
    eta: "Today"
  }
];
