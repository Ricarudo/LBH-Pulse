import assert from "node:assert/strict";
import test from "node:test";
import { builderCalculationInput, emptyBuilderWorkspace, type BuilderWorkspace, type CalculationInput } from "@pulse/contracts/quote-builder";
import { calculateQuote, calculateLaborStages, formatAllocationFactor } from "./index";
import { fixtureConfiguration, fixtureLine, zeroProjectCosts } from "./fixtures";
import { calculateB2bTax } from "./tax";
import Decimal from "decimal.js-light";

function input(): CalculationInput { return { lines: [fixtureLine()], configuration: fixtureConfiguration(), projectCosts: { ...zeroProjectCosts } }; }
function near(actual: string | null, expected: number) { assert.notEqual(actual, null); assert.ok(Math.abs(Number(actual) - expected) < 1e-8, `${actual} != ${expected}`); }

test("production means crew output per hour, with practical parallel-work duration", () => {
  const result = calculateQuote(input());
  assert.equal(result.status, "complete");
  assert.equal(result.lines[0].labor?.installationHours, "6");
  assert.equal(result.labor.directHours, "24");
  assert.equal(result.labor.directCost, "600");
  assert.equal(result.labor.effectiveCrewSize, "4");
  assert.equal(result.labor.idealHours, "6");
  assert.equal(result.labor.practicalHours, "8.4");
  assert.equal(result.labor.practicalDays, "1.05");
  assert.equal(result.labor.practicalWeeks, "0.21");
  assert.equal(result.labor.supervision, "133.875");
  assert.equal(result.labor.supervisionRoles[2].cost, "28.875");
  assert.equal(result.labor.payrollBurden, "256.85625");
  assert.equal(result.labor.contingency, "148.6096875");
  assert.equal(result.labor.payrollSubtotal, "1139.3409375");
  assert.equal(result.labor.vehicles, "42");
  assert.equal(result.labor.preMarginCost, "1181.3409375");
  assert.equal(result.labor.profit, "1181.3409375");
  assert.equal(result.labor.postMarginAmount, "2362.681875");
  near(result.labor.rent, 290.7692307692308);
  assert.equal(result.labor.bondInsurance, "105");
  assert.equal(result.labor.fondo, "37.80291");
  near(result.labor.loadedTotal, 2796.254015769231);
});

test("material IVU is embedded, profit is on base only, and B2B uses its separate base", () => {
  const result = calculateQuote(input());
  const material = result.material!;
  assert.equal(material.baseCost, "9000");
  assert.equal(material.contingency, "225");
  assert.equal(material.freight, "450");
  assert.equal(material.materialIvuAmount, "1035");
  near(material.profit, 3857.142857142857);
  near(result.lines[0].material!.rawUnit, 1.6185714285714285);
  assert.equal(result.lines[0].material!.customerUnit, "1.62");
  assert.equal(material.customerTotal, "14580");
  assert.equal(result.labor.customerTotal, "2880");
  near(result.tax.b2bTaxableBase, 6962.142857142857);
  near(result.tax.b2bServiceTaxAmount, 278.48571428571427);
  assert.equal(result.totals.finalPayableTotal, "17738.49");
});

test("mixed crews use an unweighted contributor average, not sequential duration", () => {
  const data = input();
  data.lines.push(fixtureLine({ id: "second", quantity: "6", labor: { laborClassId: "specialist", productionRate: "3", crewSize: "2", overtimeMultiplier: "1.5" } }));
  const r = calculateQuote(data);
  assert.equal(r.labor.effectiveCrewSize, "3");
  assert.equal(r.labor.directHours, "28");
  assert.equal(r.labor.directCost, "840");
  near(r.labor.idealHours, 28 / 3);
});

test("rental is a total before margin; travel and lodging are after margin", () => {
  const data = input();
  data.projectCosts = { travelTotal: "120", equipmentRentalTotal: "100", lodgingNightlyRate: "80", lodgingHeadcountOverride: null };
  const r = calculateQuote(data);
  assert.equal(r.labor.equipmentRental, "100");
  assert.equal(r.labor.preMarginCost, "1281.3409375");
  assert.equal(r.labor.lodgingHeadcount, "4");
  assert.equal(r.labor.lodgingNights, "2");
  assert.equal(r.labor.lodging, "640");
  assert.equal(r.projectCosts.enteredCostTotal, "860");
  assert.equal(r.projectCosts.allocatedCostTotal, "860");
  data.projectCosts.lodgingHeadcountOverride = "3";
  assert.equal(calculateQuote(data).labor.lodging, "480");
});

