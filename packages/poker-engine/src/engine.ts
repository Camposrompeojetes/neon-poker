import {
  type Card,
  type Rng,
  assertUniqueCards,
  cardKey,
  createDeck,
  shuffleDeck
} from "./cards";
import { compareHandRanks, evaluateTexasHoldem, type HandRank } from "./evaluator";

export type Street = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "ended";
export type PlayerStatus = "empty" | "seated" | "inHand" | "folded" | "allIn";

export type TableConfig = {
  maxSeats: 2 | 6;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
};

export const HEADS_UP_TABLE_CONFIG: TableConfig = {
  maxSeats: 2,
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000
};

export type Seat = {
  seatIndex: number;
  playerId: string | null;
  stack: number;
  status: PlayerStatus;
  holeCards: Card[];
};

export type Winner = {
  playerId: string;
  amount: number;
  handRank: HandRank | null;
};

export type LegalAction =
  | { type: "Fold" }
  | { type: "Check" }
  | { type: "Call"; amount: number }
  | { type: "Bet"; min: number; max: number }
  | { type: "Raise"; min: number; max: number }
  | { type: "AllIn"; amount: number };

export type PokerAction =
  | { type: "Fold" }
  | { type: "Check" }
  | { type: "Call" }
  | { type: "Bet"; amount: number }
  | { type: "Raise"; amount: number }
  | { type: "AllIn" };

export type HandState = {
  handId: string;
  buttonSeat: number;
  deck: Card[];
  burnedCards: Card[];
  board: Card[];
  street: Street;
  pot: number;
  currentBet: number;
  minRaise: number;
  activePlayerId: string | null;
  legalActions: LegalAction[];
  committed: Record<string, number>;
  streetCommitted: Record<string, number>;
  actedThisStreet: string[];
  winners: Winner[];
  nextSeq: number;
  handComplete: boolean;
};

export type GameState = {
  tableId: string;
  config: TableConfig;
  seats: Seat[];
  hand: HandState | null;
  lastButtonSeat: number | null;
};

export type SeatPlayerCommand = {
  type: "SeatPlayer";
  playerId: string;
  seatIndex: number;
  stack?: number;
};

export type StandUpCommand = {
  type: "StandUp";
  playerId: string;
};

export type StartHandCommand = {
  type: "StartHand";
  handId: string;
  buttonSeat?: number;
};

export type PlayerActionCommand = {
  type: "PlayerAction";
  playerId: string;
  action: PokerAction;
  expectedSeq: number;
  idempotencyKey: string;
};

export type GameCommand =
  | SeatPlayerCommand
  | StandUpCommand
  | StartHandCommand
  | PlayerActionCommand;

export type EngineDeps = {
  rng: Rng;
  shuffle?: (deck: readonly Card[], rng: Rng) => Card[];
};

export type TableDomainEvent =
  | {
      type: "PlayerSeated";
      playerId: string;
      seatIndex: number;
      stack: number;
    }
  | {
      type: "PlayerStoodUp";
      playerId: string;
    };

export type HandDomainEvent =
  | {
      type: "HandStarted";
      handId: string;
      seq: number;
      buttonSeat: number;
      deck: Card[];
    }
  | {
      type: "PrivateCardsDealt";
      handId: string;
      seq: number;
      playerId: string;
      cards: Card[];
    }
  | {
      type: "BlindPosted";
      handId: string;
      seq: number;
      playerId: string;
      amount: number;
    }
  | {
      type: "ActionRequested";
      handId: string;
      seq: number;
      playerId: string;
      legalActions: LegalAction[];
    }
  | {
      type: "PlayerActed";
      handId: string;
      seq: number;
      playerId: string;
      action: PokerAction;
    }
  | {
      type: "BoardCardsDealt";
      handId: string;
      seq: number;
      street: "flop" | "turn" | "river";
      cards: Card[];
    }
  | {
      type: "CardBurned";
      handId: string;
      seq: number;
      street: "flop" | "turn" | "river";
      card: Card;
    }
  | {
      type: "StreetAdvanced";
      handId: string;
      seq: number;
      street: "preflop" | "flop" | "turn" | "river";
    }
  | {
      type: "ShowdownStarted";
      handId: string;
      seq: number;
    }
  | {
      type: "HandEnded";
      handId: string;
      seq: number;
      winners: Winner[];
      reason: "fold" | "showdown";
    };

type NewHandEvent = HandDomainEvent extends infer Event
  ? Event extends HandDomainEvent
    ? Omit<Event, "seq">
    : never
  : never;

