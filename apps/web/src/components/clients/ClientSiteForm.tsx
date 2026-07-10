"use client";

import { Trash2 } from "lucide-react";
import { clientSiteTypes, type ClientSiteInput } from "@pulse/contracts/clients";

type ClientSiteFormProps = {
  site: ClientSiteInput;
  index: number;
  canRemove: boolean;
  onChange: (site: ClientSiteInput) => void;
  onRemove: () => void;
  onPrimaryChange: () => void;
};

export function ClientSiteForm({
  site,
  index,
  canRemove,
  onChange,
  onRemove,
  onPrimaryChange
}: ClientSiteFormProps) {
  return (
    <article className="client-create-card">
      <div className="client-create-card-header">
        <div>
          <strong>Site {index + 1}</strong>
          <span>{site.siteName || "New location"}</span>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Remove site"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={17} />
        </button>
      </div>

      <div className="client-form-grid">
        <label>
          Site name
          <input
            value={site.siteName}
            onChange={(event) => onChange({ ...site, siteName: event.target.value })}
          />
        </label>
        <label>
          Site type
          <select
            value={site.siteType}
            onChange={(event) => onChange({ ...site, siteType: event.target.value })}
          >
            {clientSiteTypes.map((siteType) => (
              <option key={siteType} value={siteType}>
                {siteType}
              </option>
            ))}
          </select>
        </label>
        <label>
          Address line 1
          <input
            value={site.addressLine1}
            onChange={(event) => onChange({ ...site, addressLine1: event.target.value })}
          />
        </label>
        <label>
          Address line 2
          <input
            value={site.addressLine2}
            onChange={(event) => onChange({ ...site, addressLine2: event.target.value })}
          />
        </label>
        <label>
          City
          <input
            value={site.city}
            onChange={(event) => onChange({ ...site, city: event.target.value })}
          />
        </label>
        <label>
          State
          <input
            value={site.state}
            onChange={(event) => onChange({ ...site, state: event.target.value })}
          />
        </label>
        <label>
          Postal code
          <input
            value={site.postalCode}
            onChange={(event) => onChange({ ...site, postalCode: event.target.value })}
          />
        </label>
        <label>
          Country
          <input
            value={site.country}
            onChange={(event) => onChange({ ...site, country: event.target.value })}
          />
        </label>
        <label className="client-form-wide">
          Google Maps URL
          <input
            value={site.googleMapsUrl}
            onChange={(event) => onChange({ ...site, googleMapsUrl: event.target.value })}
          />
        </label>
        <label>
          Operational hours
          <input
            value={site.operationalHours}
            onChange={(event) => onChange({ ...site, operationalHours: event.target.value })}
          />
        </label>
        <label>
          Access instructions
          <input
            value={site.accessInstructions}
            onChange={(event) => onChange({ ...site, accessInstructions: event.target.value })}
          />
        </label>
        <label>
          Parking instructions
          <input
            value={site.parkingInstructions}
            onChange={(event) => onChange({ ...site, parkingInstructions: event.target.value })}
          />
        </label>
        <label>
          Security requirements
          <input
            value={site.securityRequirements}
            onChange={(event) => onChange({ ...site, securityRequirements: event.target.value })}
          />
        </label>
        <label className="client-form-wide">
          Site notes
          <textarea
            value={site.siteNotes}
            onChange={(event) => onChange({ ...site, siteNotes: event.target.value })}
          />
        </label>
      </div>

      <label className="client-checkbox">
        <input
          type="checkbox"
          checked={site.isPrimarySite}
          onChange={onPrimaryChange}
        />
        Primary site
      </label>
    </article>
  );
}
