import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { apiErrorPayload } from "@/shared/api-exception.filter";
import { AuthError } from "@/shared/auth.service";

describe("apiErrorPayload", () => {
  it("maps authentication failures to their status code", () => {
    assert.deepEqual(apiErrorPayload(new AuthError("Authentication required.", 401)), {
      status: 401,
      body: { error: "Authentication required." }
    });
  });

  it("maps known Pulse domain errors", () => {
    assert.deepEqual(apiErrorPayload(new Error("CLIENT_NOT_FOUND")), {
      status: 404,
      body: { error: "Client not found." }
    });
  });

  it("maps Zod validation errors", () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "bad" });

    assert.equal(result.success, false);
    if (!result.success) {
      const payload = apiErrorPayload(result.error);
      assert.equal(payload?.status, 400);
      assert.equal(payload?.body.error, "Validation failed.");
      assert.ok(Array.isArray(payload?.body.issues));
      assert.deepEqual(payload?.body.fields, {
        email: "Invalid email address"
      });
    }
  });

  it("maps missing Prisma table errors to schema-not-ready", () => {
    const payload = apiErrorPayload(
      new Prisma.PrismaClientKnownRequestError("Missing table", {
        code: "P2021",
        clientVersion: "test",
        meta: { table: "pulse.LocalUser" }
      })
    );

    assert.equal(payload?.status, 503);
    assert.equal(payload?.body.error, "Pulse database schema is not ready.");
  });
});