export type DomainEvent = TableDomainEvent | HandDomainEvent;

export type PersistableHandEvent = {
  handId: string;
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  stateHashAfter: string;
};

export type PublicSeatView = {
  seatIndex: number;
  playerId: string | null;
  stack: number;
  status: PlayerStatus;
  holeCardCount: number;
};

export type PublicTableView = {
  tableId: string;
  seats: PublicSeatView[];
  hand: null | {
    handId: string;
    buttonSeat: number;
    board: Card[];
    street: Street;
    pot: number;
    currentBet: number;
    activePlayerId: string | null;
    nextSeq: number;
    handComplete: boolean;
    winners: Winner[];
  };
};

export type PlayerSeatView = PublicSeatView & {
  holeCards: Card[];
};

export type PlayerTableView = Omit<PublicTableView, "seats" | "hand"> & {
  seats: PlayerSeatView[];
  hand: null | (NonNullable<PublicTableView["hand"]> & {
    legalActions: LegalAction[];
  });
};

export function createInitialState(tableId: string, config: TableConfig): GameState {
  return {
    tableId,
    config,
    seats: Array.from({ length: config.maxSeats }, (_, seatIndex) => ({
      seatIndex,
      playerId: null,
      stack: 0,
      status: "empty",
      holeCards: []
    })),
    hand: null,
    lastButtonSeat: null
  };
}

export function decide(
  state: GameState,
  command: GameCommand,
  deps: EngineDeps
): DomainEvent[] {
  switch (command.type) {
    case "SeatPlayer":
      return decideSeatPlayer(state, command);
    case "StandUp":
      return decideStandUp(state, command);
    case "StartHand":
      return decideStartHand(state, command, deps);
    case "PlayerAction":
      return decidePlayerAction(state, command);
  }
}

export function applyEvent(state: GameState, event: DomainEvent): GameState {
  const next = clone(state);

  switch (event.type) {
    case "PlayerSeated":
      next.seats = next.seats.map((seat) =>
        seat.seatIndex === event.seatIndex
          ? {
              seatIndex: event.seatIndex,
              playerId: event.playerId,
              stack: event.stack,
              status: "seated",
              holeCards: []
            }
          : seat
      );
      return next;

    case "PlayerStoodUp":
      next.seats = next.seats.map((seat) =>
        seat.playerId === event.playerId
          ? {
              seatIndex: seat.seatIndex,
              playerId: null,
              stack: 0,
              status: "empty",
              holeCards: []
            }
          : seat
      );
      return next;

    case "HandStarted":
      if (next.hand !== null && !next.hand.handComplete) {
        throw new Error("Cannot start a new hand while another hand is active");
      }
      assertNextHandSeq(next, event);
      next.hand = {
        handId: event.handId,
        buttonSeat: event.buttonSeat,
        deck: event.deck,
        burnedCards: [],
        board: [],
        street: "preflop",
        pot: 0,
        currentBet: 0,
        minRaise: next.config.bigBlind,
        activePlayerId: null,
        legalActions: [],
        committed: {},
        streetCommitted: {},
        actedThisStreet: [],
        winners: [],
        nextSeq: event.seq + 1,
        handComplete: false
      };
      next.lastButtonSeat = event.buttonSeat;
      next.seats = next.seats.map((seat) =>
        seat.playerId === null ? seat : { ...seat, status: "inHand", holeCards: [] }
      );
      return next;

    case "PrivateCardsDealt":
      assertNextHandSeq(next, event);
      applyPrivateCardsDealt(next, event);
      incrementHandSeq(next, event);
      return next;

    case "BlindPosted":
      assertNextHandSeq(next, event);
      applyBlindPosted(next, event);
      incrementHandSeq(next, event);
      return next;

    case "ActionRequested":
      assertNextHandSeq(next, event);
      requireHand(next).activePlayerId = event.playerId;
      requireHand(next).legalActions = event.legalActions;
      incrementHandSeq(next, event);
      return next;

    case "PlayerActed":
      assertNextHandSeq(next, event);
      applyPlayerActed(next, event);
      incrementHandSeq(next, event);
      return next;

    case "BoardCardsDealt":
      assertNextHandSeq(next, event);
      applyBoardCardsDealt(next, event);
      incrementHandSeq(next, event);
      return next;

    case "CardBurned":
      assertNextHandSeq(next, event);
      applyCardBurned(next, event);
      incrementHandSeq(next, event);
      return next;

    case "StreetAdvanced":
      assertNextHandSeq(next, event);
      applyStreetAdvanced(next, event);
      incrementHandSeq(next, event);
      return next;

    case "ShowdownStarted":
      assertNextHandSeq(next, event);
      requireHand(next).street = "showdown";
      requireHand(next).activePlayerId = null;
      requireHand(next).legalActions = [];
      incrementHandSeq(next, event);
      return next;

    case "HandEnded":
      assertNextHandSeq(next, event);
      applyHandEnded(next, event);
      incrementHandSeq(next, event);
      return next;
  }
}

