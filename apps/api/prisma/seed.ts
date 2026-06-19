// @ts-nocheck
import { PrismaPg } from "@prisma/adapter-pg";
import { scryptSync } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  {
    connectionString: process.env.DATABASE_URL
  },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

function hashPassword(password, salt) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const testUsers = [
  {
    name: "Admin User",
    email: "admin@r2.local",
    role: "Admin",
    password: "PulseAdmin123!"
  },
  {
    name: "Sales User",
    email: "sales@r2.local",
    role: "Sales",
    password: "PulseSales123!"
  },
  {
    name: "Project Manager User",
    email: "project.manager@r2.local",
    role: "ProjectManager",
    password: "PulsePm123!"
  },
  {
    name: "Technician User",
    email: "technician@r2.local",
    role: "Technician",
    password: "PulseTech123!"
  }
];

const checklistTemplates = [
  {
    key: "general",
    name: "General Request Intake",
    items: [
      ["Client / company identified", "Core"],
      ["Contact information confirmed", "Core"],
      ["Site address confirmed", "Core"],
      ["Scope summary captured", "Scope"],
      ["Service category selected", "Scope"],
      ["Due date confirmed", "Schedule"],
      ["Files received, if applicable", "Files", false],
      ["Site visit decision made", "Site Visit"],
      ["Site visit completed", "Site Visit", true, "siteVisitRequired"],
      ["Internal owner assigned", "Ownership"]
    ]
  },
  {
    key: "fiber-install",
    name: "Fiber Install Intake",
    serviceCategory: "Fiber",
    items: [
      ["Client / company identified", "Core"],
      ["Contact information confirmed", "Core"],
      ["Site address confirmed", "Core"],
      ["Scope summary captured", "Scope"],
      ["MDF/IDF locations known", "Fiber Scope"],
      ["Pathway available or unknown identified", "Fiber Scope"],
      ["Drawings received", "Files"],
      ["Distance estimate available", "Fiber Scope"],
      ["Indoor/outdoor route confirmed", "Fiber Scope"],
      ["Aerial/trench/conduit requirement known", "Fiber Scope"],
      ["Due date confirmed", "Schedule"],
      ["Site visit decision made", "Site Visit"],
      ["Site visit completed", "Site Visit", true, "siteVisitRequired"],
      ["Internal owner assigned", "Ownership"]
    ]
  },
  {
    key: "access-control",
    name: "Access Control Intake",
    serviceCategory: "Access Control",
    items: [
      ["Client / company identified", "Core"],
      ["Contact information confirmed", "Core"],
      ["Site address confirmed", "Core"],
      ["Scope summary captured", "Scope"],
      ["Door count confirmed", "Access Control"],
      ["Door types confirmed", "Access Control"],
      ["Floor plan received", "Files"],
      ["Reader locations confirmed", "Access Control"],
      ["Locking hardware type known", "Access Control"],
      ["Fire alarm interface requirement confirmed", "Access Control"],
      ["Existing access platform identified", "Access Control"],
      ["Due date confirmed", "Schedule"],
      ["Site visit decision made", "Site Visit"],
      ["Site visit completed", "Site Visit", true, "siteVisitRequired"],
      ["Internal owner assigned", "Ownership"]
    ]
  },
  {
    key: "cctv-surveillance",
    name: "CCTV / Surveillance Intake",
    serviceCategory: "CCTV / Surveillance",
    items: [
      ["Client / company identified", "Core"],
      ["Contact information confirmed", "Core"],
      ["Site address confirmed", "Core"],
      ["Scope summary captured", "Scope"],
      ["Camera count confirmed", "CCTV"],
      ["Camera locations identified", "CCTV"],
      ["Mounting conditions known", "CCTV"],
      ["Network availability confirmed", "CCTV"],
      ["Power/PoE availability confirmed", "CCTV"],
      ["Recording requirement known", "CCTV"],
      ["Retention requirement known", "CCTV"],
      ["Drawings/photos received", "Files"],
      ["Due date confirmed", "Schedule"],
      ["Site visit decision made", "Site Visit"],
      ["Site visit completed", "Site Visit", true, "siteVisitRequired"],
      ["Internal owner assigned", "Ownership"]
    ]
  },
  {
    key: "structured-cabling",
    name: "Structured Cabling Intake",
    serviceCategory: "Structured Cabling",
    items: [
      ["Client / company identified", "Core"],
      ["Contact information confirmed", "Core"],
      ["Site address confirmed", "Core"],
      ["Scope summary captured", "Scope"],
      ["Outlet/drop count confirmed", "Cabling"],
      ["Floor plan/drawing received", "Files"],
      ["IDF/MDF location confirmed", "Cabling"],
      ["Cable category confirmed", "Cabling"],
      ["Pathway conditions known", "Cabling"],
      ["Ceiling/access conditions known", "Cabling"],
      ["Labeling standard confirmed", "Cabling"],
      ["Due date confirmed", "Schedule"],
      ["Site visit decision made", "Site Visit"],
      ["Site visit completed", "Site Visit", true, "siteVisitRequired"],
      ["Internal owner assigned", "Ownership"]
    ]
  },
  {
    key: "power-ups",
    name: "Power / UPS Intake",
    serviceCategory: "Power / UPS",
    items: [
      ["Client / company identified", "Core"],
      ["Contact information confirmed", "Core"],
      ["Site address confirmed", "Core"],
      ["Scope summary captured", "Scope"],
      ["UPS/battery model identified", "Power / UPS"],
      ["Current load confirmed", "Power / UPS"],
      ["Existing battery capacity confirmed", "Power / UPS"],
      ["Target runtime confirmed", "Power / UPS"],
      ["Electrical constraints confirmed", "Power / UPS"],
      ["Installation location confirmed", "Power / UPS"],
      ["Photos or equipment label received", "Files"],
      ["Due date confirmed", "Schedule"],
      ["Site visit decision made", "Site Visit"],
      ["Site visit completed", "Site Visit", true, "siteVisitRequired"],
      ["Internal owner assigned", "Ownership"]
    ]
  }
];

