"use client";

import { Trash2 } from "lucide-react";
import {
  preferredContactMethods,
  type ClientContactInput,
  type ClientSiteInput
} from "@/types/client";

type ClientContactFormProps = {
  contact: ClientContactInput;
  sites: ClientSiteInput[];
  index: number;
  canRemove: boolean;
  onChange: (contact: ClientContactInput) => void;
  onRemove: () => void;
  onPrimaryChange: () => void;
};

export function ClientContactForm({
  contact,
  sites,
  index,
  canRemove,
  onChange,
  onRemove,
  onPrimaryChange
}: ClientContactFormProps) {
  return (
    <article className="client-create-card">
      <div className="client-create-card-header">
        <div>
          <strong>Contact {index + 1}</strong>
          <span>
            {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
              "New point of contact"}
          </span>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Remove contact"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={17} />
        </button>
      </div>

      <div className="client-form-grid">
        <label>
          First name
          <input
            value={contact.firstName}
            onChange={(event) => onChange({ ...contact, firstName: event.target.value })}
          />
        </label>
        <label>
          Last name
          <input
            value={contact.lastName}
            onChange={(event) => onChange({ ...contact, lastName: event.target.value })}
          />
        </label>
        <label>
          Title
          <input
            value={contact.title}
            onChange={(event) => onChange({ ...contact, title: event.target.value })}
          />
        </label>
        <label>
          Department
          <input
            value={contact.department}
            onChange={(event) => onChange({ ...contact, department: event.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={contact.email}
            onChange={(event) => onChange({ ...contact, email: event.target.value })}
          />
        </label>
        <label>
          Phone
          <input
            value={contact.phone}
            onChange={(event) => onChange({ ...contact, phone: event.target.value })}
          />
        </label>
        <label>
          Mobile
          <input
            value={contact.mobile}
            onChange={(event) => onChange({ ...contact, mobile: event.target.value })}
          />
        </label>
        <label>
          Preferred contact
          <select
            value={contact.preferredContactMethod}
            onChange={(event) =>
              onChange({ ...contact, preferredContactMethod: event.target.value })
            }
          >
            {preferredContactMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="client-form-wide">
          Related site
          <select
            value={contact.siteLocalId ?? ""}
            onChange={(event) =>
              onChange({ ...contact, siteLocalId: event.target.value })
            }
          >
            <option value="">No site selected</option>
            {sites
              .filter((site) => site.siteName.trim())
              .map((site) => (
                <option key={site.localId} value={site.localId}>
                  {site.siteName}
                </option>
              ))}
          </select>
        </label>
        <label className="client-form-wide">
          Contact notes
          <textarea
            value={contact.notes}
            onChange={(event) => onChange({ ...contact, notes: event.target.value })}
          />
        </label>
      </div>

      <div className="client-checkbox-grid">
        <label className="client-checkbox">
          <input
            type="checkbox"
            checked={contact.isPrimaryContact}
            onChange={onPrimaryChange}
          />
          Primary contact
        </label>
        <label className="client-checkbox">
          <input
            type="checkbox"
            checked={contact.isBillingContact}
            onChange={(event) =>
              onChange({ ...contact, isBillingContact: event.target.checked })
            }
          />
          Billing contact
        </label>
        <label className="client-checkbox">
          <input
            type="checkbox"
            checked={contact.isTechnicalContact}
            onChange={(event) =>
              onChange({ ...contact, isTechnicalContact: event.target.checked })
            }
          />
          Technical contact
        </label>
        <label className="client-checkbox">
          <input
            type="checkbox"
            checked={contact.isDecisionMaker}
            onChange={(event) =>
              onChange({ ...contact, isDecisionMaker: event.target.checked })
            }
          />
          Decision maker
        </label>
      </div>
    </article>
  );
}