export function applyEvents(state: GameState, events: readonly DomainEvent[]): GameState {
  return events.reduce((currentState, event) => applyEvent(currentState, event), state);
}

export function rebuildState(
  initialState: GameState,
  events: readonly DomainEvent[]
): GameState {
  return applyEvents(initialState, events);
}

export function stateHash(state: GameState): string {
  return fnv1a64(stableStringify(state));
}

export function materializeHandEvents(
  initialState: GameState,
  events: readonly DomainEvent[],
  schemaVersion = 1
): PersistableHandEvent[] {
  let currentState = initialState;
  const records: PersistableHandEvent[] = [];

  for (const event of events) {
    currentState = applyEvent(currentState, event);

    if (isHandEvent(event)) {
      records.push({
        handId: event.handId,
        seq: event.seq,
        eventType: event.type,
        payload: eventPayload(event),
        schemaVersion,
        stateHashAfter: stateHash(currentState)
      });
    }
  }

  return records;
}

export function toPublicTableView(state: GameState): PublicTableView {
  return {
    tableId: state.tableId,
    seats: state.seats.map(toPublicSeatView),
    hand:
      state.hand === null
        ? null
        : {
            handId: state.hand.handId,
            buttonSeat: state.hand.buttonSeat,
            board: state.hand.board,
            street: state.hand.street,
            pot: state.hand.pot,
            currentBet: state.hand.currentBet,
            activePlayerId: state.hand.activePlayerId,
            nextSeq: state.hand.nextSeq,
            handComplete: state.hand.handComplete,
            winners: state.hand.winners
          }
  };
}

export function toSpectatorView(state: GameState): PublicTableView {
  return toPublicTableView(state);
}

export function toPlayerTableView(state: GameState, playerId: string): PlayerTableView {
  const publicView = toPublicTableView(state);

  return {
    ...publicView,
    seats: state.seats.map((seat) => ({
      ...toPublicSeatView(seat),
      holeCards: seat.playerId === playerId ? seat.holeCards : []
    })),
    hand:
      publicView.hand === null
        ? null
        : {
            ...publicView.hand,
            legalActions:
              state.hand?.activePlayerId === playerId ? state.hand.legalActions : []
          }
  };
}

export function toInternalDebugView(state: GameState): GameState {
  return clone(state);
}

function decideSeatPlayer(
  state: GameState,
  command: SeatPlayerCommand
): DomainEvent[] {
  if (state.hand !== null && !state.hand.handComplete) {
    throw new Error("Cannot seat a player while a hand is active");
  }

  const seat = state.seats[command.seatIndex];

  if (seat === undefined) {
    throw new Error("Seat index does not exist");
  }

  if (seat.playerId !== null) {
    throw new Error("Seat is already occupied");
  }

  if (state.seats.some((candidate) => candidate.playerId === command.playerId)) {
    throw new Error("Player is already seated");
  }

  return [
    {
      type: "PlayerSeated",
      playerId: command.playerId,
      seatIndex: command.seatIndex,
      stack: command.stack ?? state.config.startingStack
    }
  ];
}

function decideStandUp(state: GameState, command: StandUpCommand): DomainEvent[] {
  if (state.hand !== null && !state.hand.handComplete) {
    throw new Error("Cannot stand up while a hand is active");
  }

  if (!state.seats.some((seat) => seat.playerId === command.playerId)) {
    throw new Error("Player is not seated");
  }

  return [{ type: "PlayerStoodUp", playerId: command.playerId }];
}

