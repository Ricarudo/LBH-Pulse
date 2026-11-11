"use client";
import type { BuilderWorkspace, CalculationResult, Metric } from "@pulse/contracts/quote-builder";
import { formatAllocationFactor } from "@pulse/quote-calculator";
import { builderPresentation, percentText } from "@/lib/quoteBuilder";
import { money, numberText } from "./BuilderFields";

function Amounts({ rows }: { rows: Array<[string, Metric]> }) {
  return <dl className="qb-amounts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value ?? undefined}>{value === null ? "—" : `$${value}`}</dd></div>)}</dl>;
}

export function QuoteAnalysis({ state, result }: { state: BuilderWorkspace; result: CalculationResult }) {
  const { labor, material, tax, projectCosts, totals } = result;
  return <div className="qb-analysis">
    <p className="panel-note">Analysis of the current Builder calculation. Unavailable values appear as — or N/A; independently calculated material values remain visible.</p>
    <div className="qb-metrics">{[
      ["Direct labor hours", numberText(labor.directHours)], ["Effective crew size", numberText(labor.effectiveCrewSize)],
      ["Ideal duration", `${numberText(labor.idealHours)} hours`], ["Practical timeline", `${numberText(labor.practicalDays)} days`],
      ["Labor allocation factor", formatAllocationFactor(labor.allocationFactor)], ["Final customer total", money(totals.finalPayableTotal)]
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="qb-analysis-section"><h3>Labor Analysis</h3><Amounts rows={[
      ["Direct labor", labor.directCost], ["Supervision / indirect labor", labor.supervision], ["Payroll burden", labor.payrollBurden],
      ["Labor contingency", labor.contingency], ["Payroll subtotal", labor.payrollSubtotal], ["Vehicles", labor.vehicles],
      ["Equipment rental", labor.equipmentRental], ["Pre-margin labor cost", labor.preMarginCost], ["Labor overhead / profit", labor.profit],
      ["Post-margin amount", labor.postMarginAmount], ["Rent allocation", labor.rent], ["Bond / insurance allocation", labor.bondInsurance],
      ["Lodging", labor.lodging], ["Travel", labor.travel], ["Fondo", labor.fondo], ["Total loaded labor", labor.loadedTotal],
      ["Precise labor selling target", labor.preciseLaborSellingTarget], ["Raw allocated line value", labor.rawAllocatedLaborValue], ["Rounded customer labor value", labor.roundedCustomerLaborValue], ["Labor allocation / rounding delta", labor.laborAllocationRoundingDelta], ["Allocation decimal precision residual", labor.allocationPrecisionDelta]
    ]} />
      <p>Labor allocation factor: <strong>{formatAllocationFactor(labor.allocationFactor)}</strong> · Total loaded labor / direct labor cost.</p>
      {labor.supervisionRoles.length ? <details><summary>Indirect role breakdown</summary><Amounts rows={labor.supervisionRoles.map(role => [role.name, role.cost])} /></details> : null}
    </section>
    <section className="qb-analysis-section"><h3>Material Analysis</h3><Amounts rows={[
      ["Base material cost", material?.baseCost ?? null], ["Material contingency", material?.contingency ?? null], ["Freight", material?.freight ?? null],
      ["Material IVU — embedded", material?.materialIvuAmount ?? null], ["Material profit — base cost only", material?.profit ?? null],
      ["Calculated material selling total", material?.rawTotal ?? null], ["Customer material after upward unit rounding", material?.customerTotal ?? null], ["Material rounding difference", material?.roundingDifference ?? null]
    ]} /></section>
    <section className="qb-analysis-section"><h3>Tax &amp; Totals</h3><p>Material IVU is embedded in applicable material unit prices. B2B / Service Tax is a separate charge on rounded labor selling value plus material profit and contingency.</p><Amounts rows={[
      ["Rounded customer labor operand", tax.roundedCustomerLaborValue], ["Raw material contingency operand", tax.rawMaterialContingency], ["Raw material profit operand", tax.rawMaterialProfit], ["Material IVU — embedded, excluded from B2B base", tax.materialIvuAmount], ["Freight — excluded from B2B base", material?.freight ?? null], ["B2B / Service Tax base", tax.b2bTaxableBase],
      [`B2B / Service Tax (${percentText(tax.b2bServiceTaxRate)}%)`, tax.b2bServiceTaxAmount], ["Total before payable rounding", totals.rawFinalCustomerTotal],
      ["Payable rounding adjustment", totals.payableRoundingAdjustment], ["Final customer total", totals.finalPayableTotal]
    ]} /></section>
    <section className="qb-analysis-section"><h3>Timeline &amp; Project Costs</h3>
      <dl className="qb-amounts">{[["Practical hours", labor.practicalHours], ["Practical days (8 hours)", labor.practicalDays], ["Practical weeks (40 hours)", labor.practicalWeeks], ["Lodging headcount", labor.lodgingHeadcount], ["Lodging nights", labor.lodgingNights]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{numberText(value)}</dd></div>)}</dl>
      <div className="qb-cost-comparison">
        <article><h4>Incurred / Entered Project Costs</h4><Amounts rows={[["Travel", projectCosts.entered.travelTotal], ["Equipment rental", projectCosts.entered.equipmentRentalTotal], ["Nightly lodging rate / person", projectCosts.entered.lodgingNightlyRate], ["Calculated lodging cost", labor.lodging], ["Raw project cost total", projectCosts.incurredProjectCosts]]} />{projectCosts.incurredProjectCosts === null ? <p>Known entered cost: {money(projectCosts.knownEnteredCostTotal)}. Unresolved costs: {projectCosts.unresolvedCosts.map(key => ({ travel: "Travel", equipmentRental: "Equipment rental", lodging: "Lodging" })[key]).join(", ") || "allocation"}.</p> : null}</article>
        <article className={`qb-recovery ${projectCosts.allocationStatus}`}><h4>Allocated / Recovered Project Costs</h4><Amounts rows={[["Project costs allocated through labor", projectCosts.recoveredProjectCosts], ["Unrecovered project costs", projectCosts.unrecoveredProjectCosts], ["Loaded selling value not allocated", projectCosts.unallocatedLoadedSellingValue]]} /><p>{projectCosts.allocationStatus === "allocated" ? "These project costs are included in loaded labor and distributed through the labor allocation factor." : "Entered costs are retained. Costs without a direct labor allocation base are not incorporated into customer prices."}</p></article>
      </div>
    </section>
    <section className="qb-analysis-section"><h3>Group Breakdown</h3><p>Groups organize calculated lines. Moving or reordering a line does not change the quote calculation.</p><div className="qb-table-scroll"><table className="data-table"><thead><tr><th>Group</th><th>Material</th><th>Labor</th><th>Total before B2B</th></tr></thead><tbody>{builderPresentation(state, result).filter(group => group.lines.length).map(group => <tr key={group.id ?? "ungrouped"}><td>{group.title}</td><td>{money(group.materialTotal)}</td><td>{money(group.laborTotal)}</td><td>{money(group.total)}</td></tr>)}</tbody></table></div></section>
    <section className="qb-analysis-section"><h3>Rounding &amp; Reconciliation</h3><p>Each customer-facing material and labor unit price rounds upward to the next cent before extending by quantity. Pre-round values below retain calculator precision. The allocation / rounding delta is rounded customer labor minus the precise labor target. Upward rounding can increase the customer value; no balancing line is used.</p><div className="qb-table-scroll"><table className="data-table qb-rounding-table"><thead><tr><th>Line</th><th>Quantity</th><th>Component</th><th>Raw allocated / extended value</th><th>Pre-round unit</th><th>Customer unit</th><th>Extended value</th></tr></thead><tbody>{state.lines.flatMap(line => {
      const calculated = result.lines.find(row => row.id === line.id)!;
      return (["material", "labor"] as const).filter(key => key === "material" ? line.mode !== "LABOR_ONLY" : line.mode !== "MATERIAL_ONLY").map(key => <tr key={`${line.id}-${key}`}><td>{line.name}</td><td>{line.quantity ?? "—"}</td><td>{key === "material" ? "Material" : "Labor"}</td><td className="qb-raw-decimal">{calculated[key]?.rawTotal ?? "—"}</td><td className="qb-raw-decimal">{calculated[key]?.rawUnit ?? "—"}</td><td>{money(calculated[key]?.customerUnit ?? null)}</td><td title={calculated[key]?.customerTotal ?? undefined}>{calculated[key]?.customerTotal ?? "—"}</td></tr>);
    })}</tbody></table></div></section>
  </div>;
}
