const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const sampleLeads = [
  {
    leadNumber: "LD-2026-1001",
    name: "Surveillance system upgrade",
    companyName: "Northfield Industries",
    contactName: "Elena Cruz",
    contactTitle: "Facilities Director",
    email: "ecruz@northfield.example",
    phone: "787-555-0148",
    leadSource: "Existing Customer",
    serviceInterest: "CCTV / Cameras",
    siteName: "Main manufacturing campus",
    siteAddress: "Road 2 KM 17.4",
    city: "Guaynabo",
    state: "PR",
    estimatedValue: 68500,
    status: "Qualified",
    priority: "High",
    assignedOwner: "Alex Morgan",
    nextFollowUpDate: new Date("2026-05-12T14:00:00.000Z"),
    notes: "Customer wants to replace aging cameras and improve remote viewing across warehouse entrances.",
    qualificationContactIdentified: true,
    qualificationSiteKnown: true,
    qualificationBudgetKnown: true,
    qualificationFollowUpScheduled: true,
    lastActivityAt: new Date("2026-05-09T14:32:00.000Z"),
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
        title: "Lead qualified",
        body: "Budget range and site contact confirmed.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T14:32:00.000Z")
      }
    ]
  },
  {
    leadNumber: "LD-2026-1002",
    name: "Access control expansion",
    companyName: "San Juan Medical Center",
    contactName: "Mariela Torres",
    contactTitle: "Security Manager",
    email: "mtorres@sjmc.example",
    phone: "787-555-0199",
    leadSource: "Referral",
    serviceInterest: "Access Control",
    siteName: "North tower",
    siteAddress: "Avenida Ponce de Leon 1510",
    city: "San Juan",
    state: "PR",
    estimatedValue: 42850,
    status: "Site Visit Needed",
    priority: "High",
    assignedOwner: "Project Manager User",
    nextFollowUpDate: new Date("2026-05-14T15:00:00.000Z"),
    notes: "Badge reader expansion and door monitoring for two floors. Needs site walk before estimating.",
    qualificationContactIdentified: true,
    qualificationSiteKnown: true,
    qualificationBudgetKnown: false,
    qualificationFollowUpScheduled: true,
    lastActivityAt: new Date("2026-05-08T13:58:00.000Z"),
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
    leadNumber: "LD-2026-1003",
    name: "Structured cabling project",
    companyName: "Municipality Facilities Office",
    contactName: "Rafael Ortiz",
    contactTitle: "Procurement Lead",
    email: "rortiz@municipality.example",
    phone: "787-555-0188",
    leadSource: "Public Bid",
    serviceInterest: "Structured Cabling",
    siteName: "Municipal services building",
    siteAddress: "Calle Munoz Rivera 44",
    city: "Caguas",
    state: "PR",
    estimatedValue: 96500,
    status: "New",
    priority: "Urgent",
    assignedOwner: "Unassigned",
    nextFollowUpDate: new Date("2026-05-10T12:00:00.000Z"),
    notes: "Bid docs need review. Deadline is tight and scope may include fiber risers.",
    qualificationContactIdentified: true,
    qualificationSiteKnown: true,
    qualificationBudgetKnown: false,
    qualificationFollowUpScheduled: true,
    lastActivityAt: new Date("2026-05-09T12:30:00.000Z"),
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
    leadNumber: "LD-2026-1004",
    name: "AV conference room upgrade",
    companyName: "Banco Popular Tower",
    contactName: "Daniela Perez",
    contactTitle: "Workplace Technology Manager",
    email: "dperez@bancopopular.example",
    phone: "787-555-0172",
    leadSource: "Website",
    serviceInterest: "AV",
    siteName: "Executive conference center",
    siteAddress: "209 Munoz Rivera Avenue",
    city: "San Juan",
    state: "PR",
    estimatedValue: 38400,
    status: "Contacted",
    priority: "Normal",
    assignedOwner: "Sales User",
    nextFollowUpDate: new Date("2026-05-16T14:00:00.000Z"),
    notes: "Customer wants a modern conferencing room with camera, display, microphones, and simple controls.",
    qualificationContactIdentified: true,
    qualificationSiteKnown: true,
    qualificationBudgetKnown: false,
    qualificationFollowUpScheduled: true,
    lastActivityAt: new Date("2026-05-08T20:45:00.000Z"),
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
    leadNumber: "LD-2026-1005",
    name: "Fiber backbone installation",
    companyName: "Caribbean Logistics",
    contactName: "Hector Rivera",
    contactTitle: "Operations Manager",
    email: "hrivera@cariblog.example",
    phone: "787-555-0112",
    leadSource: "Partner",
    serviceInterest: "Fiber",
    siteName: "Bayamon warehouse",
    siteAddress: "Industrial Park Lot 5",
    city: "Bayamon",
    state: "PR",
    estimatedValue: 61200,
    status: "Estimating",
    priority: "Normal",
    assignedOwner: "Project Manager User",
    nextFollowUpDate: new Date("2026-05-15T16:00:00.000Z"),
    notes: "Warehouse needs fiber backbone between MDF and two IDFs. Site walk complete.",
    qualificationContactIdentified: true,
    qualificationSiteKnown: true,
    qualificationBudgetKnown: true,
    qualificationFollowUpScheduled: true,
    lastActivityAt: new Date("2026-05-09T16:10:00.000Z"),
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
        title: "Moved to estimating",
        body: "Site walk notes are ready for material takeoff.",
        actor: "Project Manager User",
        createdAt: new Date("2026-05-09T16:10:00.000Z")
      }
    ]
  },
  {
    leadNumber: "LD-2026-1006",
    name: "Network refresh",
    companyName: "Coastal Hospitality Group",
    contactName: "Sofia Morales",
    contactTitle: "IT Coordinator",
    email: "smorales@coastalhospitality.example",
    phone: "787-555-0166",
    leadSource: "Phone",
    serviceInterest: "Network",
    siteName: "Condado hotel",
    siteAddress: "Ashford Avenue 1102",
    city: "San Juan",
    state: "PR",
    estimatedValue: 52400,
    status: "Proposal Needed",
    priority: "High",
    assignedOwner: "Alex Morgan",
    nextFollowUpDate: new Date("2026-05-13T13:30:00.000Z"),
    notes: "Replace access switches and clean up rack power. Customer requested proposal this week.",
    qualificationContactIdentified: true,
    qualificationSiteKnown: true,
    qualificationBudgetKnown: true,
    qualificationFollowUpScheduled: true,
    lastActivityAt: new Date("2026-05-09T18:05:00.000Z"),
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
        title: "Proposal needed",
        body: "Customer asked for a proposal by Friday.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T18:05:00.000Z")
      }
    ]
  }
];

