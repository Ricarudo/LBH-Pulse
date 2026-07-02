"use client";

// Three-step request intake wizard:
// 1. choose or create a Directory client,
// 2. choose or create the client's point of contact and site,
// 3. capture request metadata and let the API generate the checklist.
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  MapPin,
  Plus,
  Save,
  Search,
  UserRound,
  X
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import {
  buildQuickCreatePayload,
  createBlankQuickCreateForm,
  mapQuickCreateApiErrors,
  quickCreateLimits,
  validateQuickCreateForm,
  type QuickCreateErrors,
  type QuickCreateField
} from "@/lib/forms/clientQuickCreate";
import {
  type FieldErrors,
  FormRequestError,
  formJson,
  isAllowedValue,
  isEmailFormatValid,
  isPhoneFormatValid,
  mapApiErrors,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  validateCleanText
} from "@/lib/forms/sanitization";
import {
  clientIndustries,
  clientSiteTypes,
  preferredContactMethods,
  type ClientContact,
  type ClientContactInput,
  type ClientRecord,
  type ClientSite,
  type ClientSiteInput
} from "@/types/client";
import {
  requestPriorities,
  requestSources,
  requestTypes,
  serviceCategories,
  type RequestAssignee,
  type RequestPriority,
  type RequestRecord,
  type RequestSource,
  type RequestType,
  type ServiceCategory
} from "./requestData";

type ClientResponse = {
  client: ClientRecord;
};

type RequestResponse = {
  request: RequestRecord;
};

type RequestIntakeWizardProps = {
  isOpen: boolean;
  clients: ClientRecord[];
  assignees: RequestAssignee[];
  currentUser: AuthenticatedUser | null;
  onClose: () => void;
  onClientChanged: (client: ClientRecord) => void;
  onCreated: (request: RequestRecord) => void;
};

type WizardStep = "client" | "relations" | "request";

type ContactDraft = {
  name: string;
  role: string;
  title: string;
  email: string;
  phone: string;
  preferredContactMethod: string;
  notes: string;
};

type ContactField = keyof ContactDraft;

type SiteDraft = {
  siteName: string;
  siteType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googleMapsUrl: string;
  operationalHours: string;
  accessInstructions: string;
  parkingInstructions: string;
  securityRequirements: string;
  siteNotes: string;
  isPrimarySite: boolean;
};

type SiteField = keyof SiteDraft;
type SiteTextField = Exclude<SiteField, "isPrimarySite">;

type RequestInfoDraft = {
  title: string;
  description: string;
  serviceCategory: ServiceCategory;
  dueDate: string;
  siteVisitNeeded: boolean;
  source: RequestSource;
  requestType: RequestType;
  priority: RequestPriority;
  assignedToId: string;
};

type RequestInfoField = keyof RequestInfoDraft;

const today = new Date().toISOString().slice(0, 10);

const wizardSteps: Array<{ id: WizardStep; label: string }> = [
  { id: "client", label: "Client" },
  { id: "relations", label: "PoC & Site" },
  { id: "request", label: "Request Info" }
];

const contactFieldLimits = {
  name: 160,
  role: 80,
  title: 120,
  email: 254,
  phone: 40,
  preferredContactMethod: 40,
  notes: 2000
} as const;

const siteFieldLimits: Record<SiteTextField, number> = {
  siteName: 160,
  siteType: 80,
  addressLine1: 2000,
  addressLine2: 2000,
  city: 2000,
  state: 2000,
  postalCode: 2000,
  country: 2000,
  googleMapsUrl: 2048,
  operationalHours: 2000,
  accessInstructions: 2000,
  parkingInstructions: 2000,
  securityRequirements: 2000,
  siteNotes: 2000
} as const;

const requestFieldLimits = {
  title: 2000,
  description: 2000
} as const;

const contactFields = Object.keys(contactFieldLimits) as ContactField[];
const siteFields = Object.keys(siteFieldLimits) as SiteTextField[];
const requestInfoFields = Object.keys({
  title: true,
  description: true,
  serviceCategory: true,
  dueDate: true,
  siteVisitNeeded: true,
  source: true,
  requestType: true,
  priority: true,
  assignedToId: true
}) as RequestInfoField[];

function blankContactDraft(): ContactDraft {
  // Draft state uses plain strings so controls stay simple; conversion to API
  // payloads happens only after validation succeeds.
  return {
    name: "",
    role: "Primary",
    title: "",
    email: "",
    phone: "",
    preferredContactMethod: "Email",
    notes: ""
  };
}

function blankSiteDraft(primary = false): SiteDraft {
  return {
    siteName: "",
    siteType: "Main Office",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "PR",
    postalCode: "",
    country: "Puerto Rico",
    googleMapsUrl: "",
    operationalHours: "",
    accessInstructions: "",
    parkingInstructions: "",
    securityRequirements: "",
    siteNotes: "",
    isPrimarySite: primary
  };
}

function blankRequestInfo(defaultAssignedToId = ""): RequestInfoDraft {
  return {
    title: "",
    description: "",
    serviceCategory: "Access Control",
    dueDate: "",
    siteVisitNeeded: false,
    source: "Call",
    requestType: "Quote Request",
    priority: "Normal",
    assignedToId: defaultAssignedToId
  };
}

function splitContactName(contactName: string) {
  const [firstName = "", ...lastNameParts] = contactName.split(" ");
  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
}

function siteAddress(site: ClientSite) {
  return (
    site.address ||
    [site.addressLine1, site.addressLine2, site.city, site.state, site.postalCode]
      .filter(Boolean)
      .join(", ")
  );
}

