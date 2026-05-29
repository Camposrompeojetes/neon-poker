import { describe, expect, it } from "vitest";

import type { PlayerTableSnapshot } from "@neon-poker/contracts";

import {
  EMPTY_TABLE_CLIENT_STATE,
  applyTableSnapshotEnvelope,
  createGameActionMessage,
  createHandReplay,
  createLobbySubscribeMessage,
  createTableJoinMessage,
  createTableSitDownMessage,
  getWebBootstrapStatus,
  stepHandReplay,
  toTableViewModel
} from "./main";

describe("web bootstrap contract", () => {
  it("does not treat the client as authoritative", () => {
    expect(getWebBootstrapStatus().clientAuthoritative).toBe(false);
  });

  it("creates a typed lobby subscription intent", () => {
    expect(createLobbySubscribeMessage("req_123")).toEqual({
      type: "lobby.subscribe",
      requestId: "req_123"
    });
  });

  it("creates table join and game action intents without authoritative state", () => {
    expect(createTableJoinMessage("req_join", "table_1")).toEqual({
      type: "table.join",
      requestId: "req_join",
      tableId: "table_1"
    });
    expect(createTableSitDownMessage("req_sit", "table_1", 0)).toEqual({
      type: "table.sitDown",
      requestId: "req_sit",
      tableId: "table_1",
      seatIndex: 0
    });

    expect(
      createGameActionMessage({
        requestId: "req_action",
        tableId: "table_1",
        playerId: "alice",
        expectedSeq: 6,
        idempotencyKey: "idem_alice_call_001",
        action: { type: "Call" }
      })
    ).toEqual({
      type: "game.action",
      requestId: "req_action",
      tableId: "table_1",
      playerId: "alice",
      expectedSeq: 6,
      idempotencyKey: "idem_alice_call_001",
      action: { type: "Call" }
    });
  });

  it("renders a table view model from a filtered player snapshot", () => {
    const model = toTableViewModel(playerSnapshot(), "alice");

    expect(model.tableId).toBe("table_1");
    expect(model.street).toBe("preflop");
    expect(model.pot).toBe(15);
    expect(model.board).toEqual([]);
    expect(model.isHeroTurn).toBe(true);
    expect(model.seats.find((seat) => seat.playerId === "alice")?.holeCards).toEqual([
      "Ah",
      "As"
    ]);
    expect(model.seats.find((seat) => seat.playerId === "bob")?.holeCards).toEqual([]);
  });

  it("exposes only server-provided legal action controls for the active player", () => {
    const aliceModel = toTableViewModel(playerSnapshot(), "alice");
    const bobModel = toTableViewModel(playerSnapshot(), "bob");

    expect(aliceModel.actionControls.map((control) => control.type)).toEqual([
      "Fold",
      "Call",
      "Raise",
      "AllIn"
    ]);
    expect(aliceModel.actionControls[1]).toMatchObject({
      type: "Call",
      label: "Call 5",
      amount: 5,
      action: { type: "Call" }
    });
    expect(bobModel.actionControls).toEqual([]);
  });

  it("syncs from table snapshot envelopes and ignores stale snapshots", () => {
    const first = applyTableSnapshotEnvelope(EMPTY_TABLE_CLIENT_STATE, {
      type: "table.snapshot",
      seq: 10,
      payload: playerSnapshot()
    });
    const stale = applyTableSnapshotEnvelope(first, {
      type: "table.snapshot",
      seq: 9,
      payload: {
        ...playerSnapshot(),
        tableId: "stale_table"
      }
    });

    expect(first.lastSeq).toBe(10);
    expect(first.snapshot?.tableId).toBe("table_1");
    expect(stale.snapshot?.tableId).toBe("table_1");
  });

  it("builds a public hand replayer without private cards", () => {
    const replay = createHandReplay([
      {
        handId: "hand_1",
        seq: 3,
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
      },
      {
        handId: "hand_1",
        seq: 0,
        eventType: "HandStarted",
        schemaVersion: 1,
        payload: { buttonSeat: 0 }
      },
      {
        handId: "hand_1",
        seq: 1,
        eventType: "BlindPosted",
        schemaVersion: 1,
        payload: { playerId: "alice", amount: 5 }
      }
    ]);
    const afterBlind = stepHandReplay(replay, "forward");
    const afterFlop = stepHandReplay(afterBlind, "forward");

    expect(replay.currentLabel).toBe("Hand started, button seat 0");
    expect(afterBlind.currentLabel).toBe("alice posted 5");
    expect(afterFlop.board).toEqual(["2c", "3d", "4s"]);
    expect(afterFlop.canStepForward).toBe(false);
  });
});

function playerSnapshot(): PlayerTableSnapshot {
  return {
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
        { type: "Raise", min: 20, max: 1000 },
        { type: "AllIn", amount: 995 }
      ]
    }
  };
}
