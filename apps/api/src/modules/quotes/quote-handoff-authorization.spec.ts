import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import type { AuthenticatedUser } from "@pulse/contracts/auth";

// db.ts uses the supplied client in tests. No real transaction can start in this process.
const project = {
  id: "project-1",
  projectNumber: "P-1",
  quoteLinks: [],
  invoices: [],
  budget: 1500,
  client: { displayName: "Handoff client" },
  updatedAt: new Date("2026-11-17T00:00:00Z")
};
const database = {
  async $transaction(): Promise<unknown> { assert.fail("Unmocked handoff transaction"); },
  activity: { create: async () => undefined },
  project: { findFirst: async () => project, findUnique: async () => project },
  lifecycleDocument: { findMany: async () => [] }
};
Object.assign(globalThis, { prisma: database });
const controllers = Promise.all([
  import("@/controllers/projects.controller"),
  import("@/controllers/quotes.controller"),
  import("@/modules/quotes/quotes.service"),
  import("@/shared/auth.service")
]);

const request = { headers: {} } as Request;
const quoteId = "quote-1";
const projectInput = { title: "Quote handoff", clientId: "client-1", quoteId };
const routes = [
  ["POST /projects", "create"],
  ["POST /quotes/:id/convert", "convert"],
  ["POST /quotes/:id/approve", "approve"]
] as const;

for (const [route, action] of routes) {
  for (const permissions of [["projects:write"], ["quotes:write"], ["quotes:write", "projects:write"]] satisfies AuthenticatedUser["permissions"][]) {
    test(`${route} with ${permissions.join(" and ")}`, async (t) => {
      const [{ ProjectsController }, { QuotesController }, { QuotesService }, { AuthError, AuthService }] = await controllers;
      const auth = new AuthService();
      t.mock.method(auth, "getCurrentUser", async (): Promise<AuthenticatedUser> => ({
        id: "user-1",
        name: "Sales User",
        email: "sales@example.test",
        role: "Sales",
        roleLabel: "Sales",
        accessRole: { id: "Sales", name: "Sales", color: "#2563EB" },
        permissions,
        isSystemAdmin: false,
        mustChangePassword: false,
        authProvider: "LOCAL"
      }));

      const transactionReached = new Error("Isolated handoff transaction boundary");
      const transaction = t.mock.method(database, "$transaction", async () => {
        if (action === "approve") throw transactionReached;
        return { project, quote: { id: quoteId, quoteNumber: "Q-1" }, linkRole: "ORIGINAL", linkSequence: 0 };
      });

      const response = action === "create"
        ? new ProjectsController(auth).create(request, projectInput)
        : new QuotesController(auth, new QuotesService())[action](request, quoteId, {});
      if (permissions.length === 2) {
        if (action === "approve") {
          await assert.rejects(response, (error: unknown) => error === transactionReached);
        } else {
          const result = await response;
          assert.equal(result.project.id, project.id);
          assert.equal(result.project.budget, project.budget);
        }
        assert.equal(transaction.mock.callCount(), 1);
      } else {
        await assert.rejects(response, (error: unknown) => error instanceof AuthError && error.status === 403);
        // Quote status, Project creation and financial snapshots are all written inside this transaction.
        assert.equal(transaction.mock.callCount(), 0);
      }
    });
  }
}