function contactPhone(contact: ClientContact) {
  return contact.phone || contact.mobile;
}

function fieldErrorId(prefix: string, field: string) {
  return `${prefix}-${field}-error`;
}

function apiFieldFromPath<TField extends string>(
  fields: readonly TField[],
  path: string
): TField | "form" {
  // Match the last segment of a Zod path, such as contacts.0.email, to the
  // field names that are visible in the active wizard step.
  const normalized = path.split(".").at(-1) ?? path;
  return fields.includes(normalized as TField) ? (normalized as TField) : "form";
}

function normalizeContactDraft(contact: ContactDraft): ContactDraft {
  // Match Directory contact sanitation: collapse user-entered names/phones,
  // lowercase email, and trim notes without destroying intentional line breaks.
  return {
    name: normalizeText(contact.name, true),
    role: normalizeText(contact.role, true),
    title: normalizeText(contact.title, true),
    email: normalizeEmail(contact.email),
    phone: normalizePhone(contact.phone),
    preferredContactMethod: normalizeText(contact.preferredContactMethod, true) || "Email",
    notes: normalizeText(contact.notes)
  };
}

function validateContactDraft(contact: ContactDraft) {
  const normalized = normalizeContactDraft(contact);
  const errors: FieldErrors<ContactField> = {};

  if (!normalized.name) {
    errors.name = "Point of Contact Name is required.";
  }

  if (!normalized.email && !normalized.phone) {
    errors.email = "Provide an email or phone for this contact.";
  }

  for (const field of contactFields) {
    validateCleanText(errors, field, normalized[field], contactFieldLimits[field]);
  }

  if (normalized.email && !isEmailFormatValid(normalized.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (normalized.phone && !isPhoneFormatValid(normalized.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (!isAllowedValue(normalized.preferredContactMethod, preferredContactMethods)) {
    errors.preferredContactMethod = "Select a valid preferred contact method.";
  }

  return { normalized, errors };
}

function contactPayload(contact: ContactDraft, siteId: string, primary: boolean): ClientContactInput {
  const splitName = splitContactName(contact.name);
  const preferredContactMethod = isAllowedValue(
    contact.preferredContactMethod,
    preferredContactMethods
  )
    ? contact.preferredContactMethod
    : contact.email
      ? "Email"
      : "Phone";

  return {
    siteId,
    siteLocalId: "",
    name: contact.name,
    role: contact.role || "Primary",
    firstName: splitName.firstName || "Unknown",
    lastName: splitName.lastName,
    title: contact.title,
    department: "",
    email: contact.email,
    phone: contact.phone,
    mobile: "",
    preferredContactMethod,
    isPrimary: primary,
    isBilling: false,
    isPrimaryContact: primary,
    isBillingContact: false,
    isTechnicalContact: false,
    isDecisionMaker: false,
    notes: contact.notes
  };
}

function normalizeSiteDraft(site: SiteDraft): SiteDraft {
  return {
    siteName: normalizeText(site.siteName, true),
    siteType: normalizeText(site.siteType, true) || "Main Office",
    addressLine1: normalizeText(site.addressLine1, true),
    addressLine2: normalizeText(site.addressLine2, true),
    city: normalizeText(site.city, true),
    state: normalizeText(site.state, true) || "PR",
    postalCode: normalizeText(site.postalCode, true),
    country: normalizeText(site.country, true) || "Puerto Rico",
    googleMapsUrl: normalizeText(site.googleMapsUrl, true),
    operationalHours: normalizeText(site.operationalHours, true),
    accessInstructions: normalizeText(site.accessInstructions),
    parkingInstructions: normalizeText(site.parkingInstructions),
    securityRequirements: normalizeText(site.securityRequirements),
    siteNotes: normalizeText(site.siteNotes),
    isPrimarySite: site.isPrimarySite
  };
}

function validateSiteDraft(site: SiteDraft) {
  const normalized = normalizeSiteDraft(site);
  const errors: FieldErrors<SiteField> = {};

  if (!normalized.siteName) {
    errors.siteName = "Site name is required.";
  }

  for (const field of siteFields) {
    validateCleanText(errors, field, String(normalized[field]), siteFieldLimits[field]);
  }

  if (!isAllowedValue(normalized.siteType, clientSiteTypes)) {
    errors.siteType = "Select a valid site type.";
  }

  return { normalized, errors };
}

function sitePayload(site: SiteDraft): ClientSiteInput {
  return {
    siteName: site.siteName,
    siteType: isAllowedValue(site.siteType, clientSiteTypes) ? site.siteType : "Main Office",
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    city: site.city,
    state: site.state,
    postalCode: site.postalCode,
    country: site.country,
    googleMapsUrl: site.googleMapsUrl,
    operationalHours: site.operationalHours,
    accessInstructions: site.accessInstructions,
    parkingInstructions: site.parkingInstructions,
    securityRequirements: site.securityRequirements,
    siteNotes: site.siteNotes,
    isPrimarySite: site.isPrimarySite
  };
}

function validateRequestInfoDraft(info: RequestInfoDraft) {
  // Trade is stored as serviceCategory. The request API uses that value to copy
  // the matching checklist template onto the newly created request.
  const normalized: RequestInfoDraft = {
    title: normalizeText(info.title, true),
    description: normalizeText(info.description),
    serviceCategory: info.serviceCategory,
    dueDate: normalizeText(info.dueDate),
    siteVisitNeeded: info.siteVisitNeeded,
    source: info.source,
    requestType: info.requestType,
    priority: info.priority,
    assignedToId: normalizeText(info.assignedToId)
  };
  const errors: FieldErrors<RequestInfoField> = {};

  if (!normalized.title) {
    errors.title = "Request title is required.";
  }

  if (!normalized.description) {
    errors.description = "Description is required.";
  }

  if (!normalized.dueDate) {
    errors.dueDate = "Due date is required.";
  }

  validateCleanText(errors, "title", normalized.title, requestFieldLimits.title);
  validateCleanText(errors, "description", normalized.description, requestFieldLimits.description);

  if (!isAllowedValue(normalized.serviceCategory, serviceCategories)) {
    errors.serviceCategory = "Select a valid trade.";
  }

  if (!isAllowedValue(normalized.source, requestSources)) {
    errors.source = "Select a valid request source.";
  }

  if (!isAllowedValue(normalized.requestType, requestTypes)) {
    errors.requestType = "Select a valid request type.";
  }

  if (!isAllowedValue(normalized.priority, requestPriorities)) {
    errors.priority = "Select a valid priority.";
  }

  return { normalized, errors };
}

function TextField<TField extends string>({
  label,
  name,
  value,
  errors,
  onChange,
  prefix,
  type = "text",
  required = false,
  maxLength,
  wide = false
}: {
  label: string;
  name: TField;
  value: string;
  errors: FieldErrors<TField>;
  onChange: (value: string) => void;
  prefix: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  wide?: boolean;
}) {
  const error = errors[name];
  const errorId = fieldErrorId(prefix, name);

  return (
    <label className={wide ? "request-wizard-field wide" : "request-wizard-field"}>
      <span>
        {label}
        {required ? <small>Required</small> : null}
      </span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small id={errorId} className="field-error">{error}</small> : null}
    </label>
  );
}

function SelectField<TField extends string>({
  label,
  name,
  value,
  options,
  errors,
  onChange,
  prefix,
  required = false,
  wide = false
}: {
  label: string;
  name: TField;
  value: string;
  options: readonly string[];
  errors: FieldErrors<TField>;
  onChange: (value: string) => void;
  prefix: string;
  required?: boolean;
  wide?: boolean;
}) {
  const error = errors[name];
  const errorId = fieldErrorId(prefix, name);

  return (
    <label className={wide ? "request-wizard-field wide" : "request-wizard-field"}>
      <span>
        {label}
        {required ? <small>Required</small> : null}
      </span>
      <select
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option || "blank"} value={option}>
            {option || "Not captured"}
          </option>
        ))}
      </select>
      {error ? <small id={errorId} className="field-error">{error}</small> : null}
    </label>
  );
}