test("material-only works with unused labor configuration unset", () => {
  const data = input(); data.lines[0].mode = "MATERIAL_ONLY";
  Object.assign(data.configuration, { laborClasses: [], indirectRoles: null, vehicleWeeklyCost: null, annualRent: null, annualBondInsurance: null, payrollBurden: null, laborContingency: null, laborMargin: null, fondo: null, practicalTimelineFactor: null });
  const r = calculateQuote(data);
  assert.equal(r.status, "complete");
  assert.equal(r.labor.allocationFactor, null);
  assert.equal(r.labor.customerTotal, "0");
  assert.equal(r.material!.customerTotal, "14580");
});

test("zero labor preserves entered expenses without pretending they are recovered", () => {
  const data = input(); data.lines[0].mode = "MATERIAL_ONLY";
  data.projectCosts.travelTotal = "120"; data.projectCosts.equipmentRentalTotal = "100";
  const r = calculateQuote(data);
  assert.equal(r.status, "incomplete");
  assert.equal(r.material!.customerTotal, "14580");
  assert.equal(r.projectCosts.enteredCostTotal, "220");
  assert.equal(r.projectCosts.allocatedCostTotal, "0");
  assert.equal(r.projectCosts.unallocatedCostTotal, "220");
  assert.equal(r.projectCosts.unallocatedLoadedSellingValue, "323.2");
  assert.equal(r.totals.finalPayableTotal, null);
  assert.equal(r.labor.allocationFactor, null);
  assert.ok(r.diagnostics.some(d => d.code === "NO_LABOR_ALLOCATION_BASE"));
  data.projectCosts.lodgingNightlyRate = "80";
  const lodging = calculateQuote(data);
  assert.equal(lodging.projectCosts.enteredCostTotal, null);
  assert.equal(lodging.projectCosts.knownEnteredCostTotal, "220");
  assert.ok(lodging.diagnostics.some(d => d.code === "LODGING_DURATION_REQUIRED"));
});

test("zero rows never affect crew averages or require labor defaults", () => {
  const data = input(); const before = calculateQuote(data);
  data.lines.push(fixtureLine({ id: "zero", quantity: "0", labor: { laborClassId: null, productionRate: null, crewSize: "99", overtimeMultiplier: null } }));
  const after = calculateQuote(data);
  assert.equal(after.status, "complete");
  assert.deepEqual(after.labor, before.labor);
  assert.deepEqual(after.totals, before.totals);
  assert.equal(after.lines[1].customerTotal, "0");
});

test("empty and zero-valued quotes calculate safely", () => {
  const data = input(); data.lines = [];
  assert.equal(calculateQuote(data).totals.finalPayableTotal, "0");
  data.lines = [fixtureLine({ mode: "LABOR_ONLY" })];
  data.configuration.laborClasses[0].hourlyRate = "0";
  Object.assign(data.configuration, { indirectRoles: [], vehicleWeeklyCost: "0", annualRent: "0", annualBondInsurance: "0" });
  const r = calculateQuote(data);
  assert.equal(r.status, "complete");
  assert.equal(r.labor.allocationFactor, null);
  assert.equal(r.totals.finalPayableTotal, "0");
});

test("missing differs from invalid and configured zero; dependent results stay unavailable", () => {
  const data = input(); data.lines[0].labor.productionRate = null;
  let r = calculateQuote(data);
  assert.equal(r.status, "incomplete"); assert.equal(r.labor.idealHours, null); assert.notEqual(r.material, null);
  data.lines[0].labor.productionRate = "0";
  assert.equal(calculateQuote(data).status, "invalid");
  data.lines[0].labor.productionRate = "1500";
  data.configuration.vehicleWeeklyCost = null;
  r = calculateQuote(data); assert.equal(r.status, "incomplete"); assert.equal(r.labor.vehicles, null);
  data.configuration.vehicleWeeklyCost = "0";
  assert.equal(calculateQuote(data).status, "complete");
  data.configuration.laborClasses[0].enabled = false;
  assert.ok(calculateQuote(data).diagnostics.some(d => d.code === "LABOR_CLASS_UNAVAILABLE"));
});

