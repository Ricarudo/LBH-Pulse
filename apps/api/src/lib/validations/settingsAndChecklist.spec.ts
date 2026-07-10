import assert from "node:assert/strict";
import test from "node:test";
import { createRequestSchema } from "@pulse/contracts/requests";
import { updateRequestChecklistTemplateSchema } from "@pulse/contracts/request-checklists";
import {
  userPreferencesSchema,
  workspaceSettingsSchema
} from "@pulse/contracts/settings";

test("request input keeps distinct multi-trade selections", () => {
  const request = createRequestSchema.parse({
    companyName: "R2 Test Client",
    serviceCategories: ["Fiber", "CCTV / Surveillance", "Fiber"]
  });
  assert.deepEqual(request.serviceCategories, ["Fiber", "CCTV / Surveillance"]);
  assert.equal(request.serviceCategory, "Fiber");
});

test("template rules cannot target a trade and request type together", () => {
  const result = updateRequestChecklistTemplateSchema.safeParse({
    name: "Invalid combined rule",
    serviceCategory: "Fiber",
    requestType: "Quote Request",
    active: false,
    items: [{ label: "Confirm scope" }]
  });
  assert.equal(result.success, false);
});

test("appearance accepts only supported presets", () => {
  assert.equal(userPreferencesSchema.safeParse({
    themeMode: "system",
    accentTheme: "teal",
    motionMode: "luxurious"
  }).success, true);
  assert.equal(userPreferencesSchema.safeParse({
    themeMode: "sepia",
    accentTheme: "teal",
    motionMode: "subtle"
  }).success, false);
  assert.equal(userPreferencesSchema.safeParse({
    themeMode: "dark",
    accentTheme: "blue",
    motionMode: "dizzy"
  }).success, false);
});

test("workspace settings validate Puerto Rico defaults", () => {
  assert.equal(workspaceSettingsSchema.safeParse({
    name: "R2 Communications",
    timeZone: "America/Puerto_Rico",
    locale: "en-US",
    dateFormat: "MM/DD/YYYY",
    weekStartsOn: 0
  }).success, true);
});
