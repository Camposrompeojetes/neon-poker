import { describe, expect, it } from "vitest";

import type { GameActionMessage } from "@neon-poker/contracts";
import {
  type Card,
  type EngineDeps,
  HEADS_UP_TABLE_CONFIG,
  cardKey,
  createDeck,
  parseCard
} from "@neon-poker/poker-engine";

import { InMemoryTableActorStore, TableActor } from "./table-actor";

const COMMON_HAND = headsUpDeck({
  alice: ["Ah", "As"],
  bob: ["Kh", "Qh"],
  board: ["2c", "3d", "4s", "5h", "9c"]
});

function createActor() {
  const store = new InMemoryTableActorStore();
  const actor = new TableActor({
    tableId: "table_1",
    config: HEADS_UP_TABLE_CONFIG,
    engineDeps: riggedDeps(COMMON_HAND),
    store
  });

  return { actor, store };
}

function seatAndStartHand() {
  const { actor, store } = createActor();

  actor.sitDown({ playerId: "alice", seatIndex: 0 });
  actor.sitDown({ playerId: "bob", seatIndex: 1 });
  actor.startHand({ handId: "hand_1", buttonSeat: 0 });

  return { actor, store };
}

function actionMessage(
  playerId: string,
  expectedSeq: number,
  action: GameActionMessage["action"],
  idempotencyKey: string
): GameActionMessage {
  return {
    type: "game.action",
    requestId: `req_${idempotencyKey}`,
    tableId: "table_1",
    playerId,
    expectedSeq,
    idempotencyKey,
    action
  };
}

function riggedDeps(cardCodes: readonly string[]): EngineDeps {
  return {
    rng: () => 0.5,
    shuffle: () => deckWithTop(cardCodes)
  };
}

function deckWithTop(cardCodes: readonly string[]): Card[] {
  const topCards = cardCodes.map(parseCard);
  const topCardKeys = new Set(topCards.map(cardKey));
  return [...topCards, ...createDeck().filter((card) => !topCardKeys.has(cardKey(card)))];
}

function headsUpDeck({
  alice,
  bob,
  board,
  burns = ["8d", "7c", "6d"]
}: {
  alice: readonly [string, string];
  bob: readonly [string, string];
  board: readonly [string, string, string, string, string];
  burns?: readonly [string, string, string];
}): string[] {
  return [
    alice[0],
    bob[0],
    alice[1],
    bob[1],
    burns[0],
    board[0],
    board[1],
    board[2],
    burns[1],
    board[3],
    burns[2],
    board[4]
  ];
}