function checklistKeyFor(serviceCategory) {
  if (serviceCategory === "Fiber") return "fiber-install";
  if (serviceCategory === "Access Control") return "access-control";
  if (serviceCategory === "CCTV / Surveillance") return "cctv-surveillance";
  if (serviceCategory === "Structured Cabling") return "structured-cabling";
  if (serviceCategory === "Power / UPS") return "power-ups";
  return "general";
}

const sampleRequests = [
  {
    requestNumber: "RQ-2026-1001",
    name: "Surveillance system upgrade",
    companyName: "Northfield Industries",
    contactName: "Elena Cruz",
    contactTitle: "Facilities Director",
    email: "ecruz@northfield.example",
    phone: "787-555-0148",
    requestType: "Quote Request",
    source: "Existing Client",
    serviceCategory: "CCTV / Surveillance",
    siteName: "Main manufacturing campus",
    siteAddress: "Road 2 KM 17.4",
    city: "Guaynabo",
    state: "PR",
    status: "Ready for Quote",
    priority: "High",
    assignedOwner: "Admin User",
    dueDate: new Date("2026-05-13T12:00:00.000Z"),
    nextAction: "Create quote workspace",
    nextFollowUpAt: new Date("2026-05-12T14:00:00.000Z"),
    missingInfo: null,
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "Customer wants to replace aging cameras and improve remote viewing across warehouse entrances.",
    internalNotes: "Ready for quote intake review.",
    lastActivityAt: new Date("2026-05-09T14:32:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Site address confirmed",
      "Scope summary captured",
      "Service category selected",
      "Camera count confirmed",
      "Camera locations identified",
      "Mounting conditions known",
      "Network availability confirmed",
      "Power/PoE availability confirmed",
      "Recording requirement known",
      "Retention requirement known",
      "Drawings/photos received",
      "Due date confirmed",
      "Site visit decision made",
      "Internal owner assigned"
    ],
    tasks: [
      {
        title: "Confirm camera count and recording retention target",
        dueAt: new Date("2026-05-12T14:00:00.000Z"),
        owner: "Alex Morgan"
      }
    ],
    attachments: ["camera-markups.jpg"],
    activities: [
      {
        type: "Status",
        title: "Request ready for quote",
        body: "Site contact and intake details confirmed.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T14:32:00.000Z")
      }
    ]
  },
  {
    requestNumber: "RQ-2026-1002",
    name: "Access control expansion",
    companyName: "San Juan Medical Center",
    contactName: "Mariela Torres",
    contactTitle: "Security Manager",
    email: "mtorres@sjmc.example",
    phone: "787-555-0199",
    requestType: "Site Visit Request",
    source: "Existing Client",
    serviceCategory: "Access Control",
    siteName: "North tower",
    siteAddress: "Avenida Ponce de Leon 1510",
    city: "San Juan",
    state: "PR",
    status: "Site Visit Required",
    priority: "High",
    assignedOwner: "Sales User",
    dueDate: new Date("2026-05-14T15:00:00.000Z"),
    nextAction: "Schedule north tower site walk",
    nextFollowUpAt: new Date("2026-05-14T15:00:00.000Z"),
    missingInfo: "Door count and access-control panel details",
    siteVisitNeeded: true,
    siteVisitCompleted: false,
    description: "Badge reader expansion and door monitoring for two floors. Needs site walk before estimating.",
    internalNotes: "Coordinate visit windows with hospital facilities.",
    lastActivityAt: new Date("2026-05-08T13:58:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Site address confirmed",
      "Scope summary captured",
      "Service category selected",
      "Due date confirmed",
      "Site visit decision made",
      "Internal owner assigned"
    ],
    tasks: [
      {
        title: "Schedule north tower site walk",
        dueAt: new Date("2026-05-14T15:00:00.000Z"),
        owner: "Project Manager User"
      }
    ],
    attachments: ["north-tower-door-list.pdf"],
    activities: [
      {
        type: "Follow-up",
        title: "Follow-up requested",
        body: "Facilities team asked for visit windows next week.",
        actor: "Project Manager User",
        createdAt: new Date("2026-05-08T13:58:00.000Z")
      }
    ]
  },
  {
    requestNumber: "RQ-2026-1003",
    name: "Structured cabling project",
    companyName: "Municipality Facilities Office",
    contactName: "Rafael Ortiz",
    contactTitle: "Procurement Lead",
    email: "rortiz@municipality.example",
    phone: "787-555-0188",
    requestType: "RFP / Bid",
    source: "RFP",
    serviceCategory: "Structured Cabling",
    siteName: "Municipal services building",
    siteAddress: "Calle Munoz Rivera 44",
    city: "Caguas",
    state: "PR",
    status: "Received",
    priority: "Urgent",
    assignedOwner: "Unassigned",
    dueDate: new Date("2026-05-10T12:00:00.000Z"),
    nextAction: "Assign owner and review bid package",
    nextFollowUpAt: new Date("2026-05-10T12:00:00.000Z"),
    missingInfo: "Bid addenda and fiber riser drawings",
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "Bid docs need review. Deadline is tight and scope may include fiber risers.",
    internalNotes: "Needs qualification before estimating team spends time.",
    lastActivityAt: new Date("2026-05-09T12:30:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Service category selected"
    ],
    tasks: [
      {
        title: "Assign owner and review bid package",
        dueAt: new Date("2026-05-10T12:00:00.000Z"),
        owner: "Unassigned"
      }
    ],
    attachments: ["bid-package.pdf"],
    activities: [
      {
        type: "Note",
        title: "Bid package received",
        body: "Needs qualification before estimating team spends time.",
        actor: "Admin User",
        createdAt: new Date("2026-05-09T12:30:00.000Z")
      }
    ]
  },
  {
    requestNumber: "RQ-2026-1004",
    name: "AV conference room upgrade",
    companyName: "Banco Popular Tower",
    contactName: "Daniela Perez",
    contactTitle: "Workplace Technology Manager",
    email: "dperez@bancopopular.example",
    phone: "787-555-0172",
    requestType: "General Inquiry",
    source: "Website",
    serviceCategory: "AV",
    siteName: "Executive conference center",
    siteAddress: "209 Munoz Rivera Avenue",
    city: "San Juan",
    state: "PR",
    status: "Missing Info",
    priority: "Normal",
    assignedOwner: "Sales User",
    dueDate: new Date("2026-05-16T14:00:00.000Z"),
    nextAction: "Send discovery checklist",
    nextFollowUpAt: new Date("2026-05-16T14:00:00.000Z"),
    missingInfo: "Room dimensions and preferred meeting platform",
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "Customer wants a modern conferencing room with camera, display, microphones, and simple controls.",
    internalNotes: "Customer prefers a phased design if budget is constrained.",
    lastActivityAt: new Date("2026-05-08T20:45:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Site address confirmed",
      "Service category selected",
      "Due date confirmed",
      "Site visit decision made",
      "Internal owner assigned"
    ],
    tasks: [
      {
        title: "Send discovery checklist",
        dueAt: new Date("2026-05-16T14:00:00.000Z"),
        owner: "Sales User"
      }
    ],
    attachments: [],
    activities: [
      {
        type: "Note",
        title: "Website inquiry captured",
        body: "Customer prefers a phased design if budget is constrained.",
        actor: "Sales User",
        createdAt: new Date("2026-05-08T20:45:00.000Z")
      }
    ]
  },
  {
    requestNumber: "RQ-2026-1005",
    name: "Fiber backbone installation",
    companyName: "Caribbean Logistics",
    contactName: "Hector Rivera",
    contactTitle: "Operations Manager",
    email: "hrivera@cariblog.example",
    phone: "787-555-0112",
    requestType: "Drawing Review",
    source: "Drawing Package",
    serviceCategory: "Fiber",
    siteName: "Bayamon warehouse",
    siteAddress: "Industrial Park Lot 5",
    city: "Bayamon",
    state: "PR",
    status: "Reviewing",
    priority: "Normal",
    assignedOwner: "Admin User",
    dueDate: new Date("2026-05-15T16:00:00.000Z"),
    nextAction: "Complete fiber material takeoff",
    nextFollowUpAt: new Date("2026-05-15T16:00:00.000Z"),
    missingInfo: null,
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "Warehouse needs fiber backbone between MDF and two IDFs. Site walk complete.",
    internalNotes: "Site walk notes are ready for quote intake review.",
    lastActivityAt: new Date("2026-05-09T16:10:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Site address confirmed",
      "Scope summary captured",
      "MDF/IDF locations known",
      "Pathway available or unknown identified",
      "Drawings received",
      "Distance estimate available",
      "Due date confirmed",
      "Site visit decision made",
      "Internal owner assigned"
    ],
    tasks: [
      {
        title: "Complete fiber material takeoff",
        dueAt: new Date("2026-05-15T16:00:00.000Z"),
        owner: "Project Manager User"
      }
    ],
    attachments: ["warehouse-fiber-path.pdf"],
    activities: [
      {
        type: "Status",
        title: "Moved to review",
        body: "Site walk notes are ready for quote intake review.",
        actor: "Project Manager User",
        createdAt: new Date("2026-05-09T16:10:00.000Z")
      }
    ]
  },
  {
    requestNumber: "RQ-2026-1006",
    name: "Network refresh",
    companyName: "Coastal Hospitality Group",
    contactName: "Sofia Morales",
    contactTitle: "IT Coordinator",
    email: "smorales@coastalhospitality.example",
    phone: "787-555-0166",
    requestType: "Quote Request",
    source: "Call",
    serviceCategory: "Networking",
    siteName: "Condado hotel",
    siteAddress: "Ashford Avenue 1102",
    city: "San Juan",
    state: "PR",
    status: "Converted to Quote",
    priority: "High",
    assignedOwner: "Sales User",
    dueDate: new Date("2026-05-13T13:30:00.000Z"),
    nextAction: "Create quote workspace for network refresh",
    nextFollowUpAt: new Date("2026-05-13T13:30:00.000Z"),
    missingInfo: null,
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "Replace access switches and clean up rack power. Customer requested proposal this week.",
    internalNotes: "Customer asked for a proposal by Friday.",
    lastActivityAt: new Date("2026-05-09T18:05:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Site address confirmed",
      "Scope summary captured",
      "Service category selected",
      "Due date confirmed",
      "Files received, if applicable",
      "Site visit decision made",
      "Internal owner assigned"
    ],
    tasks: [
      {
        title: "Create quote placeholder for network refresh",
        dueAt: new Date("2026-05-13T13:30:00.000Z"),
        owner: "Alex Morgan"
      }
    ],
    attachments: [],
    activities: [
      {
        type: "Status",
        title: "Ready for quote workspace",
        body: "Customer asked for a proposal by Friday.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T18:05:00.000Z")
      }
    ]
  },
  {
    requestNumber: "RQ-2026-1007",
    name: "Small residential camera repair",
    companyName: "Private Residence",
    contactName: "Luis Santiago",
    contactTitle: "Owner",
    email: "lsantiago@example.test",
    phone: "787-555-0107",
    requestType: "Service-Related Quote",
    source: "Call",
    serviceCategory: "Service / Support",
    siteName: "Residence",
    siteAddress: "Calle Luna 12",
    city: "San Juan",
    state: "PR",
    status: "No Bid",
    priority: "Low",
    assignedOwner: "Sales User",
    dueDate: new Date("2026-05-17T12:00:00.000Z"),
    nextAction: "No bid - outside current service profile",
    nextFollowUpAt: null,
    missingInfo: null,
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "One-off residential troubleshooting request. R2 is not pursuing this scope.",
    internalNotes: "No bid because this is outside current commercial service focus.",
    lastActivityAt: new Date("2026-05-09T19:05:00.000Z"),
    checklistCompleted: [
      "Client / company identified",
      "Contact information confirmed",
      "Site address confirmed",
      "Scope summary captured",
      "Service category selected",
      "Due date confirmed",
      "Site visit decision made",
      "Internal owner assigned"
    ],
    tasks: [],
    attachments: [],
    activities: [
      {
        type: "Status",
        title: "No bid decision",
        body: "Request closed without quote because the scope is outside target work.",
        actor: "Sales User",
        createdAt: new Date("2026-05-09T19:05:00.000Z")
      }
    ]
  }
];

