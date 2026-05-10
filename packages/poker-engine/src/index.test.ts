import { describe, expect, it } from "vitest";

import {
  HEADS_UP_TABLE_CONFIG,
  type Card,
  type DomainEvent,
  type EngineDeps,
  type GameState,
  type PokerAction,
  applyEvent,
  applyEvents,
  cardKey,
  createDeck,
  createInitialState,
  decide,
  evaluateTexasHoldem,
  materializeHandEvents,
  parseCard,
  rebuildState,
  shuffleDeck,
  stateHash,
  toPlayerTableView,
  toPublicTableView
} from "./index";

function repeatingRng(values: readonly number[]) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;

    if (value === undefined) {
      throw new Error("Missing deterministic RNG value");
    }

    return value;
  };
}

function deckWithTop(cardCodes: readonly string[]): Card[] {
  const topCards = cardCodes.map(parseCard);
  const topCardKeys = new Set(topCards.map(cardKey));
  return [...topCards, ...createDeck().filter((card) => !topCardKeys.has(cardKey(card)))];
}

function riggedDeps(cardCodes: readonly string[]): EngineDeps {
  return {
    rng: repeatingRng([0.5]),
    shuffle: () => deckWithTop(cardCodes)
  };
}

function headsUpDeck({
  alice,
  bob,
  board,
  burns
}: {
  alice: readonly [string, string];
  bob: readonly [string, string];
  board: readonly [string, string, string, string, string];
  burns?: readonly [string, string, string];
}): string[] {
  const burnCards = burns ?? ["8d", "7c", "6d"];

  return [
    alice[0],
    bob[0],
    alice[1],
    bob[1],
    burnCards[0],
    board[0],
    board[1],
    board[2],
    burnCards[1],
    board[3],
    burnCards[2],
    board[4]
  ];
}

const COMMON_HAND = headsUpDeck({
  alice: ["Ah", "As"],
  bob: ["Kh", "Qh"],
  board: ["2c", "3d", "4s", "5h", "9c"]
});

const BOARD_TIE_HAND = headsUpDeck({
  alice: ["2c", "4s"],
  bob: ["3d", "5h"],
  board: ["Ah", "Kd", "Qs", "Jc", "Th"],
  burns: ["9h", "8h", "7h"]
});

const SHORT_ALL_IN_SIDE_POT_HAND = headsUpDeck({
  alice: ["2c", "7d"],
  bob: ["Ah", "Ad"],
  board: ["Kh", "Qh", "Js", "9c", "3d"],
  burns: ["8s", "8d", "8c"]
});

function seatTwoPlayers(stacks: { alice?: number; bob?: number } = {}): GameState {
  let state = createInitialState("table_1", HEADS_UP_TABLE_CONFIG);
  state = applyEvents(
    state,
    decide(
      state,
      {
        type: "SeatPlayer",
        playerId: "alice",
        seatIndex: 0,
        ...(stacks.alice === undefined ? {} : { stack: stacks.alice })
      },
      riggedDeps([])
    )
  );
  state = applyEvents(
    state,
    decide(
      state,
      {
        type: "SeatPlayer",
        playerId: "bob",
        seatIndex: 1,
        ...(stacks.bob === undefined ? {} : { stack: stacks.bob })
      },
      riggedDeps([])
    )
  );
  return state;
}

function startRiggedHand(
  cardCodes: readonly string[],
  stacks: { alice?: number; bob?: number } = {}
): {
  state: GameState;
  events: DomainEvent[];
} {
  const initialState = seatTwoPlayers(stacks);
  const deps = riggedDeps(cardCodes);
  const events = decide(
    initialState,
    { type: "StartHand", handId: "hand_1", buttonSeat: 0 },
    deps
  );
  const state = applyEvents(initialState, events);

  return { state, events };
}

function playerAction(state: GameState, playerId: string, action: PokerAction) {
  const expectedSeq = state.hand?.nextSeq;

  if (expectedSeq === undefined) {
    throw new Error("Expected active hand");
  }

  const events = decide(
    state,
    {
      type: "PlayerAction",
      playerId,
      expectedSeq,
      idempotencyKey: `idem_${playerId}_${expectedSeq}_0000`,
      action
    },
    riggedDeps([])
  );

  return {
    events,
    state: applyEvents(state, events)
  };
}