function decideStartHand(
  state: GameState,
  command: StartHandCommand,
  deps: EngineDeps
): DomainEvent[] {
  if (state.hand !== null && !state.hand.handComplete) {
    throw new Error("A hand is already active");
  }

  const occupiedSeats = state.seats.filter(
    (seat) => seat.playerId !== null && seat.stack > 0
  );

  if (occupiedSeats.length !== 2) {
    throw new Error("MVP heads-up hands require exactly two seated players");
  }

  const buttonSeat = command.buttonSeat ?? occupiedSeats[0]?.seatIndex;

  if (buttonSeat === undefined || !occupiedSeats.some((seat) => seat.seatIndex === buttonSeat)) {
    throw new Error("Button must be assigned to an occupied seat");
  }

  const shuffledDeck = (deps.shuffle ?? shuffleDeck)(createDeck(), deps.rng);
  assertUniqueCards(shuffledDeck);

  if (shuffledDeck.length !== 52) {
    throw new Error("A hand must start with a 52-card deck");
  }

  let draft = state;
  const events: DomainEvent[] = [];
  const push = (event: DomainEvent) => {
    events.push(event);
    draft = applyEvent(draft, event);
  };
  const pushHand = (event: NewHandEvent) => {
    push({ ...event, seq: nextHandSeq(draft, event.type) } as HandDomainEvent);
  };

  pushHand({
    type: "HandStarted",
    handId: command.handId,
    buttonSeat,
    deck: shuffledDeck
  });

  const dealOrder = seatsStartingAt(draft, buttonSeat);
  const firstSeat = dealOrder[0];
  const secondSeat = dealOrder[1];

  if (
    firstSeat === undefined ||
    firstSeat.playerId === null ||
    secondSeat === undefined ||
    secondSeat.playerId === null
  ) {
    throw new Error("Unable to determine heads-up deal order");
  }

  pushHand({
    type: "PrivateCardsDealt",
    handId: command.handId,
    playerId: firstSeat.playerId,
    cards: takeCards(shuffledDeck, [0, 2])
  });
  pushHand({
    type: "PrivateCardsDealt",
    handId: command.handId,
    playerId: secondSeat.playerId,
    cards: takeCards(shuffledDeck, [1, 3])
  });

  const smallBlindSeat = requireSeatByIndex(draft, buttonSeat);
  const bigBlindSeat = nextOccupiedSeat(draft, buttonSeat);

  if (smallBlindSeat.playerId === null || bigBlindSeat.playerId === null) {
    throw new Error("Blinds require seated players");
  }

  pushHand({
    type: "BlindPosted",
    handId: command.handId,
    playerId: smallBlindSeat.playerId,
    amount: Math.min(draft.config.smallBlind, smallBlindSeat.stack)
  });
  pushHand({
    type: "BlindPosted",
    handId: command.handId,
    playerId: bigBlindSeat.playerId,
    amount: Math.min(draft.config.bigBlind, bigBlindSeat.stack)
  });
  pushHand({
    type: "ActionRequested",
    handId: command.handId,
    playerId: smallBlindSeat.playerId,
    legalActions: getLegalActions(draft, smallBlindSeat.playerId)
  });

  return events;
}

function decidePlayerAction(
  state: GameState,
  command: PlayerActionCommand
): DomainEvent[] {
  const hand = requireHand(state);

  if (hand.handComplete) {
    throw new Error("Hand is already complete");
  }

  if (command.expectedSeq !== hand.nextSeq) {
    throw new Error("Command expectedSeq does not match current hand sequence");
  }

  if (command.idempotencyKey.length === 0) {
    throw new Error("Command idempotencyKey is required");
  }

  if (hand.activePlayerId !== command.playerId) {
    throw new Error("It is not this player's turn");
  }

  if (!isActionLegal(command.action, hand.legalActions)) {
    throw new Error("Action is not legal in the current state");
  }

  let draft = state;
  const events: DomainEvent[] = [];
  const push = (event: DomainEvent) => {
    events.push(event);
    draft = applyEvent(draft, event);
  };
  const pushHand = (event: NewHandEvent) => {
    push({ ...event, seq: nextHandSeq(draft, event.type) } as HandDomainEvent);
  };

  pushHand({
    type: "PlayerActed",
    handId: hand.handId,
    playerId: command.playerId,
    action: command.action
  });

  const remainingPlayers = playersStillContesting(draft);

  if (remainingPlayers.length === 1) {
    const winner = remainingPlayers[0];

    if (winner?.playerId === null || winner === undefined) {
      throw new Error("Expected remaining winner");
    }

    pushHand({
      type: "HandEnded",
      handId: hand.handId,
      winners: awardRemainingPotTo(draft, winner.playerId),
      reason: "fold"
    });
    return events;
  }

  if (isBettingRoundComplete(draft)) {
    appendRoundCompletionEvents(draft, pushHand);
    return events;
  }

  const nextPlayer = nextPlayerToAct(draft, command.playerId);

  if (nextPlayer === null) {
    appendRoundCompletionEvents(draft, pushHand);
    return events;
  }

  pushHand({
    type: "ActionRequested",
    handId: hand.handId,
    playerId: nextPlayer,
    legalActions: getLegalActions(draft, nextPlayer)
  });

  return events;
}