test("entered camera inputs calculate material and direct labor while unconfigured overhead prevents a selling total", () => {
  const data = input();
  data.lines = [fixtureLine({ id: "camera", quantity: "1" })];
  data.lines[0].material.baseUnitCost = "499";
  Object.assign(data.lines[0].labor, { productionRate: "2", crewSize: "2" });
  Object.assign(data.configuration, { indirectRoles: null, vehicleWeeklyCost: null, annualRent: null, annualBondInsurance: null });
  const original = structuredClone(data);
  const pending = calculateQuote(data);
  assert.equal(pending.status, "incomplete");
  assert.equal(pending.lines[0].material?.customerUnit, "807.67");
  assert.equal(pending.lines[0].labor?.installationHours, "0.5");
  assert.equal(pending.lines[0].labor?.directHours, "1");
  assert.equal(pending.lines[0].labor?.directCost, "25");
  assert.equal(pending.lines[0].labor?.customerUnit, null);
  assert.equal(pending.lines[0].customerTotal, null);
  assert.equal(pending.totals.finalPayableTotal, null);
  assert.deepEqual(pending.diagnostics.map(issue => issue.path).sort(), ["configuration.annualBondInsurance", "configuration.annualRent", "configuration.indirectRoles", "configuration.vehicleWeeklyCost"]);
  assert.deepEqual(data, original);

  // Only an explicit configuration choice can remove those costs from pricing.
  Object.assign(data.configuration, { indirectRoles: [], vehicleWeeklyCost: "0", annualRent: "0", annualBondInsurance: "0" });
  const complete = calculateQuote(data);
  assert.equal(complete.status, "complete");
  assert.deepEqual(complete.diagnostics, []);
  assert.equal(complete.labor.loadedTotal, "78.867");
  assert.equal(complete.lines[0].labor?.customerUnit, "78.87");
  assert.equal(complete.lines[0].customerTotal, "886.54");
  assert.equal(complete.totals.finalPayableTotal, "898.75");
});

test("fractional extensions remain precise; exact-cent units do not gain a cent", () => {
  const data = input();
  data.lines = [fixtureLine({ mode: "MATERIAL_ONLY", quantity: "0.125", material: { baseUnitCost: "0.1", margin: "0", contingency: "0", freight: "0", materialIvuEnabled: false, materialIvuRate: null } })];
  let r = calculateQuote(data);
  assert.equal(r.lines[0].material!.customerUnit, "0.1");
  assert.equal(r.material!.customerTotal, "0.0125");
  assert.equal(r.totals.finalPayableTotal, "0.01");
  data.lines[0].material.baseUnitCost = "0.100000000001";
  r = calculateQuote(data);
  assert.equal(r.lines[0].material!.customerUnit, "0.11");
  assert.equal(r.material!.customerTotal, "0.01375");
});

test("material exemption affects Material IVU, not the B2B rule", () => {
  const data = input(); data.lines[0].material.materialIvuEnabled = false;
  const r = calculateQuote(data);
  assert.equal(r.tax.materialIvuAmount, "0");
  near(r.tax.b2bServiceTaxAmount, 278.48571428571427);
});

test("presentation metadata and ordering cannot alter financial outputs; inputs are unchanged", () => {
  const data = input();
  const state: BuilderWorkspace = { ...emptyBuilderWorkspace(), groups: [{ id: "a", title: "A", accent: null, order: 0 }, { id: "b", title: "B", accent: null, order: 1 }], lines: [fixtureLine(), fixtureLine({ id: "second", quantity: "1" })].map((line, i) => ({ ...line, itemId: null, itemFacts: null, imageUrl: null, name: "Custom", unit: "ft", proposalDescription: "Install", groupId: "a", order: i, origins: {} })) };
  const before = structuredClone(state);
  const result = calculateQuote(builderCalculationInput(state, data.configuration));
  assert.deepEqual(state, before);
  state.groups.reverse(); state.groups[0].title = "New"; state.groups[0].accent = "#123456"; state.groups[0].order = 10;
  state.lines.reverse(); state.lines[0].groupId = "b"; state.lines[0].order = 99;
  assert.deepEqual(calculateQuote(builderCalculationInput(state, data.configuration)), result);
});