describe("poker-engine foundation", () => {
  it("creates a unique 52-card deck", () => {
    const deck = createDeck();
    const uniqueCards = new Set(deck.map(cardKey));

    expect(deck).toHaveLength(52);
    expect(uniqueCards.size).toBe(52);
  });

  it("shuffles deterministically through an injected RNG", () => {
    const rngValues = [0.1, 0.8, 0.3, 0.6, 0.2, 0.9];
    const first = shuffleDeck(createDeck(), repeatingRng(rngValues)).map(cardKey);
    const second = shuffleDeck(createDeck(), repeatingRng(rngValues)).map(cardKey);

    expect(first).toEqual(second);
    expect(first).not.toEqual(createDeck().map(cardKey));
  });

  it("evaluates Texas Hold'em hand strength", () => {
    const straightFlush = evaluateTexasHoldem(
      ["Ah", "Kh", "Qh", "Jh", "Th", "2c", "3d"].map(parseCard)
    );
    const fourOfAKind = evaluateTexasHoldem(
      ["As", "Ah", "Ad", "Ac", "9h", "2c", "3d"].map(parseCard)
    );

    expect(straightFlush.category).toBe("straight-flush");
    expect(fourOfAKind.category).toBe("four-of-a-kind");
    expect(straightFlush.categoryValue).toBeGreaterThan(fourOfAKind.categoryValue);
  });
});