const sampleClients = [
  {
    clientNumber: "CL-1001",
    companyName: "San Juan Medical Center",
    industry: "Healthcare",
    status: "Active",
    accountOwner: "Alex Morgan",
    source: "Existing Customer",
    importantNotes:
      "Badge access work requires hospital security approval before scheduling. Avoid noisy work before 6 PM in patient areas.",
    openOpportunities: 2,
    activeProjects: 1,
    lifetimeValue: 486200,
    outstandingBalance: 24800,
    lastActivityAt: new Date("2026-05-09T14:32:00.000Z"),
    contacts: [
      {
        role: "Primary",
        name: "Mariela Torres",
        title: "Security Manager",
        email: "mtorres@sjmc.example",
        phone: "787-555-0148",
        isPrimary: true
      },
      {
        role: "Billing",
        name: "Victor Ramos",
        title: "Accounts Payable",
        email: "ap@sjmc.example",
        phone: "787-555-0133",
        isBilling: true
      }
    ],
    sites: [
      {
        name: "North tower",
        address: "Avenida Ponce de Leon 1510",
        city: "San Juan",
        state: "PR",
        status: "Active"
      },
      {
        name: "Outpatient clinic",
        address: "Calle del Parque 42",
        city: "San Juan",
        state: "PR",
        status: "Planning"
      }
    ],
    services: ["Access Control", "CCTV / Cameras", "Structured Cabling"],
    activities: [
      {
        type: "Request",
        title: "Access control expansion qualified",
        detail: "Door count review requested for two floors.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T14:32:00.000Z")
      },
      {
        type: "Billing",
        title: "Progress invoice sent",
        detail: "Invoice INV-881 sent to AP contact.",
        actor: "Sarah M.",
        createdAt: new Date("2026-05-03T14:00:00.000Z")
      }
    ]
  },
  {
    clientNumber: "CL-1002",
    companyName: "Caribbean Logistics",
    industry: "Manufacturing",
    status: "Active",
    accountOwner: "Project Manager User",
    source: "Referral",
    importantNotes:
      "Warehouse access requires 24-hour notice and safety vest sign-in. Fiber backbone work likely needs a weekend window.",
    openOpportunities: 1,
    activeProjects: 1,
    lifetimeValue: 192400,
    outstandingBalance: 0,
    lastActivityAt: new Date("2026-05-08T13:58:00.000Z"),
    contacts: [
      {
        role: "Primary",
        name: "Hector Rivera",
        title: "Operations Manager",
        email: "hrivera@cariblog.example",
        phone: "787-555-0199",
        isPrimary: true
      },
      {
        role: "Billing",
        name: "Nadia Colon",
        title: "Controller",
        email: "billing@cariblog.example",
        phone: "787-555-0120",
        isBilling: true
      }
    ],
    sites: [
      {
        name: "Bayamon warehouse",
        address: "Industrial Park Lot 5",
        city: "Bayamon",
        state: "PR",
        status: "Active"
      }
    ],
    services: ["Fiber", "Network", "Structured Cabling"],
    activities: [
      {
        type: "Follow-up",
        title: "Fiber site visit requested",
        detail: "Customer asked for available visit windows next week.",
        actor: "Project Manager User",
        createdAt: new Date("2026-05-08T13:58:00.000Z")
      }
    ]
  },
  {
    clientNumber: "CL-1003",
    companyName: "Metro Retail Group",
    industry: "Retail",
    status: "Prospect",
    accountOwner: "Sales User",
    source: "Phone",
    importantNotes:
      "Likely multi-site opportunity if the first camera replacement walk-through goes well.",
    openOpportunities: 1,
    activeProjects: 0,
    lifetimeValue: 27600,
    outstandingBalance: 0,
    lastActivityAt: new Date("2026-05-08T20:45:00.000Z"),
    contacts: [
      {
        role: "Primary",
        name: "Lucia Martinez",
        title: "Regional Manager",
        email: "lmartinez@metroretail.example",
        phone: "787-555-0172",
        isPrimary: true,
        isBilling: true
      }
    ],
    sites: [
      {
        name: "Plaza location",
        address: "PR-20 retail plaza",
        city: "Guaynabo",
        state: "PR",
        status: "Planning"
      },
      {
        name: "Caguas store",
        address: "Avenida Gautier Benitez 120",
        city: "Caguas",
        state: "PR",
        status: "Dormant"
      }
    ],
    services: ["CCTV / Cameras", "Security"],
    activities: [
      {
        type: "Request",
        title: "Camera walk-through captured",
        detail: "Customer wants replacement options and better remote viewing.",
        actor: "Sales User",
        createdAt: new Date("2026-05-08T20:45:00.000Z")
      }
    ]
  },
  {
    clientNumber: "CL-1004",
    companyName: "Banco Popular Tower",
    industry: "Finance",
    status: "Active",
    accountOwner: "Alex Morgan",
    source: "Existing Customer",
    importantNotes:
      "Procurement prefers formal proposal documents and clear milestone billing schedules.",
    openOpportunities: 1,
    activeProjects: 1,
    lifetimeValue: 284000,
    outstandingBalance: 76000,
    lastActivityAt: new Date("2026-05-09T16:30:00.000Z"),
    contacts: [
      {
        role: "Primary",
        name: "Daniela Perez",
        title: "Workplace Technology Manager",
        email: "dperez@bancopopular.example",
        phone: "787-555-0180",
        isPrimary: true
      },
      {
        role: "Billing",
        name: "Sarah Mendez",
        title: "Procurement Analyst",
        email: "procurement@bancopopular.example",
        phone: "787-555-0181",
        isBilling: true
      }
    ],
    sites: [
      {
        name: "Executive conference center",
        address: "209 Munoz Rivera Avenue",
        city: "San Juan",
        state: "PR",
        status: "Active"
      }
    ],
    services: ["AV", "Network", "Access Control"],
    activities: [
      {
        type: "Billing",
        title: "Milestone billing ready for review",
        detail: "Invoice INV-902 prepared for internal check.",
        actor: "Sarah M.",
        createdAt: new Date("2026-05-09T16:30:00.000Z")
      }
    ]
  },
  {
    clientNumber: "CL-1005",
    companyName: "Coastal Hospitality Group",
    industry: "Hospitality",
    status: "On Hold",
    accountOwner: "Sales User",
    source: "Phone",
    importantNotes:
      "Payment follow-up is needed before new work is scheduled. Customer still wants a network refresh proposal.",
    openOpportunities: 1,
    activeProjects: 0,
    lifetimeValue: 52400,
    outstandingBalance: 8500,
    lastActivityAt: new Date("2026-05-09T18:05:00.000Z"),
    contacts: [
      {
        role: "Primary",
        name: "Sofia Morales",
        title: "IT Coordinator",
        email: "smorales@coastalhospitality.example",
        phone: "787-555-0166",
        isPrimary: true
      },
      {
        role: "Billing",
        name: "Javier Lugo",
        title: "Finance Manager",
        email: "finance@coastalhospitality.example",
        phone: "787-555-0168",
        isBilling: true
      }
    ],
    sites: [
      {
        name: "Condado hotel",
        address: "Ashford Avenue 1102",
        city: "San Juan",
        state: "PR",
        status: "Active"
      }
    ],
    services: ["Network", "Structured Cabling"],
    activities: [
      {
        type: "Request",
        title: "Network refresh ready for quote",
        detail: "Customer requested proposal this week.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T18:05:00.000Z")
      }
    ]
  }
];