test("supplied practical-duration aggregate reference and multiplier representation", () => {
  const r = calculateLaborStages({ directHours: "153.1027881297447", directCost: "3904.6581176673562", effectiveCrewSize: "2.0625", contributorCount: 16 }, zeroProjectCosts, fixtureConfiguration());
  assert.deepEqual(r.diagnostics, []);
  const expected = { practicalWeeks: 2.598107919777486, supervision: 1656.2937988581475, payrollBurden: 1946.3331707839263, contingency: 1126.0927630964145, payrollSubtotal: 8633.377850405845, vehicles: 519.6215839554972, preMarginCost: 9152.999434361342, profit: 9152.999434361342, postMarginAmount: 18305.998868722683, rent: 3597.3801966149804, bondInsurance: 1299.0539598887428, fondo: 292.8959818995629, loadedTotal: 23495.329007125973, allocationFactor: 6.017256389443409 };
  for (const [key, expectedValue] of Object.entries(expected)) near(r.labor[key as keyof typeof expected], expectedValue);
  assert.equal(formatAllocationFactor(r.labor.allocationFactor), "6.0173×");
  assert.equal(formatAllocationFactor(null), "N/A");
});

test("supplied rounded totals reconcile without adding embedded Material IVU again", () => {
  const tax = calculateB2bTax({ customerLaborTotal: "23534.90", materialProfit: "28566.899214285724", materialContingency: "0", rate: "0.04" });
  near(tax.b2bServiceTaxAmount, 2084.071968571429);
  assert.equal(new Decimal("101950.54").plus("23534.90").plus(tax.b2bServiceTaxAmount!).toFixed(2, Decimal.ROUND_HALF_UP), "127569.51");
});

test("upward cents accumulate from units before extending and adding taxes", () => {
  const data = input();
  data.lines = Array.from({ length: 10 }, (_, index) => fixtureLine({ id: String(index), mode: "MATERIAL_ONLY", quantity: "1000", material: { baseUnitCost: "0.001", contingency: "0", freight: "0", margin: "0", materialIvuEnabled: false, materialIvuRate: null } }));
  const result = calculateQuote(data);
  assert.equal(result.material?.rawTotal, "10");
  assert.equal(result.material?.customerTotal, "100");
  assert.equal(result.material?.roundingDifference, "90");
  assert.equal(result.totals.finalPayableTotal, "100");
});

test("labor-only and invalid crew inputs remain independent from material defaults", () => {
  const data = input(); data.lines[0].mode = "LABOR_ONLY";
  data.lines[0].material.baseUnitCost = null;
  assert.equal(calculateQuote(data).totals.finalPayableTotal, "2995.2");
  data.lines[0].labor.crewSize = null;
  assert.equal(calculateQuote(data).status, "incomplete");
  data.lines[0].labor.crewSize = "0";
  assert.equal(calculateQuote(data).status, "invalid");
});

test("labor target reconciles upward-rounded units without a balancing line", () => {
  const data = input();
  Object.assign(data.configuration, { laborClasses: [{ id: "one", name: "One", enabled: true, hourlyRate: "1" }], indirectRoles: [], payrollBurden: "0", laborContingency: "0", vehicleWeeklyCost: "0", annualRent: "0", annualBondInsurance: "0", laborMargin: "0", fondo: "0" });
  data.lines = [fixtureLine({ id: "a", mode: "LABOR_ONLY", quantity: "1", labor: { laborClassId: "one", productionRate: "1", crewSize: "1", overtimeMultiplier: "1" } }), fixtureLine({ id: "b", mode: "LABOR_ONLY", quantity: "3", labor: { laborClassId: "one", productionRate: "1.5", crewSize: "1", overtimeMultiplier: "1" } })];
  data.projectCosts.travelTotal = "7";
  const r = calculateQuote(data);
  assert.equal(r.labor.preciseLaborSellingTarget, "10");
  assert.equal(r.lines[0].labor?.customerUnit, "3.34");
  assert.equal(r.lines[1].labor?.customerUnit, "2.23");
  assert.equal(r.lines[1].labor?.customerTotal, "6.69");
  assert.equal(r.labor.roundedCustomerLaborValue, "10.03");
  assert.equal(r.labor.laborAllocationRoundingDelta, "0.03");
  assert.equal(new Decimal(r.labor.rawAllocatedLaborValue!).plus(r.labor.roundingDifference!).toString(), "10.03");
  assert.equal(r.lines[0].customerUnit, "3.34");
});

