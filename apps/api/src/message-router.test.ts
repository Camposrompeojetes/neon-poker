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

import { ApiMessageRouter } from "./message-router";
import { InMemoryTableActorStore, TableActor } from "./table-actor";

const COMMON_HAND = headsUpDeck({
  alice: ["Ah", "As"],
  bob: ["Kh", "Qh"],
  board: ["2c", "3d", "4s", "5h", "9c"]
});

function createRouter() {
  const store = new InMemoryTableActorStore();
  const actor = new TableActor({
    tableId: "table_1",
    config: HEADS_UP_TABLE_CONFIG,
    engineDeps: riggedDeps(COMMON_HAND),
    store
  });
  const router = new ApiMessageRouter({
    actor,
    tableId: "table_1",
    handIdFactory: () => "hand_1"
  });

  return { actor, router, store };
}

function actionMessage(expectedSeq: number): GameActionMessage {
  return {
    type: "game.action",
    requestId: "req_action",
    tableId: "table_1",
    playerId: "alice",
    expectedSeq,
    idempotencyKey: "idem_alice_call_001",
    action: { type: "Call" }
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

describe("ApiMessageRouter", () => {
  it("returns lobby and table snapshots through server envelopes", async () => {
    const { router } = createRouter();

    const lobby = await router.handle(
      { type: "lobby.subscribe", requestId: "req_lobby" },
      { playerId: "alice" }
    );
    const joined = await router.handle(
      { type: "table.join", requestId: "req_join", tableId: "table_1" },
      { playerId: "alice" }
    );

    expect(lobby[0]?.type).toBe("lobby.snapshot");
    expect(joined[0]?.type).toBe("table.snapshot");
    expect(joined[0]?.payload).toMatchObject({
      requestId: "req_join",
      tableId: "table_1"
    });
  });

  it("seats two players and starts a hand with server-generated hand ids", async () => {
    const { router, store } = createRouter();

    await router.handle(
      { type: "table.sitDown", requestId: "req_sit_a", tableId: "table_1", seatIndex: 0 },
      { playerId: "alice" }
    );
    const [snapshot] = await router.handle(
      { type: "table.sitDown", requestId: "req_sit_b", tableId: "table_1", seatIndex: 1 },
      { playerId: "bob" }
    );

    expect(snapshot?.type).toBe("table.snapshot");
    expect(snapshot?.payload).toMatchObject({
      requestId: "req_sit_b",
      tableId: "table_1",
      hand: {
        handId: "hand_1",
        street: "preflop",
        activePlayerId: "alice"
      }
    });
    expect(store.handEvents.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("handles game actions through the same authoritative actor", async () => {
    const { actor, router } = createRouter();

    await router.handle(
      { type: "table.sitDown", requestId: "req_sit_a", tableId: "table_1", seatIndex: 0 },
      { playerId: "alice" }
    );
    await router.handle(
      { type: "table.sitDown", requestId: "req_sit_b", tableId: "table_1", seatIndex: 1 },
      { playerId: "bob" }
    );

    const expectedSeq = actor.internalStateForTests().hand?.nextSeq ?? -1;
    const result = await router.handle(actionMessage(expectedSeq), {
      playerId: "alice"
    });

    expect(result.map((item) => item.type)).toEqual([
      "game.actionAccepted",
      "table.snapshot"
    ]);
    expect(result[0]?.payload).toMatchObject({
      requestId: "req_action",
      duplicate: false,
      persistedEvents: 2
    });
  });

  it("rejects unknown tables before reaching the actor", async () => {
    const { router } = createRouter();

    await expect(
      router.handle(
        { type: "table.join", requestId: "req_join", tableId: "other_table" },
        { playerId: "alice" }
      )
    ).rejects.toThrow("Unknown table");
  });
});