function TextAreaField<TField extends string>({
  label,
  name,
  value,
  errors,
  onChange,
  prefix,
  required = false
}: {
  label: string;
  name: TField;
  value: string;
  errors: FieldErrors<TField>;
  onChange: (value: string) => void;
  prefix: string;
  required?: boolean;
}) {
  const error = errors[name];
  const errorId = fieldErrorId(prefix, name);

  return (
    <label className="request-wizard-field wide">
      <span>
        {label}
        {required ? <small>Required</small> : null}
      </span>
      <textarea
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small id={errorId} className="field-error">{error}</small> : null}
    </label>
  );
}

export function RequestIntakeWizard({
  isOpen,
  clients,
  assignees,
  currentUser,
  onClose,
  onClientChanged,
  onCreated
}: RequestIntakeWizardProps) {
  // Each step owns its local creation draft because Directory records are saved
  // immediately, while the final Request is created only from selected records.
  const [activeStep, setActiveStep] = useState<WizardStep>("client");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClient, setQuickClient] = useState(createBlankQuickCreateForm);
  const [quickClientErrors, setQuickClientErrors] = useState<QuickCreateErrors>({});
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState(blankContactDraft);
  const [contactErrors, setContactErrors] = useState<FieldErrors<ContactField>>({});
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteDraft, setSiteDraft] = useState(() => blankSiteDraft(true));
  const [siteErrors, setSiteErrors] = useState<FieldErrors<SiteField>>({});
  const [requestInfo, setRequestInfo] = useState(() => blankRequestInfo(currentUser?.id ?? ""));
  const [requestErrors, setRequestErrors] = useState<FieldErrors<RequestInfoField>>({});
  const [formMessage, setFormMessage] = useState("");
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [isSavingRequest, setIsSavingRequest] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedContact =
    selectedClient?.contacts.find((contact) => contact.id === selectedContactId) ?? null;
  const selectedSite =
    selectedClient?.sites.find((site) => site.id === selectedSiteId) ?? null;
  const canCreateContact = currentUser?.role === "Admin";
  const isBusy = isSavingClient || isSavingContact || isSavingSite || isSavingRequest;

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return clients
      .filter((client) => {
        if (!normalizedSearch) {
          return true;
        }

        const haystack = [
          client.clientNumber,
          client.displayName,
          client.legalName,
          client.companyName,
          client.industry,
          client.primaryContact.name,
          client.primaryContact.email,
          client.primaryContact.phone,
          ...client.contacts.flatMap((contact) => [
            contact.name,
            contact.email,
            contact.phone,
            contact.mobile,
            contact.title,
            contact.role
          ]),
          client.primarySite,
          ...client.sites.flatMap((site) => [
            site.siteName,
            site.address,
            site.city,
            site.state,
            site.siteType
          ])
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .slice(0, 24);
  }, [clients, searchTerm]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);

    // Body scroll lock makes the popup relate to the whole viewport instead of
    // the request list/detail columns underneath it.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        closeWizard();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isBusy, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setRequestInfo((current) => ({
      ...current,
      assignedToId: current.assignedToId || currentUser?.id || ""
    }));
  }, [currentUser?.id, isOpen]);

  useEffect(() => {
    if (!selectedClient) {
      setSelectedContactId("");
      setSelectedSiteId("");
      return;
    }

    const primaryContact =
      selectedClient.contacts.find((contact) => contact.isPrimary || contact.isPrimaryContact) ??
      selectedClient.contacts[0];
    const primarySite =
      selectedClient.sites.find((site) => site.isPrimarySite) ?? selectedClient.sites[0];

    // Prefer primary records after client changes, but keep a selection if it
    // still belongs to the newly selected client.
    if (!selectedClient.contacts.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId(primaryContact?.id ?? "");
    }

    if (!selectedClient.sites.some((site) => site.id === selectedSiteId)) {
      setSelectedSiteId(primarySite?.id ?? "");
    }
  }, [selectedClient, selectedContactId, selectedSiteId]);

  function resetWizard() {
    setActiveStep("client");
    setSearchTerm("");
    setSelectedClientId("");
    setSelectedContactId("");
    setSelectedSiteId("");
    setQuickClientOpen(false);
    setQuickClient(createBlankQuickCreateForm());
    setQuickClientErrors({});
    setContactOpen(false);
    setContactDraft(blankContactDraft());
    setContactErrors({});
    setSiteOpen(false);
    setSiteDraft(blankSiteDraft(true));
    setSiteErrors({});
    setRequestInfo(blankRequestInfo(currentUser?.id ?? ""));
    setRequestErrors({});
    setFormMessage("");
  }

  function closeWizard() {
    if (isBusy) {
      return;
    }

    resetWizard();
    onClose();
  }

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedContactId("");
    setSelectedSiteId("");
    setFormMessage("");
    setActiveStep("relations");
  }

  function updateQuickClientField(field: QuickCreateField, value: string) {
    setQuickClient((current) => ({ ...current, [field]: value }));
    setQuickClientErrors((current) => {
      if (!current[field] && !current.form) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  function updateContactField(field: ContactField, value: string) {
    setContactDraft((current) => ({ ...current, [field]: value }));
    setContactErrors((current) => {
      if (!current[field] && !current.form) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  function updateSiteField(field: SiteField, value: string | boolean) {
    setSiteDraft((current) => ({ ...current, [field]: value }));
    setSiteErrors((current) => {
      if (!current[field] && !current.form) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  function updateRequestInfo<K extends keyof RequestInfoDraft>(field: K, value: RequestInfoDraft[K]) {
    setRequestInfo((current) => ({ ...current, [field]: value }));
    setRequestErrors((current) => {
      if (!current[field] && !current.form) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const { normalized, errors } = validateQuickCreateForm(quickClient);
    setQuickClient(normalized);

    if (Object.keys(errors).length) {
      setQuickClientErrors(errors);
      return;
    }

    try {
      setIsSavingClient(true);
      setQuickClientErrors({});
      setFormMessage("");
      const data = await formJson<ClientResponse>("/api/clients", {
        method: "POST",
        body: JSON.stringify(buildQuickCreatePayload(normalized))
      }, "Unable to create this client.");

      onClientChanged(data.client);
      setSelectedClientId(data.client.id);
      // Quick client creation can include an initial PoC, but it intentionally
      // does not create a site. Step 2 will require a site before continuing.
      const primaryContact =
        data.client.contacts.find((contact) => contact.isPrimary || contact.isPrimaryContact) ??
        data.client.contacts[0];
      const primarySite = data.client.sites.find((site) => site.isPrimarySite) ?? data.client.sites[0];
      setSelectedContactId(primaryContact?.id ?? "");
      setSelectedSiteId(primarySite?.id ?? "");
      setQuickClientOpen(false);
      setQuickClient(createBlankQuickCreateForm());
      setActiveStep("relations");
    } catch (error) {
      if (error instanceof FormRequestError) {
        setQuickClientErrors(mapQuickCreateApiErrors(error));
      } else {
        setQuickClientErrors({
          form: error instanceof Error ? error.message : "Unable to create this client."
        });
      }
    } finally {
      setIsSavingClient(false);
    }
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClient) {
      setContactErrors({ form: "Select a client first." });
      return;
    }

    if (!canCreateContact) {
      setContactErrors({ form: "Admin access is required to create points of contact." });
      return;
    }

    const { normalized, errors } = validateContactDraft(contactDraft);
    setContactDraft(normalized);

    if (Object.keys(errors).length) {
      setContactErrors(errors);
      return;
    }

    const existingIds = new Set(selectedClient.contacts.map((contact) => contact.id));

    try {
      setIsSavingContact(true);
      setContactErrors({});
      setFormMessage("");
      const data = await formJson<ClientResponse>(`/api/clients/${selectedClient.id}/contacts`, {
        method: "POST",
        body: JSON.stringify(
          contactPayload(normalized, selectedSiteId, selectedClient.contacts.length === 0)
        )
      }, "Unable to create this point of contact.");
      const createdContact =
        data.client.contacts.find((contact) => !existingIds.has(contact.id)) ??
        data.client.contacts.find((contact) => contact.name === normalized.name);

      onClientChanged(data.client);
      setSelectedClientId(data.client.id);
      setSelectedContactId(createdContact?.id ?? "");
      setContactOpen(false);
      setContactDraft(blankContactDraft());
    } catch (error) {
      if (error instanceof FormRequestError) {
        setContactErrors(
          mapApiErrors(error, (path) => apiFieldFromPath(contactFields, path))
        );
      } else {
        setContactErrors({
          form: error instanceof Error ? error.message : "Unable to create this point of contact."
        });
      }
    } finally {
      setIsSavingContact(false);
    }
  }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClient) {
      setSiteErrors({ form: "Select a client first." });
      return;
    }

    const { normalized, errors } = validateSiteDraft(siteDraft);
    setSiteDraft(normalized);

    if (Object.keys(errors).length) {
      setSiteErrors(errors);
      return;
    }

    const existingIds = new Set(selectedClient.sites.map((site) => site.id));

    try {
      setIsSavingSite(true);
      setSiteErrors({});
      setFormMessage("");
      const data = await formJson<ClientResponse>(`/api/clients/${selectedClient.id}/sites`, {
        method: "POST",
        body: JSON.stringify(sitePayload(normalized))
      }, "Unable to create this site.");
      const createdSite =
        data.client.sites.find((site) => !existingIds.has(site.id)) ??
        data.client.sites.find((site) => site.siteName === normalized.siteName);

      onClientChanged(data.client);
      setSelectedClientId(data.client.id);
      setSelectedSiteId(createdSite?.id ?? "");
      setSiteOpen(false);
      setSiteDraft(blankSiteDraft(false));
    } catch (error) {
      if (error instanceof FormRequestError) {
        setSiteErrors(mapApiErrors(error, (path) => apiFieldFromPath(siteFields, path)));
      } else {
        setSiteErrors({
          form: error instanceof Error ? error.message : "Unable to create this site."
        });
      }
    } finally {
      setIsSavingSite(false);
    }
  }

  function validateRelationsStep() {
    if (!selectedClient) {
      setFormMessage("Select or create a client before continuing.");
      return false;
    }

    if (!selectedContact) {
      setFormMessage("Select or create a point of contact before continuing.");
      return false;
    }

    if (!selectedSite) {
      setFormMessage("Select or create a site before continuing.");
      return false;
    }

    setFormMessage("");
    return true;
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClient || !selectedContact || !selectedSite) {
      setFormMessage("Complete client, point of contact, and site before saving.");
      setActiveStep(!selectedClient ? "client" : "relations");
      return;
    }

    const { normalized, errors } = validateRequestInfoDraft(requestInfo);
    setRequestInfo(normalized);

    if (Object.keys(errors).length) {
      setRequestErrors(errors);
      setActiveStep("request");
      return;
    }

    try {
      setIsSavingRequest(true);
      setRequestErrors({});
      setFormMessage("");
      // Snapshot readable Directory fields with the canonical IDs so the
      // request remains searchable even if Directory details later change.
      const data = await formJson<RequestResponse>("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          title: normalized.title,
          requestType: normalized.requestType,
          source: normalized.source,
          serviceCategory: normalized.serviceCategory,
          status: "Received",
          priority: normalized.priority,
          clientId: selectedClient.id,
          contactId: selectedContact.id,
          siteId: selectedSite.id,
          companyName: selectedClient.displayName,
          contactName: selectedContact.name,
          contactEmail: selectedContact.email,
          contactPhone: contactPhone(selectedContact),
          siteName: selectedSite.siteName,
          siteAddress: siteAddress(selectedSite),
          city: selectedSite.city,
          state: selectedSite.state || "PR",
          assignedToId: normalized.assignedToId,
          receivedDate: today,
          dueDate: normalized.dueDate,
          nextAction: "",
          nextFollowUpAt: "",
          missingInfo: "",
          siteVisitNeeded: normalized.siteVisitNeeded,
          siteVisitCompleted: false,
          description: normalized.description,
          internalNotes: ""
        })
      }, "Unable to create this request.");

      onCreated(data.request);
      resetWizard();
      onClose();
    } catch (error) {
      if (error instanceof FormRequestError) {
        setRequestErrors(
          mapApiErrors(error, (path) => apiFieldFromPath(requestInfoFields, path))
        );
        setFormMessage(error.message);
      } else {
        setFormMessage(error instanceof Error ? error.message : "Unable to create this request.");
      }
    } finally {
      setIsSavingRequest(false);
    }
  }

  function goNext() {
    if (activeStep === "client") {
      if (!selectedClient) {
        setFormMessage("Select or create a client before continuing.");
        return;
      }

      setFormMessage("");
      setActiveStep("relations");
      return;
    }

    if (activeStep === "relations" && validateRelationsStep()) {
      setActiveStep("request");
    }
  }

  function goBack() {
    setFormMessage("");

    if (activeStep === "request") {
      setActiveStep("relations");
    } else if (activeStep === "relations") {
      setActiveStep("client");
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="request-wizard-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeWizard();
        }
      }}
    >
      <section
        className="request-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-wizard-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="request-wizard-header">
          <div>
            <span>Requests / Intake</span>
            <h2 id="request-wizard-title">New Request</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close request intake"
            onClick={closeWizard}
            disabled={isBusy}
          >
            <X size={18} />
          </button>
        </header>

        <nav className="request-wizard-steps" aria-label="Request intake steps">
          {wizardSteps.map((step, index) => {
            const activeIndex = wizardSteps.findIndex((item) => item.id === activeStep);
            const isComplete = index < activeIndex;

            return (
              <button
                key={step.id}
                type="button"
                className={[
                  "request-wizard-step",
                  activeStep === step.id ? "active" : "",
                  isComplete ? "complete" : ""
                ].filter(Boolean).join(" ")}
                onClick={() => {
                  if (step.id === "client") {
                    setActiveStep("client");
                  } else if (step.id === "relations" && selectedClient) {
                    setActiveStep("relations");
                  } else if (step.id === "request" && validateRelationsStep()) {
                    setActiveStep("request");
                  }
                }}
              >
                <span>{isComplete ? <CheckCircle2 size={15} /> : index + 1}</span>
                <strong>{step.label}</strong>
              </button>
            );
          })}
        </nav>

        <div className="request-wizard-body">
          {activeStep === "client" ? (
            <section className="request-wizard-panel" aria-label="Client selection">
              <label className="request-wizard-search">
                <Search size={17} />
                <input
                  ref={searchInputRef}
                  aria-label="Search clients"
                  placeholder="Search clients, contacts, sites..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>

              <div className="request-wizard-list">
                {filteredClients.map((client) => {
                  const primaryContact =
                    client.primaryContact.name || client.contacts[0]?.name || "No contact";
                  const primarySite = client.primarySite || client.sites[0]?.siteName || "No site";

                  return (
                    <button
                      key={client.id}
                      type="button"
                      className={client.id === selectedClientId ? "request-wizard-choice selected" : "request-wizard-choice"}
                      onClick={() => selectClient(client.id)}
                    >
                      <Building2 size={18} />
                      <span>
                        <strong>{client.displayName}</strong>
                        <small>{client.clientNumber} - {client.industry || "Unclassified"}</small>
                      </span>
                      <em>{primaryContact}</em>
                      <em>{primarySite}</em>
                    </button>
                  );
                })}
              </div>

              {!filteredClients.length ? (
                <div className="request-wizard-empty">
                  <strong>No clients match this search.</strong>
                </div>
              ) : null}

              <div className="request-wizard-inline-actions">
                <button
                  className="toolbar-button compact"
                  type="button"
                  onClick={() => {
                    setQuickClientOpen((open) => {
                      const nextOpen = !open;
                      if (nextOpen) {
                        setQuickClient(createBlankQuickCreateForm());
                      }
                      return nextOpen;
                    });
                    setQuickClientErrors({});
                  }}
                >
                  <Plus size={16} />
                  Create Client
                </button>
              </div>

              {quickClientOpen ? (
                <form className="request-wizard-subform" onSubmit={createClient}>
                  <div className="request-wizard-field-grid">
                    <TextField
                      label="Client Name"
                      name="clientName"
                      value={quickClient.clientName}
                      errors={quickClientErrors}
                      prefix="quick-client"
                      maxLength={quickCreateLimits.clientName + 16}
                      required
                      onChange={(value) => updateQuickClientField("clientName", value)}
                    />
                    <SelectField
                      label="Client Industry"
                      name="industry"
                      value={quickClient.industry}
                      options={["", ...clientIndustries]}
                      errors={quickClientErrors}
                      prefix="quick-client"
                      required
                      onChange={(value) => updateQuickClientField("industry", value)}
                    />
                    <TextField
                      label="Point of Contact Name"
                      name="contactName"
                      value={quickClient.contactName}
                      errors={quickClientErrors}
                      prefix="quick-client"
                      maxLength={quickCreateLimits.contactName + 16}
                      onChange={(value) => updateQuickClientField("contactName", value)}
                    />
                    <TextField
                      label="Point of Contact Email"
                      name="contactEmail"
                      type="email"
                      value={quickClient.contactEmail}
                      errors={quickClientErrors}
                      prefix="quick-client"
                      maxLength={quickCreateLimits.contactEmail + 16}
                      onChange={(value) => updateQuickClientField("contactEmail", value)}
                    />
                    <TextField
                      label="Point of Contact Phone"
                      name="contactPhone"
                      value={quickClient.contactPhone}
                      errors={quickClientErrors}
                      prefix="quick-client"
                      maxLength={quickCreateLimits.contactPhone + 16}
                      onChange={(value) => updateQuickClientField("contactPhone", value)}
                    />
                    <TextField
                      label="Point of Contact Role"
                      name="contactRole"
                      value={quickClient.contactRole}
                      errors={quickClientErrors}
                      prefix="quick-client"
                      maxLength={quickCreateLimits.contactRole + 16}
                      onChange={(value) => updateQuickClientField("contactRole", value)}
                    />
                  </div>
                  {quickClientErrors.form ? (
                    <div className="form-alert error">{quickClientErrors.form}</div>
                  ) : null}
                  <div className="request-wizard-subform-actions">
                    <button className="primary-button compact" type="submit" disabled={isSavingClient}>
                      <Plus size={16} />
                      {isSavingClient ? "Creating..." : "Create Client"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}

          {activeStep === "relations" ? (
            <section className="request-wizard-panel" aria-label="Point of contact and site">
              {selectedClient ? (
                <div className="request-wizard-selected-client">
                  <Building2 size={18} />
                  <span>
                    <strong>{selectedClient.displayName}</strong>
                    <small>{selectedClient.clientNumber}</small>
                  </span>
                  <button className="toolbar-button compact" type="button" onClick={() => setActiveStep("client")}>
                    Change
                  </button>
                </div>
              ) : null}

              <div className="request-wizard-relation-grid">
                <section className="request-wizard-relation-panel">
                  <div className="request-wizard-section-heading">
                    <div>
                      <span>Point of Contact</span>
                      <strong>{selectedContact?.name || "Required"}</strong>
                    </div>
                    {canCreateContact ? (
                      <button
                        className="toolbar-button compact"
                        type="button"
                        onClick={() => {
                          setContactOpen((open) => {
                            const nextOpen = !open;
                            if (nextOpen) {
                              setContactDraft(blankContactDraft());
                            }
                            return nextOpen;
                          });
                          setContactErrors({});
                        }}
                      >
                        <Plus size={16} />
                        New PoC
                      </button>
                    ) : null}
                  </div>

                  <div className="request-wizard-card-list">
                    {(selectedClient?.contacts ?? []).map((contact) => (
                      <button
                        key={contact.id}
                        className={contact.id === selectedContactId ? "request-wizard-card selected" : "request-wizard-card"}
                        type="button"
                        onClick={() => setSelectedContactId(contact.id)}
                      >
                        <UserRound size={17} />
                        <span>
                          <strong>{contact.name}</strong>
                          <small>{contact.email || contactPhone(contact) || "No contact method"}</small>
                        </span>
                      </button>
                    ))}
                  </div>

                  {selectedClient && !selectedClient.contacts.length ? (
                    <div className="request-wizard-empty">
                      <strong>No points of contact yet.</strong>
                      {!canCreateContact ? <span>Admin access is required to create one.</span> : null}
                    </div>
                  ) : null}

                  {contactOpen ? (
                    <form className="request-wizard-subform" onSubmit={createContact}>
                      <div className="request-wizard-field-grid">
                        <TextField
                          label="Name"
                          name="name"
                          value={contactDraft.name}
                          errors={contactErrors}
                          prefix="contact"
                          maxLength={contactFieldLimits.name + 16}
                          required
                          onChange={(value) => updateContactField("name", value)}
                        />
                        <TextField
                          label="Role"
                          name="role"
                          value={contactDraft.role}
                          errors={contactErrors}
                          prefix="contact"
                          maxLength={contactFieldLimits.role + 16}
                          onChange={(value) => updateContactField("role", value)}
                        />
                        <TextField
                          label="Title"
                          name="title"
                          value={contactDraft.title}
                          errors={contactErrors}
                          prefix="contact"
                          maxLength={contactFieldLimits.title + 16}
                          onChange={(value) => updateContactField("title", value)}
                        />
                        <SelectField
                          label="Preferred Contact"
                          name="preferredContactMethod"
                          value={contactDraft.preferredContactMethod}
                          options={preferredContactMethods}
                          errors={contactErrors}
                          prefix="contact"
                          onChange={(value) => updateContactField("preferredContactMethod", value)}
                        />
                        <TextField
                          label="Email"
                          name="email"
                          type="email"
                          value={contactDraft.email}
                          errors={contactErrors}
                          prefix="contact"
                          maxLength={contactFieldLimits.email + 16}
                          onChange={(value) => updateContactField("email", value)}
                        />
                        <TextField
                          label="Phone"
                          name="phone"
                          value={contactDraft.phone}
                          errors={contactErrors}
                          prefix="contact"
                          maxLength={contactFieldLimits.phone + 16}
                          onChange={(value) => updateContactField("phone", value)}
                        />
                        <TextAreaField
                          label="Notes"
                          name="notes"
                          value={contactDraft.notes}
                          errors={contactErrors}
                          prefix="contact"
                          onChange={(value) => updateContactField("notes", value)}
                        />
                      </div>
                      {contactErrors.form ? <div className="form-alert error">{contactErrors.form}</div> : null}
                      <div className="request-wizard-subform-actions">
                        <button className="primary-button compact" type="submit" disabled={isSavingContact}>
                          <Save size={16} />
                          {isSavingContact ? "Saving..." : "Save PoC"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </section>

                <section className="request-wizard-relation-panel">
                  <div className="request-wizard-section-heading">
                    <div>
                      <span>Site</span>
                      <strong>{selectedSite?.siteName || "Required"}</strong>
                    </div>
                    <button
                      className="toolbar-button compact"
                      type="button"
                      onClick={() => {
                        setSiteOpen((open) => {
                          const nextOpen = !open;
                          if (nextOpen) {
                            setSiteDraft(blankSiteDraft(!(selectedClient?.sites.length)));
                          }
                          return nextOpen;
                        });
                        setSiteErrors({});
                      }}
                    >
                      <Plus size={16} />
                      New Site
                    </button>
                  </div>

                  <div className="request-wizard-card-list">
                    {(selectedClient?.sites ?? []).map((site) => (
                      <button
                        key={site.id}
                        className={site.id === selectedSiteId ? "request-wizard-card selected" : "request-wizard-card"}
                        type="button"
                        onClick={() => setSelectedSiteId(site.id)}
                      >
                        <MapPin size={17} />
                        <span>
                          <strong>{site.siteName}</strong>
                          <small>{siteAddress(site) || "No address captured"}</small>
                        </span>
                      </button>
                    ))}
                  </div>

                  {selectedClient && !selectedClient.sites.length ? (
                    <div className="request-wizard-empty">
                      <strong>No sites yet.</strong>
                    </div>
                  ) : null}

                  {siteOpen ? (
                    <form className="request-wizard-subform" onSubmit={createSite}>
                      <div className="request-wizard-field-grid">
                        <TextField
                          label="Site Name"
                          name="siteName"
                          value={siteDraft.siteName}
                          errors={siteErrors}
                          prefix="site"
                          maxLength={siteFieldLimits.siteName + 16}
                          required
                          onChange={(value) => updateSiteField("siteName", value)}
                        />
                        <SelectField
                          label="Site Type"
                          name="siteType"
                          value={siteDraft.siteType}
                          options={clientSiteTypes}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("siteType", value)}
                        />
                        <TextField
                          label="Address Line 1"
                          name="addressLine1"
                          value={siteDraft.addressLine1}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("addressLine1", value)}
                        />
                        <TextField
                          label="Address Line 2"
                          name="addressLine2"
                          value={siteDraft.addressLine2}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("addressLine2", value)}
                        />
                        <TextField
                          label="City"
                          name="city"
                          value={siteDraft.city}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("city", value)}
                        />
                        <TextField
                          label="State"
                          name="state"
                          value={siteDraft.state}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("state", value)}
                        />
                        <TextField
                          label="Postal Code"
                          name="postalCode"
                          value={siteDraft.postalCode}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("postalCode", value)}
                        />
                        <TextField
                          label="Country"
                          name="country"
                          value={siteDraft.country}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("country", value)}
                        />
                        <TextField
                          label="Google Maps URL"
                          name="googleMapsUrl"
                          value={siteDraft.googleMapsUrl}
                          errors={siteErrors}
                          prefix="site"
                          wide
                          onChange={(value) => updateSiteField("googleMapsUrl", value)}
                        />
                        <TextAreaField
                          label="Access Instructions"
                          name="accessInstructions"
                          value={siteDraft.accessInstructions}
                          errors={siteErrors}
                          prefix="site"
                          onChange={(value) => updateSiteField("accessInstructions", value)}
                        />
                      </div>
                      <label className="request-wizard-toggle">
                        <input
                          type="checkbox"
                          checked={siteDraft.isPrimarySite}
                          onChange={(event) => updateSiteField("isPrimarySite", event.target.checked)}
                        />
                        Primary site
                      </label>
                      {siteErrors.form ? <div className="form-alert error">{siteErrors.form}</div> : null}
                      <div className="request-wizard-subform-actions">
                        <button className="primary-button compact" type="submit" disabled={isSavingSite}>
                          <Save size={16} />
                          {isSavingSite ? "Saving..." : "Save Site"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </section>
              </div>
            </section>
          ) : null}

          {activeStep === "request" ? (
            <form
              id="request-wizard-final-form"
              className="request-wizard-panel"
              onSubmit={createRequest}
            >
              <div className="request-wizard-final-summary">
                <div>
                  <span>Client</span>
                  <strong>{selectedClient?.displayName}</strong>
                </div>
                <div>
                  <span>PoC</span>
                  <strong>{selectedContact?.name}</strong>
                </div>
                <div>
                  <span>Site</span>
                  <strong>{selectedSite?.siteName}</strong>
                </div>
              </div>

              <div className="request-wizard-field-grid">
                <TextField
                  label="Title"
                  name="title"
                  value={requestInfo.title}
                  errors={requestErrors}
                  prefix="request"
                  maxLength={requestFieldLimits.title + 16}
                  required
                  wide
                  onChange={(value) => updateRequestInfo("title", value)}
                />
                <TextAreaField
                  label="Description"
                  name="description"
                  value={requestInfo.description}
                  errors={requestErrors}
                  prefix="request"
                  required
                  onChange={(value) => updateRequestInfo("description", value)}
                />
                <SelectField
                  label="Trade"
                  name="serviceCategory"
                  value={requestInfo.serviceCategory}
                  options={serviceCategories}
                  errors={requestErrors}
                  prefix="request"
                  required
                  onChange={(value) => updateRequestInfo("serviceCategory", value as ServiceCategory)}
                />
                <TextField
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={requestInfo.dueDate}
                  errors={requestErrors}
                  prefix="request"
                  required
                  onChange={(value) => updateRequestInfo("dueDate", value)}
                />
                <SelectField
                  label="Received By"
                  name="source"
                  value={requestInfo.source}
                  options={requestSources}
                  errors={requestErrors}
                  prefix="request"
                  onChange={(value) => updateRequestInfo("source", value as RequestSource)}
                />
                <SelectField
                  label="Request Type"
                  name="requestType"
                  value={requestInfo.requestType}
                  options={requestTypes}
                  errors={requestErrors}
                  prefix="request"
                  onChange={(value) => updateRequestInfo("requestType", value as RequestType)}
                />
                <SelectField
                  label="Priority"
                  name="priority"
                  value={requestInfo.priority}
                  options={requestPriorities}
                  errors={requestErrors}
                  prefix="request"
                  onChange={(value) => updateRequestInfo("priority", value as RequestPriority)}
                />
                <label className="request-wizard-field">
                  <span>Owner</span>
                  <select
                    value={requestInfo.assignedToId}
                    aria-invalid={Boolean(requestErrors.assignedToId)}
                    aria-describedby={
                      requestErrors.assignedToId ? "request-assignedToId-error" : undefined
                    }
                    onChange={(event) => updateRequestInfo("assignedToId", event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                    ))}
                  </select>
                  {requestErrors.assignedToId ? (
                    <small id="request-assignedToId-error" className="field-error">
                      {requestErrors.assignedToId}
                    </small>
                  ) : null}
                </label>
              </div>

              <label className="request-wizard-toggle request-wizard-toggle-strong">
                <input
                  type="checkbox"
                  checked={requestInfo.siteVisitNeeded}
                  onChange={(event) => updateRequestInfo("siteVisitNeeded", event.target.checked)}
                />
                Site visit will be needed
              </label>

              {requestErrors.form ? <div className="form-alert error">{requestErrors.form}</div> : null}

            </form>
          ) : null}
        </div>

        {formMessage ? <div className="form-alert error request-wizard-alert">{formMessage}</div> : null}

        <footer className="request-wizard-actions">
          <button
            className="toolbar-button compact"
            type="button"
            onClick={activeStep === "client" ? closeWizard : goBack}
            disabled={isBusy}
          >
            {activeStep === "client" ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft size={16} />
                Back
              </>
            )}
          </button>
          {activeStep === "request" ? (
            <button
              className="primary-button compact"
              type="submit"
              form="request-wizard-final-form"
              disabled={isSavingRequest}
            >
              <Save size={16} />
              {isSavingRequest ? "Saving..." : "Save Request"}
            </button>
          ) : (
            <button className="primary-button compact" type="button" onClick={goNext} disabled={isBusy}>
              Continue
              <ArrowRight size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