describe("TableActor", () => {
  it("lets a player join and sit without accepting authoritative client state", () => {
    const { actor } = createActor();

    const joined = actor.joinTable("alice");
    const seated = actor.sitDown({ playerId: "alice", seatIndex: 0, stack: 500 });

    expect(joined.tableId).toBe("table_1");
    expect(seated.seats.find((seat) => seat.playerId === "alice")?.stack).toBe(500);
    expect(seated.hand).toBeNull();
  });

  it("starts a hand, persists append-only internal events and returns filtered snapshots", () => {
    const { actor, store } = seatAndStartHand();
    const publicSnapshot = actor.publicSnapshot();
    const aliceSnapshot = actor.snapshotForPlayer("alice");
    const bobSeatInAliceSnapshot = aliceSnapshot.seats.find(
      (seat) => seat.playerId === "bob"
    );

    expect(store.handEvents.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(store.handEvents[0]).toMatchObject({
      handId: "hand_1",
      eventType: "HandStarted",
      schemaVersion: 1
    });
    expect(store.handEvents[0]?.payload).toHaveProperty("deck");
    expect(publicSnapshot.seats.every((seat) => "holeCards" in seat === false)).toBe(
      true
    );
    expect(
      aliceSnapshot.seats.find((seat) => seat.playerId === "alice")?.holeCards.map(cardKey)
    ).toEqual(["Ah", "As"]);
    expect(bobSeatInAliceSnapshot?.holeCards).toEqual([]);
  });

  it("accepts an in-turn action, persists new hand events and updates the filtered snapshot", () => {
    const { actor, store } = seatAndStartHand();
    const expectedSeq = actor.internalStateForTests().hand?.nextSeq ?? -1;

    const result = actor.handleGameAction(
      "alice",
      actionMessage("alice", expectedSeq, { type: "Call" }, "idem_alice_call_001")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected in-turn action to be accepted");
    }
    expect(result.duplicate).toBe(false);
    expect(store.gameActionRequests).toHaveLength(1);
    expect(store.gameActionRequests[0]).toMatchObject({
      status: "accepted",
      idempotencyKey: "idem_alice_call_001",
      firstEventSeq: expectedSeq
    });
    expect(result.persistedEvents).toBe(2);
    expect(store.handEvents).toHaveLength(8);
    expect(result.snapshot.hand?.activePlayerId).toBe("bob");
  });

  it("rejects stale expectedSeq without appending hand events", () => {
    const { actor, store } = seatAndStartHand();
    const beforeEventCount = store.handEvents.length;

    const result = actor.handleGameAction(
      "alice",
      actionMessage("alice", 0, { type: "Call" }, "idem_stale_seq_001")
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected stale action to be rejected");
    }
    expect(result.code).toBe("expected_seq_mismatch");
    expect(store.handEvents).toHaveLength(beforeEventCount);
    expect(store.gameActionRequests[0]).toMatchObject({
      status: "rejected",
      rejectionCode: "expected_seq_mismatch"
    });
  });

  it("rejects out-of-turn actions", () => {
    const { actor, store } = seatAndStartHand();
    const expectedSeq = actor.internalStateForTests().hand?.nextSeq ?? -1;

    const result = actor.handleGameAction(
      "bob",
      actionMessage("bob", expectedSeq, { type: "Check" }, "idem_bob_oop_001")
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected out-of-turn action to be rejected");
    }
    expect(result.code).toBe("not_players_turn");
    expect(store.handEvents).toHaveLength(6);
  });

  it("returns the stored result for duplicate idempotent actions", () => {
    const { actor, store } = seatAndStartHand();
    const expectedSeq = actor.internalStateForTests().hand?.nextSeq ?? -1;
    const message = actionMessage(
      "alice",
      expectedSeq,
      { type: "Call" },
      "idem_duplicate_call_001"
    );

    const first = actor.handleGameAction("alice", message);
    const second = actor.handleGameAction("alice", message);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(store.gameActionRequests).toHaveLength(1);
    expect(store.handEvents).toHaveLength(8);
  });

  it("rejects idempotency key reuse for a different action", () => {
    const { actor, store } = seatAndStartHand();
    const expectedSeq = actor.internalStateForTests().hand?.nextSeq ?? -1;

    actor.handleGameAction(
      "alice",
      actionMessage("alice", expectedSeq, { type: "Call" }, "idem_reused_001")
    );
    const reused = actor.handleGameAction(
      "alice",
      actionMessage("alice", expectedSeq, { type: "Raise", amount: 20 }, "idem_reused_001")
    );

    expect(reused.ok).toBe(false);
    if (reused.ok) {
      throw new Error("Expected reused idempotency key to be rejected");
    }
    expect(reused.code).toBe("idempotency_key_reused");
    expect(reused.duplicate).toBe(true);
    expect(store.gameActionRequests).toHaveLength(1);
  });

  it("rejects player identity mismatches before reaching the engine", () => {
    const { actor, store } = seatAndStartHand();
    const expectedSeq = actor.internalStateForTests().hand?.nextSeq ?? -1;

    const result = actor.handleGameAction(
      "alice",
      actionMessage("bob", expectedSeq, { type: "Check" }, "idem_identity_001")
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected identity mismatch to be rejected");
    }
    expect(result.code).toBe("authenticated_player_mismatch");
    expect(store.gameActionRequests).toHaveLength(0);
    expect(store.handEvents).toHaveLength(6);
  });
});
