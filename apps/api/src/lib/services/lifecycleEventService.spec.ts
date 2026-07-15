import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LifecycleEntityType } from "@/generated/prisma/client";
import { recordLifecycleStatusEvent } from "@/lib/services/lifecycleEventService";

describe("lifecycle analytics snapshots", () => {
  it("skips unchanged statuses unless a value snapshot is requested", async () => {
    const writes: unknown[] = [];
    const db = {
      lifecycleStatusEvent: {
        create: async (input: unknown) => {
          writes.push(input);
          return input;
        }
      }
    };

    const skipped = await recordLifecycleStatusEvent(db as never, {
      entityType: LifecycleEntityType.QUOTE,
      entityId: "quote-1",
      fromStatus: "Draft",
      toStatus: "Draft",
      valueSnapshot: 100
    });
    assert.equal(skipped, null);
    assert.equal(writes.length, 0);

    await recordLifecycleStatusEvent(db as never, {
      entityType: LifecycleEntityType.QUOTE,
      entityId: "quote-1",
      fromStatus: "Draft",
      toStatus: "Draft",
      valueSnapshot: 125,
      recordWhenUnchanged: true
    });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], {
      data: {
        entityType: LifecycleEntityType.QUOTE,
        entityId: "quote-1",
        fromStatus: "Draft",
        toStatus: "Draft",
        changedAt: (writes[0] as { data: { changedAt: Date } }).data.changedAt,
        actorUserId: undefined,
        actorNameSnapshot: "Pulse System",
        valueSnapshot: 125,
        metadata: undefined,
        source: "APPLICATION",
        precision: "EXACT"
      }
    });
  });
});
