import type { CalculationConfiguration, FinancialLine, ProjectCosts } from "@pulse/contracts/quote-builder";

// TEST-ONLY values. These are explicit synthetic role allocations, not production seeds
// or a claim that the original workbook's individual role configuration was recovered.
export function fixtureConfiguration(): CalculationConfiguration {
  return {
    overtimeMultiplier: "1", practicalTimelineFactor: "1.4", materialIvuRate: "0.115", b2bServiceTaxRate: "0.04",
    payrollBurden: "0.35", laborContingency: "0.15", laborMargin: "0.5", fondo: "0.016",
    materialMargin: "0.3", materialFreight: "0.05", materialContingency: "0.025",
    vehicleWeeklyCost: "200", annualRent: "72000", annualBondInsurance: "26000",
    laborClasses: [{ id: "technician", name: "Technician", enabled: true, hourlyRate: "25" }, { id: "specialist", name: "Specialist", enabled: true, hourlyRate: "40" }],
    indirectRoles: [
      { id: "manager", name: "Fixture management", weeklyCost: "1000", allocationPercent: "0.5", enabled: true },
      { id: "support", name: "Fixture support", weeklyCost: "550", allocationPercent: "0.25", enabled: true },
      { id: "disabled", name: "Disabled fixture role", weeklyCost: null, allocationPercent: null, enabled: false }
    ]
  };
}
export function fixtureLine(overrides: Partial<FinancialLine> = {}): FinancialLine {
  return {
    id: "cable", quantity: "9000", mode: "MATERIAL_AND_LABOR",
    material: { baseUnitCost: "1", contingency: "0.025", freight: "0.05", margin: "0.3", materialIvuEnabled: true, materialIvuRate: "0.115" },
    labor: { laborClassId: "technician", productionRate: "1500", crewSize: "4", overtimeMultiplier: "1" },
    ...overrides
  };
}
export const zeroProjectCosts: ProjectCosts = { travelTotal: "0", equipmentRentalTotal: "0", lodgingNightlyRate: "0", lodgingHeadcountOverride: null };
