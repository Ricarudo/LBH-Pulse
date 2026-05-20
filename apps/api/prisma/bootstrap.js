const { PrismaClient } = require("@prisma/client");
const { scryptSync } = require("crypto");

const prisma = new PrismaClient();

function hashPassword(password, salt) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const runtimeUsers = [
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

async function upsertRuntimeUsers() {
  for (const user of runtimeUsers) {
    await prisma.localUser.upsert({
      where: { email: user.email },
      create: {
        name: user.name,
        email: user.email,
        role: user.role,
        passwordHash: hashPassword(user.password, user.email),
        active: true,
        mustChangePassword: false,
        authProvider: "LOCAL"
      },
      update: {
        name: user.name,
        role: user.role,
        active: true,
        deactivatedAt: null,
        authProvider: "LOCAL"
      }
    });
  }
}

async function upsertChecklistTemplates() {
  for (const template of checklistTemplates) {
    const savedTemplate = await prisma.requestChecklistTemplate.upsert({
      where: { key: template.key },
      create: {
        key: template.key,
        name: template.name,
        requestType: template.requestType ?? null,
        serviceCategory: template.serviceCategory ?? null
      },
      update: {
        name: template.name,
        requestType: template.requestType ?? null,
        serviceCategory: template.serviceCategory ?? null,
        active: true
      }
    });

    for (const [index, [label, group, required = true, appliesWhen]] of template.items.entries()) {
      const existingItem = await prisma.requestChecklistTemplateItem.findFirst({
        where: {
          templateId: savedTemplate.id,
          label
        }
      });

      const data = {
        description: null,
        required,
        appliesWhen: appliesWhen ?? null,
        sortOrder: index + 1,
        group,
        active: true
      };

      if (existingItem) {
        await prisma.requestChecklistTemplateItem.update({
          where: { id: existingItem.id },
          data
        });
      } else {
        await prisma.requestChecklistTemplateItem.create({
          data: {
            templateId: savedTemplate.id,
            label,
            ...data
          }
        });
      }
    }
  }
}

async function main() {
  await upsertRuntimeUsers();
  await upsertChecklistTemplates();

  console.log(
    `Bootstrapped ${runtimeUsers.length} local users and ${checklistTemplates.length} checklist templates without deleting data.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