function appendRoundCompletionEvents(
  state: GameState,
  pushHand: (event: NewHandEvent) => void
): void {
  let draft = state;
  const pushAndApply = (event: NewHandEvent) => {
    const fullEvent = { ...event, seq: nextHandSeq(draft, event.type) } as HandDomainEvent;
    pushHand(event);
    draft = applyEvent(draft, fullEvent);
  };
  const hand = requireHand(state);

  if (hand.street === "river") {
    pushAndApply({ type: "ShowdownStarted", handId: hand.handId });
    pushAndApply({
      type: "HandEnded",
      handId: hand.handId,
      winners: determineShowdownWinners(draft),
      reason: "showdown"
    });
    return;
  }

  const nextStreet = nextBoardStreet(hand.street);

  pushAndApply({
    type: "CardBurned",
    handId: hand.handId,
    street: nextStreet,
    card: dealBurnCard(hand.deck)
  });
  pushAndApply({
    type: "BoardCardsDealt",
    handId: hand.handId,
    street: nextStreet,
    cards: dealBoardCards(requireHand(draft).deck, nextStreet)
  });
  pushAndApply({
    type: "StreetAdvanced",
    handId: hand.handId,
    street: nextStreet
  });

  const firstActor = firstPostflopActor(draft);

  if (firstActor === null) {
    appendRoundCompletionEvents(draft, pushHand);
    return;
  }

  pushAndApply({
    type: "ActionRequested",
    handId: hand.handId,
    playerId: firstActor,
    legalActions: getLegalActions(draft, firstActor)
  });
}

function applyPrivateCardsDealt(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "PrivateCardsDealt" }>
): void {
  const hand = requireHand(state);
  state.seats = state.seats.map((seat) =>
    seat.playerId === event.playerId ? { ...seat, holeCards: event.cards } : seat
  );
  hand.deck = removeCards(hand.deck, event.cards);
}

function applyBlindPosted(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "BlindPosted" }>
): void {
  const hand = requireHand(state);
  const seat = requireSeatByPlayerId(state, event.playerId);
  const amount = Math.min(event.amount, seat.stack);

  state.seats = state.seats.map((candidate) =>
    candidate.playerId === event.playerId
      ? {
          ...candidate,
          stack: candidate.stack - amount,
          status: candidate.stack - amount === 0 ? "allIn" : candidate.status
        }
      : candidate
  );
  hand.pot += amount;
  hand.committed = addCommitment(hand.committed, event.playerId, amount);
  hand.streetCommitted = addCommitment(hand.streetCommitted, event.playerId, amount);
  hand.currentBet = Math.max(hand.currentBet, hand.streetCommitted[event.playerId] ?? 0);
}

function applyPlayerActed(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "PlayerActed" }>
): void {
  const hand = requireHand(state);
  const seat = requireSeatByPlayerId(state, event.playerId);
  const beforeStreetCommitment = hand.streetCommitted[event.playerId] ?? 0;
  const previousCurrentBet = hand.currentBet;
  const contribution = contributionForAction(hand, seat, event.action);
  const targetStreetCommitment = beforeStreetCommitment + contribution;
  const isAggressive = targetStreetCommitment > previousCurrentBet;

  state.seats = state.seats.map((candidate) => {
    if (candidate.playerId !== event.playerId) {
      return candidate;
    }

    if (event.action.type === "Fold") {
      return { ...candidate, status: "folded" };
    }

    return {
      ...candidate,
      stack: candidate.stack - contribution,
      status: candidate.stack - contribution === 0 ? "allIn" : candidate.status
    };
  });

  hand.activePlayerId = null;
  hand.legalActions = [];

  if (event.action.type === "Fold") {
    hand.actedThisStreet = addUnique(hand.actedThisStreet, event.playerId);
    return;
  }

  hand.pot += contribution;
  hand.committed = addCommitment(hand.committed, event.playerId, contribution);
  hand.streetCommitted = addCommitment(
    hand.streetCommitted,
    event.playerId,
    contribution
  );

  if (isAggressive) {
    hand.minRaise = Math.max(hand.minRaise, targetStreetCommitment - previousCurrentBet);
    hand.currentBet = targetStreetCommitment;
    hand.actedThisStreet = [event.playerId];
    return;
  }

  hand.actedThisStreet = addUnique(hand.actedThisStreet, event.playerId);
}

