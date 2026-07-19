import { stringifyCsv } from "@/lib/importers/csvImportUtils";

export const legacyQuoteCsvHeaders = [
  "external_quote_number",
  "title",
  "client_number",
  "client_name",
  "contact_name",
  "contact_email",
  "status",
  "owner_email",
  "material_sale",
  "material_cost",
  "labor_sale",
  "labor_cost",
  "tax_amount",
  "estimated_duration_business_days",
  "created_at",
  "sent_at",
  "approved_at",
  "scope_description",
  "internal_notes",
  "proposal_notes"
] as const;

export type LegacyQuoteCsvHeader = (typeof legacyQuoteCsvHeaders)[number];
export type LegacyQuoteCsvRow = Record<LegacyQuoteCsvHeader, string>;

export function legacyQuoteCsvTemplate() {
  return stringifyCsv(legacyQuoteCsvHeaders, [{
    external_quote_number: "LEGACY-1001", title: "Sample security upgrade", client_number: "CL-1001", client_name: "Sample Company",
    contact_name: "Jordan Rivera", contact_email: "jordan@sample.example", status: "Approved", owner_email: "",
    material_sale: "12500.00", material_cost: "8000.00", labor_sale: "3500.00", labor_cost: "1800.00", tax_amount: "1595.00",
    estimated_duration_business_days: "10", created_at: "2025-01-06T13:00:00.000Z", sent_at: "2025-01-10T15:00:00.000Z",
    approved_at: "2025-01-15T17:00:00.000Z", scope_description: "Replace sample scope before importing.", internal_notes: "", proposal_notes: ""
  }]);
}
