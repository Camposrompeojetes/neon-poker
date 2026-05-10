import { describe, expect, it } from "vitest";

import {
  ClientMessageSchema,
  GameActionMessageSchema,
  HandEventSchema
} from "./index";

describe("shared contracts", () => {
  it("accepts a valid game action intent", () => {
    const message = GameActionMessageSchema.parse({
      type: "game.action",
      requestId: "req_123",
      tableId: "table_1",
      playerId: "player_1",
      expectedSeq: 7,
      idempotencyKey: "idem_123456789",
      action: { type: "Raise", amount: 120 }
    });

    expect(message.action).toEqual({ type: "Raise", amount: 120 });
  });

  it("rejects client attempts to send authoritative state", () => {
    expect(() =>
      ClientMessageSchema.parse({
        type: "game.action",
        requestId: "req_123",
        tableId: "table_1",
        playerId: "player_1",
        expectedSeq: 7,
        idempotencyKey: "idem_123456789",
        action: { type: "Call" },
        stack: 1000
      })
    ).toThrow();
  });

  it("requires event sourcing fields for hand events", () => {
    const event = HandEventSchema.parse({
      handId: "hand_1",
      seq: 0,
      eventType: "HandStarted",
      payload: { buttonSeat: 0 },
      schemaVersion: 1,
      stateHashAfter: "hash_1234567890abcdef"
    });

    expect(event.eventType).toBe("HandStarted");
  });
});