function applyBoardCardsDealt(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "BoardCardsDealt" }>
): void {
  const hand = requireHand(state);
  assertTopCards(hand.deck, event.cards);
  hand.board = [...hand.board, ...event.cards];
  hand.deck = hand.deck.slice(event.cards.length);
}

function applyCardBurned(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "CardBurned" }>
): void {
  const hand = requireHand(state);
  assertTopCards(hand.deck, [event.card]);
  hand.burnedCards = [...hand.burnedCards, event.card];
  hand.deck = hand.deck.slice(1);
}

function applyStreetAdvanced(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "StreetAdvanced" }>
): void {
  const hand = requireHand(state);
  hand.street = event.street;
  hand.currentBet = 0;
  hand.minRaise = state.config.bigBlind;
  hand.streetCommitted = {};
  hand.actedThisStreet = [];
  hand.activePlayerId = null;
  hand.legalActions = [];
}

function applyHandEnded(
  state: GameState,
  event: Extract<HandDomainEvent, { type: "HandEnded" }>
): void {
  const hand = requireHand(state);

  state.seats = state.seats.map((seat) => {
    const winner = event.winners.find((candidate) => candidate.playerId === seat.playerId);

    if (seat.playerId === null) {
      return seat;
    }

    return {
      ...seat,
      stack: seat.stack + (winner?.amount ?? 0),
      status: "seated"
    };
  });
  hand.pot = 0;
  hand.street = "ended";
  hand.activePlayerId = null;
  hand.legalActions = [];
  hand.winners = event.winners;
  hand.handComplete = true;
}

function getLegalActions(state: GameState, playerId: string): LegalAction[] {
  const hand = requireHand(state);
  const seat = requireSeatByPlayerId(state, playerId);
  const streetCommitted = hand.streetCommitted[playerId] ?? 0;
  const callAmount = hand.currentBet - streetCommitted;
  const actions: LegalAction[] = [];

  if (callAmount > 0) {
    actions.push({ type: "Fold" });

    if (seat.stack >= callAmount) {
      actions.push({ type: "Call", amount: callAmount });
    }

    const minRaiseTo = hand.currentBet + hand.minRaise;

    if (seat.stack + streetCommitted >= minRaiseTo) {
      actions.push({
        type: "Raise",
        min: minRaiseTo,
        max: streetCommitted + seat.stack
      });
    }
  } else {
    actions.push({ type: "Check" });

    if (seat.stack > 0) {
      actions.push({
        type: "Bet",
        min: Math.min(state.config.bigBlind, seat.stack),
        max: seat.stack
      });
    }
  }

  if (seat.stack > 0) {
    actions.push({ type: "AllIn", amount: seat.stack });
  }

  return actions;
}

function isActionLegal(action: PokerAction, legalActions: readonly LegalAction[]): boolean {
  const legalAction = legalActions.find((candidate) => candidate.type === action.type);

  if (legalAction === undefined) {
    return false;
  }

  if (action.type === "Bet" && legalAction.type === "Bet") {
    return action.amount >= legalAction.min && action.amount <= legalAction.max;
  }

  if (action.type === "Raise" && legalAction.type === "Raise") {
    return action.amount >= legalAction.min && action.amount <= legalAction.max;
  }

  return action.type !== "Bet" && action.type !== "Raise";
}

function contributionForAction(hand: HandState, seat: Seat, action: PokerAction): number {
  const streetCommitted = hand.streetCommitted[seat.playerId ?? ""] ?? 0;

  switch (action.type) {
    case "Fold":
    case "Check":
      return 0;
    case "Call":
      return Math.min(hand.currentBet - streetCommitted, seat.stack);
    case "Bet":
    case "Raise":
      return action.amount - streetCommitted;
    case "AllIn":
      return seat.stack;
  }
}

function isBettingRoundComplete(state: GameState): boolean {
  const hand = requireHand(state);
  const actors = playersStillContesting(state).filter(
    (seat) => seat.stack > 0 && seat.status !== "allIn"
  );

  if (actors.length === 0) {
    return true;
  }

  return actors.every((seat) => {
    if (seat.playerId === null) {
      return false;
    }

    return (
      hand.actedThisStreet.includes(seat.playerId) &&
      (hand.streetCommitted[seat.playerId] ?? 0) === hand.currentBet
    );
  });
}

