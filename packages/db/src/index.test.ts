import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName } from "drizzle-orm";

import {
  MVP_TABLES,
  gameActionRequests,
  handEvents,
  isRequiredMvpTable,
  schema,
  virtualChipLedger
} from "./index";

const initialMigrationPath = fileURLToPath(
  new URL("../drizzle/0000_secret_misty_knight.sql", import.meta.url)
);

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

  it("generates the initial migration for append-only events and idempotency", () => {
    const migration = readFileSync(initialMigrationPath, "utf8");

    expect(migration).toContain('CREATE TABLE "hand_events"');
    expect(migration).toContain('PRIMARY KEY("hand_id","seq")');
    expect(migration).toContain('CREATE TABLE "game_action_requests"');
    expect(migration).toContain("game_action_requests_idempotency_unique");
  });
});
