import assert from "node:assert/strict";
import test from "node:test";
import { convertRequestSchema, createRequestUpdateSchema, requestUpdateFilterSchema } from "./requests";

test("request comments accept structured mentions without step fields", () => {
  const update = createRequestUpdateSchema.parse({
    body: "Confirmed the site access window with @Alex.",
    mentionIds: ["user-1"]
  });

  assert.equal(update.kind, "comment");
  assert.deepEqual(update.mentionIds, ["user-1"]);
  assert.equal(update.assigneeId, "");
});

test("request steps require a responsible assignee", () => {
  const result = createRequestUpdateSchema.safeParse({
    kind: "step",
    body: "Confirm the MDF location."
  });

  assert.equal(result.success, false);
  assert.equal(
    result.success ? "" : result.error.issues[0]?.message,
    "Choose a responsible assignee for the current step."
  );
});

test("request update filters expose the feed categories", () => {
  for (const filter of ["all", "comment", "step", "system"] as const) {
    assert.equal(requestUpdateFilterSchema.parse(filter), filter);
  }
});

test("request conversion requires a calculation mode when creating a quote", () => {
  assert.equal(convertRequestSchema.safeParse({ createQuote: true }).success, false);
  assert.deepEqual(convertRequestSchema.parse({
    createQuote: true,
    calculationMode: "LEGACY"
  }), { createQuote: true, calculationMode: "LEGACY" });
  assert.deepEqual(convertRequestSchema.parse({ createQuote: false }), {
    createQuote: false
  });
});