function nextPlayerToAct(state: GameState, fromPlayerId: string): string | null {
  const seat = requireSeatByPlayerId(state, fromPlayerId);
  const nextSeat = nextSeatMatching(state, seat.seatIndex, (candidate) =>
    canSeatAct(candidate)
  );

  return nextSeat?.playerId ?? null;
}

function firstPostflopActor(state: GameState): string | null {
  const hand = requireHand(state);
  const seat = nextSeatMatching(state, hand.buttonSeat, (candidate) => canSeatAct(candidate));

  return seat?.playerId ?? null;
}

function canSeatAct(seat: Seat): boolean {
  return seat.playerId !== null && seat.status === "inHand" && seat.stack > 0;
}

function playersStillContesting(state: GameState): Seat[] {
  return state.seats.filter(
    (seat) => seat.playerId !== null && (seat.status === "inHand" || seat.status === "allIn")
  );
}

function awardRemainingPotTo(state: GameState, playerId: string): Winner[] {
  return [
    {
      playerId,
      amount: requireHand(state).pot,
      handRank: null
    }
  ];
}

function determineShowdownWinners(state: GameState): Winner[] {
  const hand = requireHand(state);
  const contenders = playersStillContesting(state);
  const ranked = contenders.map((seat) => {
    if (seat.playerId === null || seat.holeCards.length !== 2) {
      throw new Error("Showdown requires two private cards per contender");
    }

    return {
      playerId: seat.playerId,
      seatIndex: seat.seatIndex,
      rank: evaluateTexasHoldem([...seat.holeCards, ...hand.board])
    };
  });
  const firstRanked = ranked[0];

  if (firstRanked === undefined) {
    throw new Error("Showdown requires at least one contender");
  }

  const commitmentLevels = [...new Set(Object.values(hand.committed).filter((amount) => amount > 0))]
    .sort((left, right) => left - right);
  const awards = new Map<string, Winner>();
  let previousLevel = 0;

  for (const level of commitmentLevels) {
    const contributors = Object.entries(hand.committed).filter(
      ([, amount]) => amount >= level
    );
    const potAmount = (level - previousLevel) * contributors.length;
    previousLevel = level;

    if (potAmount === 0) {
      continue;
    }

    const eligible = ranked.filter(
      (candidate) => (hand.committed[candidate.playerId] ?? 0) >= level
    );
    const best = eligible.reduce((currentBest, candidate) =>
      compareHandRanks(candidate.rank, currentBest.rank) > 0 ? candidate : currentBest
    );
    const winners = eligible
      .filter((candidate) => compareHandRanks(candidate.rank, best.rank) === 0)
      .sort((left, right) => left.seatIndex - right.seatIndex);
    const baseAmount = Math.floor(potAmount / winners.length);
    let remainder = potAmount % winners.length;

    for (const winner of winners) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;

      const currentAward = awards.get(winner.playerId);
      awards.set(winner.playerId, {
        playerId: winner.playerId,
        amount: (currentAward?.amount ?? 0) + baseAmount + extra,
        handRank: winner.rank
      });
    }
  }

  if (awards.size === 0) {
    throw new Error("Showdown produced no winners");
  }

  return [...awards.values()].sort(
    (left, right) =>
      requireSeatByPlayerId(state, left.playerId).seatIndex -
      requireSeatByPlayerId(state, right.playerId).seatIndex
  );
}

function nextBoardStreet(street: Street): "flop" | "turn" | "river" {
  if (street === "preflop") {
    return "flop";
  }

  if (street === "flop") {
    return "turn";
  }

  if (street === "turn") {
    return "river";
  }

  throw new Error(`Cannot deal next board street from ${street}`);
}

function dealBoardCards(deck: readonly Card[], street: "flop" | "turn" | "river"): Card[] {
  const count = street === "flop" ? 3 : 1;
  const cards = deck.slice(0, count);

  if (cards.length !== count) {
    throw new Error("Not enough cards left in deck");
  }

  return cards;
}

function dealBurnCard(deck: readonly Card[]): Card {
  const card = deck[0];

  if (card === undefined) {
    throw new Error("Not enough cards left in deck to burn");
  }

  return card;
}