async function main() {
  await prisma.activity.deleteMany();
  await prisma.requestChecklistItem.deleteMany();
  await prisma.lifecycleDocument.deleteMany();
  await prisma.requestNote.deleteMany();
  await prisma.requestTask.deleteMany();
  await prisma.requestActivity.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.project.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestChecklistTemplateItem.deleteMany();
  await prisma.requestChecklistTemplate.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.localUser.deleteMany();

  await prisma.clientActivity.deleteMany();
  await prisma.clientService.deleteMany();
  await prisma.clientSite.deleteMany();
  await prisma.pointOfContact.deleteMany();
  await prisma.client.deleteMany();

  const seededUsers = await Promise.all(
    testUsers.map((user) =>
      prisma.localUser.create({
        data: {
          name: user.name,
          email: user.email,
          role: user.role,
          passwordHash: hashPassword(user.password, user.email),
          active: true,
          mustChangePassword: false,
          authProvider: "LOCAL"
        }
      })
    )
  );

  const usersByName = new Map(seededUsers.map((user) => [user.name, user]));
  const fallbackActor = usersByName.get("Admin User") || seededUsers[0];

  function actorFor(name) {
    return usersByName.get(name) || fallbackActor;
  }

  const seededTemplates = new Map();
  for (const template of checklistTemplates) {
    const createdTemplate = await prisma.requestChecklistTemplate.create({
      data: {
        key: template.key,
        name: template.name,
        requestType: template.requestType ?? null,
        serviceCategory: template.serviceCategory ?? null,
        items: {
          create: template.items.map(([label, group, required = true, appliesWhen], index) => ({
            label,
            group,
            required,
            appliesWhen: appliesWhen ?? null,
            sortOrder: index + 1
          }))
        }
      },
      include: {
        items: true
      }
    });
    seededTemplates.set(template.key, createdTemplate);
  }

  async function createActivity({
    relatedEntityType,
    relatedEntityId,
    actorName,
    type,
    title,
    detail,
    createdAt,
    metadata
  }) {
    const actor = actorFor(actorName);

    await prisma.activity.create({
      data: {
        relatedEntityType,
        relatedEntityId,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        type,
        title,
        detail: detail ?? null,
        metadata: metadata ?? undefined,
        createdAt: createdAt ?? new Date()
      }
    });
  }

  for (const client of sampleClients) {
    const createdClient = await prisma.client.create({
      data: {
        clientNumber: client.clientNumber,
        legalName: client.legalName ?? client.companyName,
        displayName: client.displayName ?? client.companyName,
        industry: client.industry,
        website: client.website ?? null,
        status: client.status,
        accountOwner: client.accountOwner,
        taxId: client.taxId ?? null,
        paymentTerms: client.paymentTerms ?? "Net 30",
        preferredCurrency: client.preferredCurrency ?? "USD",
        preferredLanguage: client.preferredLanguage ?? "English",
        brandPreferences: client.brandPreferences ?? null,
        technologyPreferences: client.technologyPreferences ?? null,
        generalNotes: client.importantNotes,
        preferredVendors: client.preferredVendors ?? null,
        preferredCameraBrand: client.preferredCameraBrand ?? null,
        preferredAccessControlBrand: client.preferredAccessControlBrand ?? null,
        preferredNetworkBrand: client.preferredNetworkBrand ?? null,
        preferredCablingBrand: client.preferredCablingBrand ?? null,
        standardTechnologies: client.standardTechnologies ?? null,
        documentationRequirements: client.documentationRequirements ?? null,
        invoiceRequirements: client.invoiceRequirements ?? null,
        insuranceRequirements: client.insuranceRequirements ?? null,
        purchaseOrderRequired: client.purchaseOrderRequired ?? false,
        source: client.source,
        openOpportunities: client.openOpportunities,
        activeProjects: client.activeProjects,
        lifetimeValue: client.lifetimeValue,
        outstandingBalance: client.outstandingBalance,
        lastActivityAt: client.lastActivityAt,
        sites: {
          create: client.sites.map((site, index) => ({
            siteName: site.name,
            siteType: site.siteType ?? "Main Office",
            addressLine1: site.address,
            city: site.city,
            state: site.state ?? "PR",
            country: site.country ?? "Puerto Rico",
            googleMapsUrl: site.googleMapsUrl ?? null,
            operationalHours: site.operationalHours ?? null,
            accessInstructions: site.accessInstructions ?? null,
            parkingInstructions: site.parkingInstructions ?? null,
            securityRequirements: site.securityRequirements ?? null,
            siteNotes: site.siteNotes ?? null,
            isPrimarySite: site.isPrimarySite ?? index === 0
          }))
        },
        services: {
          create: client.services.map((serviceName) => ({ serviceName }))
        },
        activities: {
          create: client.activities
        }
      }
    });

    await Promise.all(
      client.contacts.map((contact, index) => {
        const [firstName, ...rest] = contact.name.split(" ");

        return prisma.pointOfContact.create({
          data: {
            ownerType: "Client",
            ownerId: createdClient.id,
            clientId: createdClient.id,
            role: contact.role,
            name: contact.name,
            firstName: firstName || "Unknown",
            lastName: rest.join(" "),
            title: contact.title,
            department: contact.department ?? null,
            email: contact.email,
            phone: contact.phone,
            mobile: contact.mobile ?? null,
            preferredContactMethod: contact.preferredContactMethod ?? "Email",
            isPrimary: contact.isPrimary ?? index === 0,
            isBilling: contact.isBilling ?? false,
            isPrimaryContact: contact.isPrimary ?? index === 0,
            isBillingContact: contact.isBilling ?? false,
            isTechnicalContact: contact.isTechnicalContact ?? false,
            isDecisionMaker: contact.isDecisionMaker ?? false,
            notes: contact.notes ?? null
          }
        });
      })
    );

    await createActivity({
      relatedEntityType: "Client",
      relatedEntityId: createdClient.id,
      actorName: client.activities[0]?.actor || client.accountOwner,
      type: "Created",
      title: `${createdClient.displayName} seeded`,
      detail: "Starter client record created for workstation CRM testing.",
      createdAt: client.lastActivityAt,
      metadata: { clientNumber: createdClient.clientNumber }
    });
  }


  const northfield = await prisma.client.create({
    data: {
      clientNumber: "CL-1006",
      legalName: "Northfield Industries",
      displayName: "Northfield Industries",
      industry: "Manufacturing",
      status: "Active",
      accountOwner: "Alex Morgan",
      paymentTerms: "Net 30",
      preferredCurrency: "USD",
      preferredLanguage: "English",
      source: "Existing Client",
      lifetimeValue: 192400,
      sites: {
        create: {
          siteName: "Main manufacturing campus",
          siteType: "Manufacturing",
          addressLine1: "Road 2 KM 17.4",
          city: "Guaynabo",
          state: "PR",
          country: "Puerto Rico",
          isPrimarySite: true
        }
      },
      services: {
        create: [
          { serviceName: "CCTV / Cameras" },
          { serviceName: "Network" }
        ]
      }
    }
  });
  await prisma.pointOfContact.create({
    data: {
      ownerType: "Client",
      ownerId: northfield.id,
      clientId: northfield.id,
      role: "Primary",
      name: "Elena Cruz",
      firstName: "Elena",
      lastName: "Cruz",
      title: "Facilities Director",
      email: "ecruz@northfield.example",
      phone: "787-555-0148",
      preferredContactMethod: "Email",
      isPrimary: true,
      isPrimaryContact: true
    }
  });


  const clientsWithDirectory = await prisma.client.findMany({
    include: { contacts: true, sites: true }
  });
  const clientsByName = new Map(
    clientsWithDirectory.map((client) => [client.displayName, client])
  );

  for (const request of sampleRequests) {
    const assignedUser =
      request.assignedOwner === "Unassigned"
        ? null
        : usersByName.get(request.assignedOwner) || null;
    const template = seededTemplates.get(checklistKeyFor(request.serviceCategory)) || seededTemplates.get("general");
    const completedItems = new Set(request.checklistCompleted ?? []);
    const requestActor = actorFor(request.activities[0]?.actor);
    const linkedClient = clientsByName.get(request.companyName);
    const linkedContact = linkedClient?.contacts.find(
      (contact) => contact.email?.toLowerCase() === request.email.toLowerCase()
    );
    const linkedSite = linkedClient?.sites.find(
      (site) => site.siteName.toLowerCase() === request.siteName.toLowerCase()
    );

    const createdRequest = await prisma.request.create({
      data: {
        requestNumber: request.requestNumber,
        title: request.name,
        requestType: request.requestType,
        source: request.source,
        serviceCategory: request.serviceCategory,
        status: request.status,
        priority: request.priority,
        companyName: request.companyName,
        contactName: request.contactName,
        contactEmail: request.email,
        contactPhone: request.phone,
        siteName: request.siteName,
        siteAddress: request.siteAddress,
        city: request.city,
        state: request.state,
        clientId: linkedClient?.id,
        contactId: linkedContact?.id,
        siteId: linkedSite?.id,
        assignedToId: assignedUser?.id ?? null,
        createdById: requestActor.id,
        receivedDate: request.lastActivityAt,
        dueDate: request.dueDate,
        nextAction: request.nextAction,
        nextFollowUpAt: request.nextFollowUpAt,
        missingInfo: request.missingInfo,
        siteVisitNeeded: request.siteVisitNeeded,
        siteVisitCompleted: request.siteVisitCompleted,
        description: request.description,
        internalNotes: request.internalNotes,
        checklistTemplateId: template?.id,
        checklistTemplateNameSnapshot: template?.name,
        lastActivityAt: request.lastActivityAt,
        checklistItems: {
          create: template.items.map((item) => {
            const completed = completedItems.has(item.label);
            return {
              templateItemId: item.id,
              label: item.label,
              description: item.description,
              required: item.required,
              appliesWhen: item.appliesWhen,
              sortOrder: item.sortOrder,
              group: item.group,
              completed,
              completedAt: completed ? request.lastActivityAt : null,
              completedById: completed ? requestActor.id : null,
              completedByNameSnapshot: completed ? requestActor.name : null
            };
          })
        },
        tasks: {
          create: request.tasks
        },
        activities: {
          create: request.activities
        },
        notesList: {
          create: {
            body: request.internalNotes || request.description,
            actor: request.activities[0]?.actor ?? "Pulse User",
            createdAt: request.lastActivityAt
          }
        }
      }
    });

    if (request.attachments.length) {
      await prisma.lifecycleDocument.createMany({
        data: request.attachments.map((fileName) => ({
          requestId: createdRequest.id,
          originalFileName: fileName,
          category: "Unverified Legacy",
          scanStatus: "Legacy",
          scanMessage:
            "This filename-only seed record has no stored object and is not downloadable.",
          uploadedByName: "Seed Data",
          createdAt: request.lastActivityAt
        }))
      });
    }

    await createActivity({
      relatedEntityType: "Request",
      relatedEntityId: createdRequest.id,
      actorName: request.activities[0]?.actor || request.assignedOwner,
      type: "Created",
      title: `${createdRequest.requestNumber} seeded`,
      detail: createdRequest.title,
      createdAt: request.lastActivityAt,
      metadata: {
        requestNumber: createdRequest.requestNumber,
        status: createdRequest.status
      }
    });
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      number: "OPP-2026-1001",
      name: "San Juan Medical Center access control expansion",
      clientName: "San Juan Medical Center",
      status: "Site Visit",
      owner: "Project Manager User",
      value: 42850,
      createdAt: new Date("2026-05-09T15:00:00.000Z")
    }
  });

  await createActivity({
    relatedEntityType: "Opportunity",
    relatedEntityId: opportunity.id,
    actorName: "Project Manager User",
    type: "Created",
    title: `${opportunity.number} created`,
    detail: opportunity.name,
    createdAt: new Date("2026-05-09T15:00:00.000Z"),
    metadata: { status: opportunity.status, value: Number(opportunity.value) }
  });

  const quote = await prisma.quote.create({
    data: {
      quoteNumber: "QT-2026-1001",
      title: "Coastal Hospitality network refresh",
      clientId: clientsByName.get("Coastal Hospitality Group")?.id,
      clientName: "Coastal Hospitality Group",
      status: "Draft",
      owner: "Sales User",
      total: 52400,
      createdAt: new Date("2026-05-09T18:30:00.000Z")
    }
  });

  await prisma.request.updateMany({
    where: { companyName: "Coastal Hospitality Group", status: "Converted to Quote" },
    data: { relatedQuoteId: quote.id }
  });

  const seededProjects = await Promise.all([
    ["PRJ-118", "Banco Popular Tower", "Banco Popular Tower", "David K.", "In Progress", 284000, "2026-06-02"],
    ["PRJ-119", "Northfield Upgrade", "Northfield Industries", "Alex M.", "Field Work", 96000, "2026-05-28"],
    ["PRJ-120", "Metro Retail Camera Refresh", "Metro Retail Group", "Maria S.", "Ready", 42000, "2026-06-05"]
  ].map(([projectNumber, title, clientName, owner, status, budget, dueDate]) => {
    const client = clientsByName.get(clientName);
    if (!client) return null;
    return prisma.project.create({
      data: { projectNumber, title, clientId: client.id, owner, status, budget, dueDate: new Date(`${dueDate}T12:00:00.000Z`) }
    });
  }));
  const projectsByNumber = new Map(
    seededProjects.filter(Boolean).map((project) => [project.projectNumber, project])
  );

  await Promise.all([
    ["INV-901", "Northfield progress invoice", "Northfield Industries", "PRJ-119", "Sarah M.", "Sent", 24800, "2026-05-20"],
    ["INV-902", "Banco Popular milestone billing", "Banco Popular Tower", "PRJ-118", "David K.", "Review", 76000, "2026-05-19"],
    ["INV-903", "Metro Retail deposit", "Metro Retail Group", "PRJ-120", "Sales User", "Overdue", 8500, "2026-05-13"]
  ].map(([invoiceNumber, title, clientName, projectNumber, owner, status, amount, dueDate]) => {
    const client = clientsByName.get(clientName);
    if (!client) return null;
    return prisma.invoice.create({
      data: { invoiceNumber, title, clientId: client.id, projectId: projectsByNumber.get(projectNumber)?.id, owner, status, amount, dueDate: new Date(`${dueDate}T12:00:00.000Z`) }
    });
  }));

  await createActivity({
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    actorName: "Sales User",
    type: "Quote Created",
    title: `${quote.quoteNumber} drafted`,
    detail: quote.title,
    createdAt: new Date("2026-05-09T18:30:00.000Z"),
    metadata: { status: quote.status, total: Number(quote.total) }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(
      `Seeded ${testUsers.length} local users, ${sampleClients.length + 1} Pulse clients, ${sampleRequests.length} Pulse request records, ${checklistTemplates.length} intake checklist templates, and starter activity.`
    );
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