describe("heads-up hand flow", () => {
  it("starts a heads-up hand with blinds and correct preflop action", () => {
    const { state } = startRiggedHand(COMMON_HAND);

    expect(state.hand?.street).toBe("preflop");
    expect(state.hand?.pot).toBe(15);
    expect(state.hand?.currentBet).toBe(10);
    expect(state.hand?.activePlayerId).toBe("alice");
    expect(state.seats.find((seat) => seat.playerId === "alice")?.stack).toBe(995);
    expect(state.seats.find((seat) => seat.playerId === "bob")?.stack).toBe(990);
  });

  it("does not expose a short all-in as a legal raise", () => {
    const { state } = startRiggedHand(COMMON_HAND, { alice: 15, bob: 1000 });

    expect(state.hand?.activePlayerId).toBe("alice");
    expect(state.hand?.legalActions).toContainEqual({ type: "Call", amount: 5 });
    expect(state.hand?.legalActions).toContainEqual({ type: "AllIn", amount: 10 });
    expect(state.hand?.legalActions.some((action) => action.type === "Raise")).toBe(
      false
    );
  });

  it("rejects raises below the minimum and exposes the next minimum re-raise", () => {
    let { state } = startRiggedHand(COMMON_HAND);

    expect(() => playerAction(state, "alice", { type: "Raise", amount: 15 })).toThrow(
      "legal"
    );

    state = playerAction(state, "alice", { type: "Raise", amount: 20 }).state;

    expect(state.hand?.legalActions.find((action) => action.type === "Raise")).toEqual(
      { type: "Raise", min: 30, max: 1000 }
    );
  });

  it("ends the hand and awards the pot when the small blind folds", () => {
    const started = startRiggedHand(COMMON_HAND);
    const result = playerAction(started.state, "alice", { type: "Fold" });

    expect(result.state.hand?.handComplete).toBe(true);
    expect(result.state.hand?.winners).toEqual([
      { playerId: "bob", amount: 15, handRank: null }
    ]);
    expect(result.state.seats.find((seat) => seat.playerId === "alice")?.stack).toBe(995);
    expect(result.state.seats.find((seat) => seat.playerId === "bob")?.stack).toBe(1005);
  });

  it("advances from preflop to flop after call and check", () => {
    let { state } = startRiggedHand(COMMON_HAND);

    state = playerAction(state, "alice", { type: "Call" }).state;
    const flopResult = playerAction(state, "bob", { type: "Check" });
    state = flopResult.state;

    expect(flopResult.events.map((event) => event.type)).toEqual([
      "PlayerActed",
      "CardBurned",
      "BoardCardsDealt",
      "StreetAdvanced",
      "ActionRequested"
    ]);
    expect(state.hand?.burnedCards.map(cardKey)).toEqual(["8d"]);
    expect(state.hand?.street).toBe("flop");
    expect(state.hand?.board.map(cardKey)).toEqual(["2c", "3d", "4s"]);
    expect(state.hand?.activePlayerId).toBe("bob");
    expect(state.hand?.currentBet).toBe(0);
  });

  it("advances streets after postflop check/check", () => {
    let { state } = startRiggedHand(COMMON_HAND);

    state = playerAction(state, "alice", { type: "Call" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;

    expect(state.hand?.street).toBe("turn");
    expect(state.hand?.board.map(cardKey)).toEqual(["2c", "3d", "4s", "5h"]);
    expect(state.hand?.burnedCards.map(cardKey)).toEqual(["8d", "7c"]);
    expect(state.hand?.activePlayerId).toBe("bob");
  });

  it("handles bet/call and advances the street", () => {
    let { state } = startRiggedHand(COMMON_HAND);

    state = playerAction(state, "alice", { type: "Call" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Bet", amount: 20 }).state;
    state = playerAction(state, "alice", { type: "Call" }).state;

    expect(state.hand?.street).toBe("turn");
    expect(state.hand?.pot).toBe(60);
    expect(state.hand?.activePlayerId).toBe("bob");
  });

  it("reaches showdown on the river and preserves total chips", () => {
    let { state } = startRiggedHand(COMMON_HAND);

    state = playerAction(state, "alice", { type: "Call" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;

    expect(state.hand?.handComplete).toBe(true);
    expect(state.hand?.burnedCards.map(cardKey)).toEqual(["8d", "7c", "6d"]);
    expect(state.hand?.winners[0]?.playerId).toBe("alice");
    expect(state.hand?.winners[0]?.handRank?.category).toBe("straight");
    expect(state.seats.reduce((total, seat) => total + seat.stack, 0)).toBe(2000);
  });

  it("runs out the board after preflop all-in and preserves chips", () => {
    let { state } = startRiggedHand(COMMON_HAND);

    state = playerAction(state, "alice", { type: "AllIn" }).state;
    state = playerAction(state, "bob", { type: "Call" }).state;

    expect(state.hand?.handComplete).toBe(true);
    expect(state.hand?.board.map(cardKey)).toEqual(["2c", "3d", "4s", "5h", "9c"]);
    expect(state.hand?.burnedCards.map(cardKey)).toEqual(["8d", "7c", "6d"]);
    expect(state.hand?.winners[0]?.playerId).toBe("alice");
    expect(state.seats.find((seat) => seat.playerId === "alice")?.stack).toBe(2000);
    expect(state.seats.find((seat) => seat.playerId === "bob")?.stack).toBe(0);
    expect(state.seats.reduce((total, seat) => total + seat.stack, 0)).toBe(2000);
  });

  it("splits the pot when both players tie at showdown", () => {
    let { state } = startRiggedHand(BOARD_TIE_HAND);

    state = playerAction(state, "alice", { type: "Call" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;
    state = playerAction(state, "bob", { type: "Check" }).state;
    state = playerAction(state, "alice", { type: "Check" }).state;

    expect(state.hand?.winners).toHaveLength(2);
    expect(state.hand?.winners.map((winner) => winner.amount)).toEqual([10, 10]);
    expect(state.seats.find((seat) => seat.playerId === "alice")?.stack).toBe(1000);
    expect(state.seats.find((seat) => seat.playerId === "bob")?.stack).toBe(1000);
  });

  it("returns the unmatched side pot when the short all-in wins the main pot", () => {
    let { state } = startRiggedHand(SHORT_ALL_IN_SIDE_POT_HAND, {
      alice: 1000,
      bob: 100
    });

    state = playerAction(state, "alice", { type: "AllIn" }).state;
    state = playerAction(state, "bob", { type: "AllIn" }).state;

    const aliceAward = state.hand?.winners.find((winner) => winner.playerId === "alice");
    const bobAward = state.hand?.winners.find((winner) => winner.playerId === "bob");

    expect(aliceAward?.amount).toBe(900);
    expect(bobAward?.amount).toBe(200);
    expect(state.seats.find((seat) => seat.playerId === "alice")?.stack).toBe(900);
    expect(state.seats.find((seat) => seat.playerId === "bob")?.stack).toBe(200);
    expect(state.seats.reduce((total, seat) => total + seat.stack, 0)).toBe(1100);
  });
});

describe("state reconstruction and privacy", () => {
  it("rebuilds deterministic state from domain events and materializes hand event records", () => {
    const initialState = seatTwoPlayers();
    const startEvents = decide(
      initialState,
      { type: "StartHand", handId: "hand_1", buttonSeat: 0 },
      riggedDeps(COMMON_HAND)
    );
    const finalState = applyEvents(initialState, startEvents);
    const rebuiltState = rebuildState(initialState, startEvents);
    const records = materializeHandEvents(initialState, startEvents);

    expect(stateHash(rebuiltState)).toBe(stateHash(finalState));
    expect(records[0]).toMatchObject({
      handId: "hand_1",
      seq: 0,
      eventType: "HandStarted",
      schemaVersion: 1
    });
    expect(records[0]?.stateHashAfter).toHaveLength(16);
  });

  it("rebuilds a completed hand with burned cards from domain events", () => {
    const initialState = seatTwoPlayers();
    const allEvents: DomainEvent[] = [
      ...decide(
        initialState,
        { type: "StartHand", handId: "hand_1", buttonSeat: 0 },
        riggedDeps(COMMON_HAND)
      )
    ];
    let state = applyEvents(initialState, allEvents);

    for (const [playerId, action] of [
      ["alice", { type: "Call" }],
      ["bob", { type: "Check" }],
      ["bob", { type: "Check" }],
      ["alice", { type: "Check" }],
      ["bob", { type: "Check" }],
      ["alice", { type: "Check" }],
      ["bob", { type: "Check" }],
      ["alice", { type: "Check" }]
    ] as const) {
      const result = playerAction(state, playerId, action);
      allEvents.push(...result.events);
      state = result.state;
    }

    const rebuiltState = rebuildState(initialState, allEvents);
    const records = materializeHandEvents(initialState, allEvents);

    expect(stateHash(rebuiltState)).toBe(stateHash(state));
    expect(rebuiltState.hand?.burnedCards.map(cardKey)).toEqual(["8d", "7c", "6d"]);
    expect(records.filter((record) => record.eventType === "CardBurned")).toHaveLength(
      3
    );
  });

  it("filters private cards from public view and exposes only the player's own cards", () => {
    const { state } = startRiggedHand(COMMON_HAND);
    const publicView = toPublicTableView(state);
    const aliceView = toPlayerTableView(state, "alice");
    const bobSeatInAliceView = aliceView.seats.find((seat) => seat.playerId === "bob");

    expect(publicView.seats.every((seat) => "holeCards" in seat === false)).toBe(true);
    expect(publicView.hand === null ? false : "burnedCards" in publicView.hand).toBe(
      false
    );
    expect(aliceView.hand === null ? false : "burnedCards" in aliceView.hand).toBe(
      false
    );
    expect(publicView.seats.map((seat) => seat.holeCardCount)).toEqual([2, 2]);
    expect(
      aliceView.seats.find((seat) => seat.playerId === "alice")?.holeCards.map(cardKey)
    ).toEqual(["Ah", "As"]);
    expect(bobSeatInAliceView?.holeCards).toEqual([]);
  });

  it("rejects stale expectedSeq commands", () => {
    const { state } = startRiggedHand(COMMON_HAND);

    expect(() =>
      decide(
        state,
        {
          type: "PlayerAction",
          playerId: "alice",
          expectedSeq: 0,
          idempotencyKey: "idem_alice_stale_0000",
          action: { type: "Call" }
        },
        riggedDeps([])
      )
    ).toThrow("expectedSeq");
  });

  it("rejects player actions without an idempotency key", () => {
    const { state } = startRiggedHand(COMMON_HAND);

    expect(() =>
      decide(
        state,
        {
          type: "PlayerAction",
          playerId: "alice",
          expectedSeq: state.hand?.nextSeq ?? -1,
          idempotencyKey: "",
          action: { type: "Call" }
        },
        riggedDeps([])
      )
    ).toThrow("idempotencyKey");
  });

  it("starts each new hand at sequence zero", () => {
    let state = startRiggedHand(COMMON_HAND).state;

    state = playerAction(state, "alice", { type: "Fold" }).state;

    const nextHandEvents = decide(
      state,
      { type: "StartHand", handId: "hand_2", buttonSeat: 1 },
      riggedDeps(SHORT_ALL_IN_SIDE_POT_HAND)
    );
    const nextState = applyEvents(state, nextHandEvents);

    expect(nextHandEvents[0]).toMatchObject({
      type: "HandStarted",
      handId: "hand_2",
      seq: 0
    });
    expect(nextState.hand?.handId).toBe("hand_2");
    expect(nextState.hand?.nextSeq).toBe(nextHandEvents.length);
  });

  it("rejects events that target a different active hand", () => {
    const { state } = startRiggedHand(COMMON_HAND);

    expect(() =>
      applyEvent(state, {
        type: "ActionRequested",
        handId: "other_hand",
        seq: state.hand?.nextSeq ?? -1,
        playerId: "alice",
        legalActions: []
      })
    ).toThrow("handId");
  });
});
