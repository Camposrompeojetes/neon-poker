import { describe, expect, it } from "vitest";

import {
  ClientMessageSchema,
  GameActionMessageSchema,
  HandEventSchema,
  PlayerTableSnapshotSchema,
  PublicReplayEventSchema,
  PublicTableSnapshotSchema,
  TableSnapshotEnvelopeSchema
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

  it("accepts a sit-down intent without client-controlled stack", () => {
    const message = ClientMessageSchema.parse({
      type: "table.sitDown",
      requestId: "req_sit",
      tableId: "table_1",
      seatIndex: 0
    });

    expect(message).toEqual({
      type: "table.sitDown",
      requestId: "req_sit",
      tableId: "table_1",
      seatIndex: 0
    });

    expect(() =>
      ClientMessageSchema.parse({
        type: "table.sitDown",
        requestId: "req_sit",
        tableId: "table_1",
        seatIndex: 0,
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

  it("accepts a filtered player table snapshot with legal actions", () => {
    const snapshot = PlayerTableSnapshotSchema.parse({
      tableId: "table_1",
      seats: [
        {
          seatIndex: 0,
          playerId: "alice",
          stack: 995,
          status: "inHand",
          holeCardCount: 2,
          holeCards: [
            { rank: "A", suit: "hearts" },
            { rank: "A", suit: "spades" }
          ]
        },
        {
          seatIndex: 1,
          playerId: "bob",
          stack: 990,
          status: "inHand",
          holeCardCount: 2,
          holeCards: []
        }
      ],
      hand: {
        handId: "hand_1",
        buttonSeat: 0,
        board: [],
        street: "preflop",
        pot: 15,
        currentBet: 10,
        activePlayerId: "alice",
        nextSeq: 6,
        handComplete: false,
        winners: [],
        legalActions: [
          { type: "Fold" },
          { type: "Call", amount: 5 },
          { type: "Raise", min: 20, max: 1000 }
        ]
      }
    });

    expect(snapshot.hand?.legalActions).toHaveLength(3);
  });

  it("rejects private fields in public table snapshots", () => {
    expect(() =>
      PublicTableSnapshotSchema.parse({
        tableId: "table_1",
        seats: [
          {
            seatIndex: 0,
            playerId: "alice",
            stack: 995,
            status: "inHand",
            holeCardCount: 2,
            holeCards: [{ rank: "A", suit: "hearts" }]
          }
        ],
        hand: null
      })
    ).toThrow();
  });

  it("parses table snapshot envelopes for reconnect sync", () => {
    const envelope = TableSnapshotEnvelopeSchema.parse({
      type: "table.snapshot",
      seq: 42,
      payload: {
        tableId: "table_1",
        seats: [],
        hand: null
      }
    });

    expect(envelope.seq).toBe(42);
  });

  it("accepts sanitized public replay events", () => {
    const event = PublicReplayEventSchema.parse({
      handId: "hand_1",
      seq: 7,
      eventType: "BoardCardsDealt",
      schemaVersion: 1,
      payload: {
        street: "flop",
        cards: [
          { rank: "2", suit: "clubs" },
          { rank: "3", suit: "diamonds" },
          { rank: "4", suit: "spades" }
        ]
      }
    });

    expect(event.eventType).toBe("BoardCardsDealt");
  });

  it("rejects private engine events in public replay streams", () => {
    expect(() =>
      PublicReplayEventSchema.parse({
        handId: "hand_1",
        seq: 1,
        eventType: "PrivateCardsDealt",
        schemaVersion: 1,
        payload: {
          playerId: "alice",
          cards: [
            { rank: "A", suit: "hearts" },
            { rank: "A", suit: "spades" }
          ]
        }
      })
    ).toThrow();

    expect(() =>
      PublicReplayEventSchema.parse({
        handId: "hand_1",
        seq: 0,
        eventType: "HandStarted",
        schemaVersion: 1,
        payload: {
          buttonSeat: 0,
          deck: [{ rank: "A", suit: "hearts" }]
        }
      })
    ).toThrow();
  });
});