test("Service Tax operands exclude freight, embedded IVU and material unit rounding uplift", () => {
  const data = input(); const before = calculateQuote(data);
  data.lines[0].material.freight = "0.6";
  data.lines[0].material.materialIvuRate = "0.5";
  const after = calculateQuote(data);
  assert.notEqual(after.material?.customerTotal, before.material?.customerTotal);
  assert.equal(after.tax.b2bTaxableBase, before.tax.b2bTaxableBase);
  assert.equal(after.tax.b2bServiceTaxAmount, before.tax.b2bServiceTaxAmount);
  assert.equal(after.tax.rawMaterialContingency, after.material?.contingency);
  assert.equal(after.tax.rawMaterialProfit, after.material?.profit);
  assert.equal(after.tax.roundedCustomerLaborValue, after.labor.customerTotal);
  const exact = calculateB2bTax({ customerLaborTotal: "100.01", materialContingency: "0.123456789", materialProfit: "2.345678901", rate: "0.04" });
  assert.deepEqual(exact, { b2bTaxableBase: "102.47913569", b2bServiceTaxAmount: "4.0991654276" });
});

test("project cost recovery is explicit and unresolved costs stay nullable", () => {
  const data = input(); data.lines[0].mode = "MATERIAL_ONLY";
  data.projectCosts.travelTotal = "120"; data.projectCosts.equipmentRentalTotal = "100";
  let r = calculateQuote(data);
  assert.equal(r.projectCosts.incurredProjectCosts, "220");
  assert.equal(r.projectCosts.recoveredProjectCosts, "0");
  assert.equal(r.projectCosts.unrecoveredProjectCosts, "220");
  data.projectCosts.lodgingNightlyRate = "80";
  r = calculateQuote(data);
  assert.deepEqual(r.projectCosts.unresolvedCosts, ["lodging"]);
  assert.equal(r.projectCosts.incurredProjectCosts, null);
  assert.equal(r.projectCosts.unrecoveredProjectCosts, null);
  assert.equal(r.projectCosts.knownEnteredCostTotal, "220");
  data.lines[0].mode = "MATERIAL_AND_LABOR";
  r = calculateQuote(data);
  assert.equal(r.projectCosts.incurredProjectCosts, "860");
  assert.equal(r.projectCosts.recoveredProjectCosts, "860");
  assert.equal(r.projectCosts.unrecoveredProjectCosts, "0");
  data.configuration.vehicleWeeklyCost = null;
  r = calculateQuote(data);
  assert.equal(r.projectCosts.recoveredProjectCosts, null);
  assert.equal(r.projectCosts.unrecoveredProjectCosts, null);
});

test("diagnostics identify line and field, distinguish missing from invalid, and never mutate", () => {
  const data = input(); data.lines[0].labor.productionRate = null;
  const before = structuredClone(data); let r = calculateQuote(data);
  assert.equal(r.status, "incomplete");
  assert.ok(r.diagnostics.some(issue => issue.lineId === data.lines[0].id && issue.path.endsWith("labor.productionRate") && issue.category === "incomplete"));
  assert.deepEqual(data, before);
  data.lines[0].labor.productionRate = "0";
  r = calculateQuote(data);
  assert.equal(r.status, "invalid");
  assert.ok(r.diagnostics.some(issue => issue.lineId === data.lines[0].id && issue.path.endsWith("labor.productionRate") && issue.category === "invalid"));
  data.lines[0].mode = "MATERIAL_ONLY";
  data.lines[0].material.materialIvuRate = "1.01";
  assert.equal(calculateQuote(data).status, "invalid");
  data.lines[0].material.materialIvuRate = "0.115";
  assert.equal(calculateQuote(data).status, "complete");
});