const sampleClients = [
  {
    clientNumber: "CL-1001",
    companyName: "San Juan Medical Center",
    clientType: "Healthcare",
    status: "Active",
    accountOwner: "Alex Morgan",
    mainPhone: "787-555-0100",
    mainEmail: "facilities@sjmc.example",
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
        type: "Lead",
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
    clientType: "Industrial",
    status: "Active",
    accountOwner: "Project Manager User",
    mainPhone: "787-555-0110",
    mainEmail: "ops@cariblog.example",
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
    clientType: "Commercial",
    status: "Prospect",
    accountOwner: "Sales User",
    mainPhone: "787-555-0170",
    mainEmail: "admin@metroretail.example",
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
        type: "Lead",
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
    clientType: "Commercial",
    status: "Active",
    accountOwner: "Alex Morgan",
    mainPhone: "787-555-0188",
    mainEmail: "workplace@bancopopular.example",
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
    clientType: "Hospitality",
    status: "On Hold",
    accountOwner: "Sales User",
    mainPhone: "787-555-0160",
    mainEmail: "it@coastalhospitality.example",
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
        type: "Lead",
        title: "Network refresh moved to proposal needed",
        detail: "Customer requested proposal this week.",
        actor: "Alex Morgan",
        createdAt: new Date("2026-05-09T18:05:00.000Z")
      }
    ]
  }
];

async function main() {
  await prisma.clientActivity.deleteMany();
  await prisma.clientService.deleteMany();
  await prisma.clientSite.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.client.deleteMany();

  await prisma.leadAttachment.deleteMany();
  await prisma.leadNote.deleteMany();
  await prisma.leadTask.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();

  for (const client of sampleClients) {
    await prisma.client.create({
      data: {
        clientNumber: client.clientNumber,
        legalName: client.legalName ?? client.companyName,
        displayName: client.displayName ?? client.companyName,
        clientType: client.clientType,
        industry: client.industry ?? client.clientType,
        website: client.website ?? null,
        status: client.status,
        accountOwner: client.accountOwner,
        mainPhone: client.mainPhone,
        mainEmail: client.mainEmail,
        taxId: client.taxId ?? null,
        paymentTerms: client.paymentTerms ?? "Net 30",
        billingEmail: client.billingEmail ?? client.mainEmail,
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
        contacts: {
          create: client.contacts.map((contact, index) => {
            const [firstName, ...rest] = contact.name.split(" ");

            return {
              firstName: firstName || "Unknown",
              lastName: rest.join(" "),
              title: contact.title,
              department: contact.department ?? null,
              email: contact.email,
              phone: contact.phone,
              mobile: contact.mobile ?? null,
              preferredContactMethod: contact.preferredContactMethod ?? "Email",
              isPrimaryContact: contact.isPrimary ?? index === 0,
              isBillingContact: contact.isBilling ?? false,
              isTechnicalContact: contact.isTechnicalContact ?? false,
              isDecisionMaker: contact.isDecisionMaker ?? false,
              notes: contact.notes ?? null
            };
          })
        },
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
  }

  for (const lead of sampleLeads) {
    await prisma.lead.create({
      data: {
        leadNumber: lead.leadNumber,
        name: lead.name,
        companyName: lead.companyName,
        contactName: lead.contactName,
        contactTitle: lead.contactTitle,
        email: lead.email,
        phone: lead.phone,
        leadSource: lead.leadSource,
        serviceInterest: lead.serviceInterest,
        siteName: lead.siteName,
        siteAddress: lead.siteAddress,
        city: lead.city,
        state: lead.state,
        estimatedValue: lead.estimatedValue,
        status: lead.status,
        priority: lead.priority,
        assignedOwner: lead.assignedOwner,
        nextFollowUpDate: lead.nextFollowUpDate,
        notes: lead.notes,
        qualificationContactIdentified: lead.qualificationContactIdentified,
        qualificationSiteKnown: lead.qualificationSiteKnown,
        qualificationBudgetKnown: lead.qualificationBudgetKnown,
        qualificationFollowUpScheduled: lead.qualificationFollowUpScheduled,
        lastActivityAt: lead.lastActivityAt,
        tasks: {
          create: lead.tasks
        },
        attachments: {
          create: lead.attachments.map((fileName) => ({ fileName }))
        },
        activities: {
          create: lead.activities
        },
        notesList: {
          create: {
            body: lead.notes,
            actor: lead.activities[0]?.actor ?? "Pulse User",
            createdAt: lead.lastActivityAt
          }
        }
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(
      `Seeded ${sampleClients.length} Pulse clients and ${sampleLeads.length} Pulse leads.`
    );
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