function assertTopCards(deck: readonly Card[], cards: readonly Card[]): void {
  for (let index = 0; index < cards.length; index += 1) {
    const deckCard = deck[index];
    const eventCard = cards[index];

    if (
      deckCard === undefined ||
      eventCard === undefined ||
      cardKey(deckCard) !== cardKey(eventCard)
    ) {
      throw new Error("Cards must be dealt from the top of the deck");
    }
  }
}

function seatsStartingAt(state: GameState, seatIndex: number): Seat[] {
  const seats: Seat[] = [];
  let currentIndex = seatIndex;

  for (let visited = 0; visited < state.seats.length; visited += 1) {
    const seat = state.seats[currentIndex];

    if (seat !== undefined && seat.playerId !== null) {
      seats.push(seat);
    }

    currentIndex = (currentIndex + 1) % state.seats.length;
  }

  return seats;
}

function nextOccupiedSeat(state: GameState, seatIndex: number): Seat {
  const seat = nextSeatMatching(state, seatIndex, (candidate) => candidate.playerId !== null);

  if (seat === null) {
    throw new Error("Expected another occupied seat");
  }

  return seat;
}

function nextSeatMatching(
  state: GameState,
  seatIndex: number,
  predicate: (seat: Seat) => boolean
): Seat | null {
  let currentIndex = (seatIndex + 1) % state.seats.length;

  for (let visited = 0; visited < state.seats.length; visited += 1) {
    const seat = state.seats[currentIndex];

    if (seat !== undefined && predicate(seat)) {
      return seat;
    }

    currentIndex = (currentIndex + 1) % state.seats.length;
  }

  return null;
}

function requireSeatByIndex(state: GameState, seatIndex: number): Seat {
  const seat = state.seats[seatIndex];

  if (seat === undefined) {
    throw new Error("Seat does not exist");
  }

  return seat;
}

function requireSeatByPlayerId(state: GameState, playerId: string): Seat {
  const seat = state.seats.find((candidate) => candidate.playerId === playerId);

  if (seat === undefined) {
    throw new Error(`Player is not seated: ${playerId}`);
  }

  return seat;
}

function takeCards(deck: readonly Card[], indexes: readonly number[]): Card[] {
  return indexes.map((index) => {
    const card = deck[index];

    if (card === undefined) {
      throw new Error("Deck index out of bounds");
    }

    return card;
  });
}

function removeCards(deck: readonly Card[], cards: readonly Card[]): Card[] {
  const cardKeys = new Set(cards.map(cardKey));
  return deck.filter((card) => !cardKeys.has(cardKey(card)));
}

function addCommitment(
  commitments: Record<string, number>,
  playerId: string,
  amount: number
): Record<string, number> {
  return {
    ...commitments,
    [playerId]: (commitments[playerId] ?? 0) + amount
  };
}

function addUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function requireHand(state: GameState): HandState {
  if (state.hand === null) {
    throw new Error("No active hand");
  }

  return state.hand;
}

function assertNextHandSeq(state: GameState, event: HandDomainEvent): void {
  const expectedSeq =
    event.type === "HandStarted" && (state.hand === null || state.hand.handComplete)
      ? 0
      : requireHand(state).nextSeq;

  if (event.type !== "HandStarted" && requireHand(state).handId !== event.handId) {
    throw new Error(
      `Event handId ${event.handId} does not match active hand ${requireHand(state).handId}`
    );
  }

  if (event.seq !== expectedSeq) {
    throw new Error(`Expected hand event seq ${expectedSeq}, received ${event.seq}`);
  }
}

function nextHandSeq(state: GameState, eventType: HandDomainEvent["type"]): number {
  if (eventType === "HandStarted" && (state.hand === null || state.hand.handComplete)) {
    return 0;
  }

  return requireHand(state).nextSeq;
}

function incrementHandSeq(state: GameState, event: HandDomainEvent): void {
  requireHand(state).nextSeq = event.seq + 1;
}

function isHandEvent(event: DomainEvent): event is HandDomainEvent {
  return "handId" in event;
}

function eventPayload(event: HandDomainEvent): Record<string, unknown> {
  const payload = clone(event) as Record<string, unknown>;
  delete payload.type;
  delete payload.handId;
  delete payload.seq;
  return payload;
}

function toPublicSeatView(seat: Seat): PublicSeatView {
  return {
    seatIndex: seat.seatIndex,
    playerId: seat.playerId,
    stack: seat.stack,
    status: seat.status,
    holeCardCount: seat.holeCards.length
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
