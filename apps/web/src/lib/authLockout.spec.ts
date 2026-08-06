import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLockoutDuration,
  lockoutMessage,
  retryAfterSeconds
} from "@/lib/authLockout";

describe("login lockout presentation", () => {
  it("formats a visible minute-and-second countdown", () => {
    assert.equal(formatLockoutDuration(900), "15:00");
    assert.equal(formatLockoutDuration(61), "1:01");
    assert.equal(lockoutMessage(9), "Sign-in is temporarily locked. Try again in 0:09.");
  });

  it("prefers API retry metadata and falls back to the Retry-After header", () => {
    assert.equal(retryAfterSeconds(125.2, "60"), 126);
    assert.equal(retryAfterSeconds(undefined, "45"), 45);
    assert.equal(retryAfterSeconds(undefined, null), 60);
  });
});
