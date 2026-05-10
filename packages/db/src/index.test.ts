import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";

import {
  MVP_TABLES,
  gameActionRequests,
  handEvents,
  isRequiredMvpTable,
  schema,
  virtualChipLedger
} from "./index";

describe("db foundation", () => {
  it("tracks append-only hand event storage as required MVP schema", () => {
    expect(MVP_TABLES).toContain("hand_events");
    expect(isRequiredMvpTable("hand_events")).toBe(true);
  });

  it("exports Drizzle schemas for every required MVP table", () => {
    const tableNames = Object.values(schema).map((table) => getTableName(table));

    expect(tableNames.sort()).toEqual([...MVP_TABLES].sort());
  });

  it("models append-only hand events with the required event sourcing fields", () => {
    expect(getTableName(handEvents)).toBe("hand_events");
    expect(handEvents.handId.name).toBe("hand_id");
    expect(handEvents.seq.name).toBe("seq");
    expect(handEvents.eventType.name).toBe("event_type");
    expect(handEvents.payload.name).toBe("payload");
    expect(handEvents.schemaVersion.name).toBe("schema_version");
    expect(handEvents.stateHashAfter.name).toBe("state_hash_after");
  });

  it("prepares persistent idempotency for game actions", () => {
    expect(getTableName(gameActionRequests)).toBe("game_action_requests");
    expect(gameActionRequests.expectedSeq.name).toBe("expected_seq");
    expect(gameActionRequests.idempotencyKey.name).toBe("idempotency_key");
    expect(gameActionRequests.requestHash.name).toBe("request_hash");
  });

  it("keeps virtual chips separate from real-money concepts", () => {
    expect(getTableName(virtualChipLedger)).toBe("virtual_chip_ledger");
    expect(MVP_TABLES).not.toContain("payments");
    expect(MVP_TABLES).not.toContain("deposits");
    expect(MVP_TABLES).not.toContain("withdrawals");
    expect(MVP_TABLES).not.toContain("rake");
  });
});
