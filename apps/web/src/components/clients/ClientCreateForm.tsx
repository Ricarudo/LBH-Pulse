"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  clientIndustries,
  clientOwners,
  clientStatuses,
  clientTypes,
  type ClientContactInput,
  type ClientCreatePayload,
  type ClientRecord,
  type ClientSiteInput,
  type ClientStatus,
  type ClientType
} from "@/types/client";
import { ClientContactForm } from "./ClientContactForm";
import { ClientSiteForm } from "./ClientSiteForm";
import { WizardNavigation } from "./WizardNavigation";
import { WizardProgress, type WizardStep } from "./WizardProgress";

type ClientResponse = {
  client: ClientRecord;
};

type ClientOverviewState = {
  legalName: string;
  displayName: string;
  clientType: ClientType;
  industry: string;
  website: string;
  status: ClientStatus;
  accountOwner: string;
  mainPhone: string;
  mainEmail: string;
  taxId: string;
  paymentTerms: string;
  billingEmail: string;
  preferredCurrency: string;
  preferredLanguage: string;
  brandPreferences: string;
  technologyPreferences: string;
  generalNotes: string;
  preferredVendors: string;
  preferredCameraBrand: string;
  preferredAccessControlBrand: string;
  preferredNetworkBrand: string;
  preferredCablingBrand: string;
  standardTechnologies: string;
  documentationRequirements: string;
  invoiceRequirements: string;
  insuranceRequirements: string;
  purchaseOrderRequired: boolean;
  serviceProfileText: string;
};

type ValidationResult = {
  message: string;
  step: number;
};

const wizardSteps: WizardStep[] = [
  {
    label: "Client Overview",
    description: "Identity"
  },
  {
    label: "Billing & Terms",
    description: "Commercial"
  },
  {
    label: "Sites / Locations",
    description: "Places"
  },
  {
    label: "Contacts",
    description: "People"
  },
  {
    label: "Preferences",
    description: "Technology"
  },
  {
    label: "Review & Create",
    description: "Confirm"
  }
];

const initialOverview: ClientOverviewState = {
  legalName: "",
  displayName: "",
  clientType: "Commercial",
  industry: "",
  website: "",
  status: "Prospect",
  accountOwner: "Alex Morgan",
  mainPhone: "",
  mainEmail: "",
  taxId: "",
  paymentTerms: "Net 30",
  billingEmail: "",
  preferredCurrency: "USD",
  preferredLanguage: "English",
  brandPreferences: "",
  technologyPreferences: "",
  generalNotes: "",
  preferredVendors: "",
  preferredCameraBrand: "",
  preferredAccessControlBrand: "",
  preferredNetworkBrand: "",
  preferredCablingBrand: "",
  standardTechnologies: "",
  documentationRequirements: "",
  invoiceRequirements: "",
  insuranceRequirements: "",
  purchaseOrderRequired: false,
  serviceProfileText: ""
};

function nextLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankSite(primary = false): ClientSiteInput {
  return {
    localId: nextLocalId("site"),
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

function createBlankContact(primary = false): ClientContactInput {
  return {
    firstName: "",
    lastName: "",
    title: "",
    department: "",
    email: "",
    phone: "",
    mobile: "",
    preferredContactMethod: "Email",
    siteLocalId: "",
    isPrimaryContact: primary,
    isBillingContact: false,
    isTechnicalContact: false,
    isDecisionMaker: false,
    notes: ""
  };
}

function hasSiteContent(site: ClientSiteInput) {
  return [
    site.siteName,
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.googleMapsUrl,
    site.operationalHours,
    site.accessInstructions,
    site.siteNotes
  ].some((value) => value?.trim());
}

function hasContactContent(contact: ClientContactInput) {
  return [
    contact.firstName,
    contact.lastName,
    contact.title,
    contact.department,
    contact.email,
    contact.phone,
    contact.mobile,
    contact.notes
  ].some((value) => value?.trim());
}

function hasContactIdentity(contact: ClientContactInput) {
  return [
    contact.firstName,
    contact.lastName,
    contact.email,
    contact.phone,
    contact.mobile
  ].some((value) => value?.trim());
}

function isEmailValid(email: string) {
  return !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function cleanValue(value: string | null | undefined) {
  return value?.trim() || "Not set";
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const zodIssue = Array.isArray(data.issues) ? data.issues[0]?.message : "";
    throw new Error(
      zodIssue || (typeof data.error === "string" ? data.error : "Request failed.")
    );
  }

  return data as T;
}

export function ClientCreateForm() {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const [overview, setOverview] = useState<ClientOverviewState>(initialOverview);
  const [sites, setSites] = useState<ClientSiteInput[]>([createBlankSite(true)]);
  const [contacts, setContacts] = useState<ClientContactInput[]>([
    createBlankContact(true)
  ]);
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [message, setMessage] = useState("Ready to create a database-backed client.");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const usefulSites = useMemo(() => sites.filter(hasSiteContent), [sites]);
  const usefulContacts = useMemo(
    () => contacts.filter(hasContactContent),
    [contacts]
  );
  const canCreateClient = canRole(user?.role, "crm:write");

  function updateSite(index: number, site: ClientSiteInput) {
    setSites((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? site : item))
    );
  }

  function updateContact(index: number, contact: ClientContactInput) {
    setContacts((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? contact : item))
    );
  }

  function makePrimarySite(index: number) {
    setSites((current) =>
      current.map((site, itemIndex) => ({
        ...site,
        isPrimarySite: itemIndex === index
      }))
    );
  }

  function makePrimaryContact(index: number) {
    setContacts((current) =>
      current.map((contact, itemIndex) => ({
        ...contact,
        isPrimaryContact: itemIndex === index
      }))
    );
  }

  function removeSite(index: number) {
    setSites((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function removeContact(index: number) {
    setContacts((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function validateStep(step: number): ValidationResult {
    if (step === 0) {
      if (!overview.legalName.trim() && !overview.displayName.trim()) {
        return { message: "Legal name or display name is required.", step };
      }

      if (!overview.industry.trim()) {
        return { message: "Industry is required.", step };
      }

      if (!isEmailValid(overview.mainEmail)) {
        return { message: "Main email needs a valid email format.", step };
      }
    }

    if (step === 1 && !isEmailValid(overview.billingEmail)) {
      return { message: "Billing email needs a valid email format.", step };
    }

    if (step === 2) {
      const incompleteSite = usefulSites.find((site) => !site.siteName.trim());
      if (incompleteSite) {
        return { message: "Every entered site needs a site name.", step };
      }

      const primarySiteCount = usefulSites.filter((site) => site.isPrimarySite).length;
      if (primarySiteCount > 1) {
        return { message: "Only one primary site is allowed.", step };
      }
    }

    if (step === 3) {
      const incompleteContact = usefulContacts.find(
        (contact) => !hasContactIdentity(contact)
      );
      if (incompleteContact) {
        return {
          message: "Every entered contact needs a name, email, phone, or mobile number.",
          step
        };
      }

      const invalidEmail = usefulContacts.find(
        (contact) => !isEmailValid(contact.email)
      );
      if (invalidEmail) {
        return { message: "Contact emails need a valid email format.", step };
      }

      const primaryContactCount = usefulContacts.filter(
        (contact) => contact.isPrimaryContact
      ).length;
      if (primaryContactCount > 1) {
        return { message: "Only one primary contact is allowed.", step };
      }
    }

    return { message: "", step };
  }

  function validateBeforeSubmit(): ValidationResult {
    for (let step = 0; step < wizardSteps.length - 1; step += 1) {
      const validation = validateStep(step);
      if (validation.message) {
        return validation;
      }
    }

    return { message: "", step: activeStep };
  }

  function completeStep(step: number) {
    setCompletedSteps((current) =>
      current.includes(step) ? current : [...current, step]
    );
  }

  function goNext() {
    const validation = validateStep(activeStep);
    if (validation.message) {
      setError(validation.message);
      return;
    }

    setError("");
    completeStep(activeStep);
    setActiveStep((step) => Math.min(step + 1, wizardSteps.length - 1));
    setMessage("Step saved in this draft. Review everything before creating.");
  }

  function goBack() {
    setError("");
    setActiveStep((step) => Math.max(step - 1, 0));
  }

  function goToStep(step: number) {
    if (step <= activeStep || completedSteps.includes(step)) {
      setError("");
      setActiveStep(step);
    }
  }

  function findSiteName(siteLocalId?: string | null) {
    return (
      sites.find((site) => site.localId === siteLocalId)?.siteName.trim() ||
      "No site selected"
    );
  }

  function buildPayload(): ClientCreatePayload {
    const validSiteLocalIds = new Set(
      usefulSites.map((site) => site.localId).filter(Boolean)
    );

    return {
      legalName: overview.legalName,
      displayName: overview.displayName,
      clientType: overview.clientType,
      industry: overview.industry,
      website: overview.website,
      status: overview.status,
      accountOwner: overview.accountOwner,
      mainPhone: overview.mainPhone,
      mainEmail: overview.mainEmail,
      taxId: overview.taxId,
      paymentTerms: overview.paymentTerms,
      billingEmail: overview.billingEmail,
      preferredCurrency: overview.preferredCurrency,
      preferredLanguage: overview.preferredLanguage,
      brandPreferences: overview.brandPreferences,
      technologyPreferences: overview.technologyPreferences,
      generalNotes: overview.generalNotes,
      preferredVendors: overview.preferredVendors,
      preferredCameraBrand: overview.preferredCameraBrand,
      preferredAccessControlBrand: overview.preferredAccessControlBrand,
      preferredNetworkBrand: overview.preferredNetworkBrand,
      preferredCablingBrand: overview.preferredCablingBrand,
      standardTechnologies: overview.standardTechnologies,
      documentationRequirements: overview.documentationRequirements,
      invoiceRequirements: overview.invoiceRequirements,
      insuranceRequirements: overview.insuranceRequirements,
      purchaseOrderRequired: overview.purchaseOrderRequired,
      serviceProfile: overview.serviceProfileText
        .split(",")
        .map((service) => service.trim())
        .filter(Boolean),
      sites: usefulSites,
      contacts: usefulContacts.map((contact) => ({
        ...contact,
        siteLocalId:
          contact.siteLocalId && validSiteLocalIds.has(contact.siteLocalId)
            ? contact.siteLocalId
            : ""
      }))
    };
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!canCreateClient) {
      setError("Your role does not allow creating clients.");
      return;
    }

    const validation = validateBeforeSubmit();
    if (validation.message) {
      setError(validation.message);
      setActiveStep(validation.step);
      return;
    }

    try {
      setIsSaving(true);
      setMessage("Saving client, sites, contacts, and preferences...");
      const data = await requestJson<ClientResponse>("/api/clients", {
        method: "POST",
        body: JSON.stringify(buildPayload())
      });
      setMessage(`${data.client.clientNumber} created for ${data.client.displayName}.`);
      window.setTimeout(() => router.push("/clients"), 700);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create this client."
      );
      setMessage("Client was not saved.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderOverviewStep() {
    return (
      <section className="client-create-section">
        <div className="client-create-section-heading">
          <Building2 size={19} />
          <div>
            <h3>Client Overview</h3>
            <p>Main account identity and relationship ownership.</p>
          </div>
        </div>
        <div className="client-form-grid">
          <label>
            Legal name <span className="required-hint">Required if no display name</span>
            <input
              value={overview.legalName}
              onChange={(event) =>
                setOverview({ ...overview, legalName: event.target.value })
              }
            />
          </label>
          <label>
            Display name <span className="required-hint">Required if no legal name</span>
            <input
              value={overview.displayName}
              onChange={(event) =>
                setOverview({ ...overview, displayName: event.target.value })
              }
            />
          </label>
          <label>
            Client type
            <select
              value={overview.clientType}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  clientType: event.target.value as ClientType
                })
              }
            >
              {clientTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Industry <span className="required-hint">Required</span>
            <select
              value={overview.industry}
              onChange={(event) =>
                setOverview({ ...overview, industry: event.target.value })
              }
            >
              <option value="">Select industry</option>
              {clientIndustries.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          </label>
          <label>
            Website
            <input
              value={overview.website}
              onChange={(event) =>
                setOverview({ ...overview, website: event.target.value })
              }
            />
          </label>
          <label>
            Main phone
            <input
              value={overview.mainPhone}
              onChange={(event) =>
                setOverview({ ...overview, mainPhone: event.target.value })
              }
            />
          </label>
          <label>
            Main email
            <input
              type="email"
              value={overview.mainEmail}
              onChange={(event) =>
                setOverview({ ...overview, mainEmail: event.target.value })
              }
            />
          </label>
          <label>
            Status
            <select
              value={overview.status}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  status: event.target.value as ClientStatus
                })
              }
            >
              {clientStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preferred language
            <input
              value={overview.preferredLanguage}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredLanguage: event.target.value
                })
              }
            />
          </label>
          <label>
            Account owner
            <select
              value={overview.accountOwner}
              onChange={(event) =>
                setOverview({ ...overview, accountOwner: event.target.value })
              }
            >
              {clientOwners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    );
  }

  function renderBillingStep() {
    return (
      <section className="client-create-section">
        <div className="client-create-section-heading">
          <div>
            <h3>Billing & Terms</h3>
            <p>Commercial defaults for invoices, quotes, and future billing workflows.</p>
          </div>
        </div>
        <div className="client-form-grid">
          <label>
            Payment terms
            <input
              value={overview.paymentTerms}
              onChange={(event) =>
                setOverview({ ...overview, paymentTerms: event.target.value })
              }
            />
          </label>
          <label>
            Billing email
            <input
              type="email"
              value={overview.billingEmail}
              onChange={(event) =>
                setOverview({ ...overview, billingEmail: event.target.value })
              }
            />
          </label>
          <label>
            Preferred currency
            <input
              value={overview.preferredCurrency}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredCurrency: event.target.value
                })
              }
            />
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={overview.purchaseOrderRequired}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  purchaseOrderRequired: event.target.checked
                })
              }
            />
            Purchase order required
          </label>
          <label className="client-form-wide">
            Billing requirements
            <textarea
              value={overview.invoiceRequirements}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  invoiceRequirements: event.target.value
                })
              }
            />
          </label>
          <label className="client-form-wide">
            Invoice notes
            <textarea
              value={overview.generalNotes}
              onChange={(event) =>
                setOverview({ ...overview, generalNotes: event.target.value })
              }
            />
          </label>
        </div>

        <details className="client-advanced-panel">
          <summary>Optional billing identifiers</summary>
          <div className="client-form-grid">
            <label>
              Tax ID placeholder
              <input
                value={overview.taxId}
                onChange={(event) =>
                  setOverview({ ...overview, taxId: event.target.value })
                }
              />
            </label>
          </div>
        </details>
      </section>
    );
  }

  function renderSitesStep() {
    return (
      <section className="client-create-section">
        <div className="client-create-section-heading">
          <div>
            <h3>Sites / Locations</h3>
            <p>Add offices, warehouses, data rooms, stores, and operational locations.</p>
          </div>
          <button
            className="toolbar-button compact"
            type="button"
            onClick={() => setSites((current) => [...current, createBlankSite(false)])}
          >
            <Plus size={17} />
            Add Site
          </button>
        </div>
        <div className="client-create-card-stack">
          {sites.map((site, index) => (
            <ClientSiteForm
              key={site.localId}
              site={site}
              index={index}
              canRemove={sites.length > 1}
              onChange={(nextSite) => updateSite(index, nextSite)}
              onRemove={() => removeSite(index)}
              onPrimaryChange={() => makePrimarySite(index)}
            />
          ))}
        </div>
      </section>
    );
  }

  function renderContactsStep() {
    return (
      <section className="client-create-section">
        <div className="client-create-section-heading">
          <div>
            <h3>Points of Contact</h3>
            <p>Capture primary, billing, technical, and decision-maker contacts.</p>
          </div>
          <button
            className="toolbar-button compact"
            type="button"
            onClick={() =>
              setContacts((current) => [...current, createBlankContact(false)])
            }
          >
            <Plus size={17} />
            Add Contact
          </button>
        </div>
        <div className="client-create-card-stack">
          {contacts.map((contact, index) => (
            <ClientContactForm
              key={index}
              contact={contact}
              sites={sites}
              index={index}
              canRemove={contacts.length > 1}
              onChange={(nextContact) => updateContact(index, nextContact)}
              onRemove={() => removeContact(index)}
              onPrimaryChange={() => makePrimaryContact(index)}
            />
          ))}
        </div>
      </section>
    );
  }

  function renderPreferencesStep() {
    return (
      <section className="client-create-section">
        <div className="client-create-section-heading">
          <div>
            <h3>Technology & Brand Preferences</h3>
            <p>Practical defaults that help estimating, procurement, and field work later.</p>
          </div>
        </div>
        <div className="client-form-grid">
          <label>
            Preferred camera platform
            <input
              value={overview.preferredCameraBrand}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredCameraBrand: event.target.value
                })
              }
            />
          </label>
          <label>
            Preferred access control platform
            <input
              value={overview.preferredAccessControlBrand}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredAccessControlBrand: event.target.value
                })
              }
            />
          </label>
          <label>
            Preferred network platform
            <input
              value={overview.preferredNetworkBrand}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredNetworkBrand: event.target.value
                })
              }
            />
          </label>
          <label>
            Preferred cabling standard
            <input
              value={overview.preferredCablingBrand}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredCablingBrand: event.target.value
                })
              }
            />
          </label>
          <label className="client-form-wide">
            Preferred vendors
            <input
              value={overview.preferredVendors}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  preferredVendors: event.target.value
                })
              }
            />
          </label>
          <label className="client-form-wide">
            Documentation requirements
            <textarea
              value={overview.documentationRequirements}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  documentationRequirements: event.target.value
                })
              }
            />
          </label>
          <label className="client-form-wide">
            Insurance or compliance notes
            <textarea
              value={overview.insuranceRequirements}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  insuranceRequirements: event.target.value
                })
              }
            />
          </label>
          <label className="client-form-wide">
            General technology preferences
            <textarea
              value={overview.technologyPreferences}
              onChange={(event) =>
                setOverview({
                  ...overview,
                  technologyPreferences: event.target.value
                })
              }
            />
          </label>
        </div>

        <details className="client-advanced-panel">
          <summary>Optional service and brand details</summary>
          <div className="client-form-grid">
            <label>
              Service profile
              <input
                placeholder="Access Control, CCTV, Network"
                value={overview.serviceProfileText}
                onChange={(event) =>
                  setOverview({
                    ...overview,
                    serviceProfileText: event.target.value
                  })
                }
              />
            </label>
            <label>
              Standard technologies
              <input
                value={overview.standardTechnologies}
                onChange={(event) =>
                  setOverview({
                    ...overview,
                    standardTechnologies: event.target.value
                  })
                }
              />
            </label>
            <label className="client-form-wide">
              Brand preferences
              <textarea
                value={overview.brandPreferences}
                onChange={(event) =>
                  setOverview({
                    ...overview,
                    brandPreferences: event.target.value
                  })
                }
              />
            </label>
          </div>
        </details>
      </section>
    );
  }

  function renderReviewStep() {
    return (
      <section className="client-create-section">
        <div className="client-create-section-heading">
          <div>
            <h3>Review & Create</h3>
            <p>Confirm the account record before Pulse writes it to Postgres.</p>
          </div>
        </div>

        <div className="client-review-grid">
          <article className="client-review-card">
            <div>
              <strong>Client Overview</strong>
              <button type="button" onClick={() => setActiveStep(0)}>
                Edit
              </button>
            </div>
            <dl>
              <dt>Client</dt>
              <dd>{cleanValue(overview.displayName || overview.legalName)}</dd>
              <dt>Legal name</dt>
              <dd>{cleanValue(overview.legalName)}</dd>
              <dt>Type</dt>
              <dd>{overview.clientType}</dd>
              <dt>Status</dt>
              <dd>{overview.status}</dd>
              <dt>Owner</dt>
              <dd>{overview.accountOwner}</dd>
              <dt>Email</dt>
              <dd>{cleanValue(overview.mainEmail)}</dd>
            </dl>
          </article>

          <article className="client-review-card">
            <div>
              <strong>Billing Terms</strong>
              <button type="button" onClick={() => setActiveStep(1)}>
                Edit
              </button>
            </div>
            <dl>
              <dt>Payment</dt>
              <dd>{cleanValue(overview.paymentTerms)}</dd>
              <dt>Billing email</dt>
              <dd>{cleanValue(overview.billingEmail)}</dd>
              <dt>Currency</dt>
              <dd>{cleanValue(overview.preferredCurrency)}</dd>
              <dt>PO required</dt>
              <dd>{overview.purchaseOrderRequired ? "Yes" : "No"}</dd>
            </dl>
          </article>

          <article className="client-review-card">
            <div>
              <strong>Sites</strong>
              <button type="button" onClick={() => setActiveStep(2)}>
                Edit
              </button>
            </div>
            {usefulSites.length ? (
              <ul className="client-review-list">
                {usefulSites.map((site) => (
                  <li key={site.localId}>
                    <span>
                      {site.siteName || "Unnamed site"}
                      {site.isPrimarySite ? " (Primary)" : ""}
                    </span>
                    <small>
                      {[site.addressLine1, site.city, site.state]
                        .filter(Boolean)
                        .join(", ") || site.siteType}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No sites entered yet.</p>
            )}
          </article>

          <article className="client-review-card">
            <div>
              <strong>Contacts</strong>
              <button type="button" onClick={() => setActiveStep(3)}>
                Edit
              </button>
            </div>
            {usefulContacts.length ? (
              <ul className="client-review-list">
                {usefulContacts.map((contact, index) => (
                  <li key={`${contact.email}-${index}`}>
                    <span>
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                        contact.email ||
                        "Unnamed contact"}
                      {contact.isPrimaryContact ? " (Primary)" : ""}
                    </span>
                    <small>
                      {cleanValue(contact.title)} / {findSiteName(contact.siteLocalId)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No contacts entered yet.</p>
            )}
          </article>

          <article className="client-review-card client-review-card-wide">
            <div>
              <strong>Preferences & Notes</strong>
              <button type="button" onClick={() => setActiveStep(4)}>
                Edit
              </button>
            </div>
            <dl>
              <dt>Camera</dt>
              <dd>{cleanValue(overview.preferredCameraBrand)}</dd>
              <dt>Access control</dt>
              <dd>{cleanValue(overview.preferredAccessControlBrand)}</dd>
              <dt>Network</dt>
              <dd>{cleanValue(overview.preferredNetworkBrand)}</dd>
              <dt>Cabling</dt>
              <dd>{cleanValue(overview.preferredCablingBrand)}</dd>
              <dt>Vendors</dt>
              <dd>{cleanValue(overview.preferredVendors)}</dd>
              <dt>Notes</dt>
              <dd>{cleanValue(overview.generalNotes)}</dd>
            </dl>
          </article>
        </div>
      </section>
    );
  }

  function renderActiveStep() {
    if (activeStep === 0) {
      return renderOverviewStep();
    }

    if (activeStep === 1) {
      return renderBillingStep();
    }

    if (activeStep === 2) {
      return renderSitesStep();
    }

    if (activeStep === 3) {
      return renderContactsStep();
    }

    if (activeStep === 4) {
      return renderPreferencesStep();
    }

    return renderReviewStep();
  }

  return (
    <form className="client-create-module" onSubmit={saveClient}>
      <section className="clients-hero">
        <div>
          <p className="eyebrow">Directory / New Client</p>
          <h2>Create a client account in guided steps.</h2>
          <p>
            Pulse will save one core account record with the sites, contacts,
            billing defaults, and operating preferences attached.
          </p>
        </div>
      </section>

      {!isUserLoading && !canCreateClient ? (
        <div className="form-alert error">
          Your role can view Directory records but cannot create clients.
        </div>
      ) : null}

      <WizardProgress
        steps={wizardSteps}
        activeStep={activeStep}
        completedSteps={completedSteps}
        onStepSelect={goToStep}
      />

      <section className="client-create-layout wizard">
        <div className="client-create-main">
          <div key={activeStep} className="wizard-step-content">
            {renderActiveStep()}
          </div>
          {error ? <div className="form-alert error">{error}</div> : null}
          <WizardNavigation
            activeStep={activeStep}
            totalSteps={wizardSteps.length}
            isSaving={isSaving || !canCreateClient}
            onBack={goBack}
            onCancel={() => router.push("/clients")}
            onNext={goNext}
          />
        </div>

        <aside className="client-create-summary">
          <strong>Creation Summary</strong>
          <span>Current step</span>
          <p>{wizardSteps[activeStep].label}</p>
          <span>Client</span>
          <p>{overview.displayName || overview.legalName || "Unnamed client"}</p>
          <span>Sites entered</span>
          <p>{usefulSites.length}</p>
          <span>Contacts entered</span>
          <p>{usefulContacts.length}</p>
          <span>Status</span>
          <p>{overview.status}</p>
          <div className="form-alert">{message}</div>
        </aside>
      </section>
    </form>
  );
}
