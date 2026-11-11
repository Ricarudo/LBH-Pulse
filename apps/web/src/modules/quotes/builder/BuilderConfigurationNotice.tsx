import { AlertTriangle, ExternalLink } from "lucide-react";
import type { CalculationConfiguration, CalculationDiagnostic } from "@pulse/contracts/quote-builder";

const labels: Record<Exclude<keyof CalculationConfiguration, "laborClasses" | "indirectRoles">, string> = {
  overtimeMultiplier: "Default overtime multiplier", practicalTimelineFactor: "Practical timeline factor",
  payrollBurden: "Payroll burden", laborContingency: "Labor contingency", laborMargin: "Labor target margin", fondo: "Fondo",
  vehicleWeeklyCost: "Vehicle weekly cost", annualRent: "Annual rent", annualBondInsurance: "Annual bond / insurance",
  materialMargin: "Material target margin", materialFreight: "Material freight", materialContingency: "Material contingency",
  materialIvuRate: "Material IVU rate", b2bServiceTaxRate: "B2B / Service Tax rate"
};

function settingLabel(path: string, configuration: CalculationConfiguration): string {
  if (path === "configuration.indirectRoles") return "Indirect labor / supervision roles";
  for (const role of configuration.indirectRoles ?? []) {
    if (path === `configuration.indirectRoles.${role.id}.weeklyCost`) return `${role.name} · weekly cost`;
    if (path === `configuration.indirectRoles.${role.id}.allocationPercent`) return `${role.name} · allocation`;
  }
  for (const role of configuration.laborClasses) {
    if (path === `configuration.laborClasses.${role.id}.hourlyRate`) return `${role.name} · hourly rate`;
  }
  return labels[path.replace(/^configuration\./, "") as keyof typeof labels] ?? "Company calculation setting";
}

/** Presentation of engine diagnostics only. Missing costs must never become implicit zeroes. */
export function BuilderConfigurationNotice({ diagnostics, configuration, compact = false }: {
  diagnostics: CalculationDiagnostic[]; configuration: CalculationConfiguration; compact?: boolean;
}) {
  const issues = [...new Map(diagnostics.filter(issue => issue.path.startsWith("configuration.")).map(issue => [issue.path, issue])).values()];
  if (!issues.length) return null;
  const invalid = issues.some(issue => issue.category === "invalid");
  return <div className={`qb-configuration-notice${invalid ? " invalid" : ""}${compact ? " compact" : ""}`} role="status">
    <strong><AlertTriangle size={14} aria-hidden="true" />{compact ? "Labor pricing pending" : "Company calculation settings need attention"}</strong>
    {compact ? <p>Check in Settings: {issues.map(issue => settingLabel(issue.path, configuration)).join(", ")}.</p> : <ul>{issues.map(issue => <li key={issue.path}><strong>{settingLabel(issue.path, configuration)}</strong> — {issue.message}</li>)}</ul>}
    <a className="qb-settings-link" href="/settings/quote-calculation" target="_blank" rel="noopener noreferrer">Open calculation settings <ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
    <p>Save company settings, then use Reload workspace to apply them here. Blank costs are not treated as $0.</p>
  </div>;
}
