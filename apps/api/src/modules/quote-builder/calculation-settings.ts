import type { CalculationSettings } from "@pulse/contracts/quote-builder";

// Approved company starting values. The engine never imports this settings seed.
// Unestablished costs stay unset until an administrator configures them or explicit zero.
export const initialCalculationSettings: CalculationSettings = {
  overtimeMultiplier: "1", practicalTimelineFactor: "1.4", materialIvuRate: "0.115", b2bServiceTaxRate: "0.04",
  payrollBurden: "0.35", laborContingency: "0.15", laborMargin: "0.5", fondo: "0.016",
  materialMargin: "0.3", materialFreight: "0.05", materialContingency: "0.025",
  vehicleWeeklyCost: null, annualRent: null, annualBondInsurance: null, indirectRoles: null
};
