import { describe, expect, it } from "vitest";

import type { PersistableHandEvent } from "@neon-poker/poker-engine";

import { loadPublicHandReplay, toPublicReplayEvents } from "./hand-history";
import { InMemoryTableActorStore } from "./table-actor";

describe("hand history", () => {
  it("sanitizes replay events and removes private cards, deck and burn cards", () => {
    const replay = toPublicReplayEvents([
      handEvent("HandStarted", 0, {
        buttonSeat: 0,
        deck: [{ rank: "A", suit: "hearts" }]
      }),
      handEvent("PrivateCardsDealt", 1, {
        playerId: "alice",
        cards: [{ rank: "A", suit: "hearts" }]
      }),
      handEvent("CardBurned", 2, {
        street: "flop",
        card: { rank: "2", suit: "clubs" }
      }),
      handEvent("BoardCardsDealt", 3, {
        street: "flop",
        cards: [
          { rank: "3", suit: "diamonds" },
          { rank: "4", suit: "spades" },
          { rank: "5", suit: "hearts" }
        ]
      })
    ]);

    expect(replay.map((event) => event.eventType)).toEqual([
      "HandStarted",
      "BoardCardsDealt"
    ]);
    expect(replay[0]?.payload).toEqual({ buttonSeat: 0 });
    expect(JSON.stringify(replay)).not.toContain("PrivateCardsDealt");
    expect(JSON.stringify(replay)).not.toContain("CardBurned");
    expect(JSON.stringify(replay)).not.toContain("deck");
  });

  it("loads replay events from a table actor store", async () => {
    const store = new InMemoryTableActorStore();

    await store.appendHandEvents([
      handEvent("HandStarted", 0, { buttonSeat: 0, deck: [] }),
      handEvent("BlindPosted", 1, { playerId: "alice", amount: 5 })
    ]);

    const replay = await loadPublicHandReplay({ store, handId: "hand_1" });

    expect(replay.map((event) => event.eventType)).toEqual([
      "HandStarted",
      "BlindPosted"
    ]);
  });
});

function handEvent(
  eventType: string,
  seq: number,
  payload: Record<string, unknown>
): PersistableHandEvent {
  return {
    handId: "hand_1",
    seq,
    eventType,
    payload,
    schemaVersion: 1,
    stateHashAfter: "1234567890abcdef"
  };
}
