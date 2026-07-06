export type RequestRow = {
  id: string;
  title: string;
  customer: string;
  site: string;
  owner: string;
  status: "Received" | "Reviewing" | "Missing Info" | "Ready for Quote";
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

export const requests: RequestRow[] = [
  {
    id: "RQ-1001",
    title: "Access control expansion",
    customer: "San Juan Medical Center",
    site: "North tower",
    owner: "Sales User",
    status: "Ready for Quote",
    due: "2026-05-12"
  },
  {
    id: "RQ-1002",
    title: "Fiber backbone assessment",
    customer: "Caribbean Logistics",
    site: "Bayamon warehouse",
    owner: "Project Manager User",
    status: "Reviewing",
    due: "2026-05-14"
  },
  {
    id: "RQ-1003",
    title: "Camera replacement walk-through",
    customer: "Metro Retail Group",
    site: "Plaza location",
    owner: "Technician User",
    status: "Received",
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
    title: "Request RQ-1002 needs follow-up",
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
    detail: "Materials ready",
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
