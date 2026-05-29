import { afterEach, describe, expect, it } from "vitest";

import {
  type Card,
  type EngineDeps,
  HEADS_UP_TABLE_CONFIG,
  cardKey,
  createDeck,
  parseCard
} from "@neon-poker/poker-engine";

import { createApiHttpServer } from "./http-server";
import { ApiMessageRouter } from "./message-router";
import type { ApiRuntime } from "./runtime";
import { InMemoryTableActorStore, TableActor } from "./table-actor";

const COMMON_HAND = headsUpDeck({
  alice: ["Ah", "As"],
  bob: ["Kh", "Qh"],
  board: ["2c", "3d", "4s", "5h", "9c"]
});

const runningServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
});

function createTestRuntime(): ApiRuntime {
  const store = new InMemoryTableActorStore();
  const actor = new TableActor({
    tableId: "table_1",
    config: HEADS_UP_TABLE_CONFIG,
    engineDeps: riggedDeps(COMMON_HAND),
    store
  });

  return {
    actor,
    store,
    db: null,
    tableId: "table_1",
    tableName: "Test Table",
    config: HEADS_UP_TABLE_CONFIG,
    close: async () => {}
  };
}

async function listen(runtime: ApiRuntime) {
  const server = createApiHttpServer({
    runtime,
    router: new ApiMessageRouter({
      actor: runtime.actor,
      tableId: runtime.tableId,
      handIdFactory: () => "hand_1"
    })
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  runningServers.push({
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }

          reject(error);
        });
      });
    }
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  return `http://127.0.0.1:${address.port}`;
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

describe("api HTTP server", () => {
  it("serves health and routes client messages through the authoritative actor", async () => {
    const runtime = createTestRuntime();
    const baseUrl = await listen(runtime);

    const health = await fetch(`${baseUrl}/health`);
    const sitDown = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-player-id": "alice"
      },
      body: JSON.stringify({
        type: "table.sitDown",
        requestId: "req_sit_a",
        tableId: "table_1",
        seatIndex: 0
      })
    });

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      tableId: "table_1"
    });
    expect(sitDown.status).toBe(200);
    expect(await sitDown.json()).toMatchObject({
      envelopes: [
        {
          type: "table.snapshot",
          payload: {
            requestId: "req_sit_a",
            tableId: "table_1"
          }
        }
      ]
    });
  });

  it("rejects untrusted message payloads with Zod validation", async () => {
    const runtime = createTestRuntime();
    const baseUrl = await listen(runtime);
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-player-id": "alice"
      },
      body: JSON.stringify({
        type: "table.sitDown",
        requestId: "req_sit_a",
        tableId: "table_1",
        seatIndex: 0,
        stack: 999999
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });
});
