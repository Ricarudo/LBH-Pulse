import type { RequestType, ServiceCategory } from "@/types/request";

export type RequestChecklistTemplateDefinition = {
  key: string;
  name: string;
  requestType?: RequestType;
  serviceCategory?: ServiceCategory;
  items: Array<{
    label: string;
    description?: string;
    required?: boolean;
    appliesWhen?: string;
    group?: string;
  }>;
};

const baseItems = [
  { label: "Client / company identified", group: "Core" },
  { label: "Contact information confirmed", group: "Core" },
  { label: "Site address confirmed", group: "Core" },
  { label: "Scope summary captured", group: "Scope" },
  { label: "Service category selected", group: "Scope" },
  { label: "Due date confirmed", group: "Schedule" },
  { label: "Files received, if applicable", required: false, group: "Files" },
  { label: "Site visit decision made", group: "Site Visit" },
  {
    label: "Site visit completed",
    appliesWhen: "siteVisitRequired",
    group: "Site Visit"
  },
  { label: "Internal owner assigned", group: "Ownership" }
] satisfies RequestChecklistTemplateDefinition["items"];

export const requestChecklistTemplates: RequestChecklistTemplateDefinition[] = [
  {
    key: "general",
    name: "General Request Intake",
    items: baseItems
  },
  {
    key: "fiber-install",
    name: "Fiber Install Intake",
    serviceCategory: "Fiber",
    items: [
      { label: "Client / company identified", group: "Core" },
      { label: "Contact information confirmed", group: "Core" },
      { label: "Site address confirmed", group: "Core" },
      { label: "Scope summary captured", group: "Scope" },
      { label: "MDF/IDF locations known", group: "Fiber Scope" },
      { label: "Pathway available or unknown identified", group: "Fiber Scope" },
      { label: "Drawings received", group: "Files" },
      { label: "Distance estimate available", group: "Fiber Scope" },
      { label: "Indoor/outdoor route confirmed", group: "Fiber Scope" },
      { label: "Aerial/trench/conduit requirement known", group: "Fiber Scope" },
      { label: "Due date confirmed", group: "Schedule" },
      { label: "Site visit decision made", group: "Site Visit" },
      { label: "Site visit completed", appliesWhen: "siteVisitRequired", group: "Site Visit" },
      { label: "Internal owner assigned", group: "Ownership" }
    ]
  },
  {
    key: "access-control",
    name: "Access Control Intake",
    serviceCategory: "Access Control",
    items: [
      { label: "Client / company identified", group: "Core" },
      { label: "Contact information confirmed", group: "Core" },
      { label: "Site address confirmed", group: "Core" },
      { label: "Scope summary captured", group: "Scope" },
      { label: "Door count confirmed", group: "Access Control" },
      { label: "Door types confirmed", group: "Access Control" },
      { label: "Floor plan received", group: "Files" },
      { label: "Reader locations confirmed", group: "Access Control" },
      { label: "Locking hardware type known", group: "Access Control" },
      { label: "Fire alarm interface requirement confirmed", group: "Access Control" },
      { label: "Existing access platform identified", group: "Access Control" },
      { label: "Due date confirmed", group: "Schedule" },
      { label: "Site visit decision made", group: "Site Visit" },
      { label: "Site visit completed", appliesWhen: "siteVisitRequired", group: "Site Visit" },
      { label: "Internal owner assigned", group: "Ownership" }
    ]
  },
  {
    key: "cctv-surveillance",
    name: "CCTV / Surveillance Intake",
    serviceCategory: "CCTV / Surveillance",
    items: [
      { label: "Client / company identified", group: "Core" },
      { label: "Contact information confirmed", group: "Core" },
      { label: "Site address confirmed", group: "Core" },
      { label: "Scope summary captured", group: "Scope" },
      { label: "Camera count confirmed", group: "CCTV" },
      { label: "Camera locations identified", group: "CCTV" },
      { label: "Mounting conditions known", group: "CCTV" },
      { label: "Network availability confirmed", group: "CCTV" },
      { label: "Power/PoE availability confirmed", group: "CCTV" },
      { label: "Recording requirement known", group: "CCTV" },
      { label: "Retention requirement known", group: "CCTV" },
      { label: "Drawings/photos received", group: "Files" },
      { label: "Due date confirmed", group: "Schedule" },
      { label: "Site visit decision made", group: "Site Visit" },
      { label: "Site visit completed", appliesWhen: "siteVisitRequired", group: "Site Visit" },
      { label: "Internal owner assigned", group: "Ownership" }
    ]
  },
  {
    key: "structured-cabling",
    name: "Structured Cabling Intake",
    serviceCategory: "Structured Cabling",
    items: [
      { label: "Client / company identified", group: "Core" },
      { label: "Contact information confirmed", group: "Core" },
      { label: "Site address confirmed", group: "Core" },
      { label: "Scope summary captured", group: "Scope" },
      { label: "Outlet/drop count confirmed", group: "Cabling" },
      { label: "Floor plan/drawing received", group: "Files" },
      { label: "IDF/MDF location confirmed", group: "Cabling" },
      { label: "Cable category confirmed", group: "Cabling" },
      { label: "Pathway conditions known", group: "Cabling" },
      { label: "Ceiling/access conditions known", group: "Cabling" },
      { label: "Labeling standard confirmed", group: "Cabling" },
      { label: "Due date confirmed", group: "Schedule" },
      { label: "Site visit decision made", group: "Site Visit" },
      { label: "Site visit completed", appliesWhen: "siteVisitRequired", group: "Site Visit" },
      { label: "Internal owner assigned", group: "Ownership" }
    ]
  },
  {
    key: "power-ups",
    name: "Power / UPS Intake",
    serviceCategory: "Power / UPS",
    items: [
      { label: "Client / company identified", group: "Core" },
      { label: "Contact information confirmed", group: "Core" },
      { label: "Site address confirmed", group: "Core" },
      { label: "Scope summary captured", group: "Scope" },
      { label: "UPS/battery model identified", group: "Power / UPS" },
      { label: "Current load confirmed", group: "Power / UPS" },
      { label: "Existing battery capacity confirmed", group: "Power / UPS" },
      { label: "Target runtime confirmed", group: "Power / UPS" },
      { label: "Electrical constraints confirmed", group: "Power / UPS" },
      { label: "Installation location confirmed", group: "Power / UPS" },
      { label: "Photos or equipment label received", group: "Files" },
      { label: "Due date confirmed", group: "Schedule" },
      { label: "Site visit decision made", group: "Site Visit" },
      { label: "Site visit completed", appliesWhen: "siteVisitRequired", group: "Site Visit" },
      { label: "Internal owner assigned", group: "Ownership" }
    ]
  }
];

export function chooseChecklistTemplateKey(serviceCategory: string, requestType: string) {
  const serviceMatch = requestChecklistTemplates.find(
    (template) => template.serviceCategory === serviceCategory
  );

  if (serviceMatch) {
    return serviceMatch.key;
  }

  const typeMatch = requestChecklistTemplates.find(
    (template) => template.requestType === requestType
  );

  return typeMatch?.key ?? "general";
}
