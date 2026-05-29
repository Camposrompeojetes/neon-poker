import {
  PublicReplayEventSchema,
  TableSnapshotEnvelopeSchema,
  type Card,
  type ClientMessage,
  type GameActionMessage,
  type LegalAction,
  type PlayerTableSnapshot,
  type PokerAction,
  type PublicReplayEvent,
  type TableSnapshotEnvelope
} from "@neon-poker/contracts";

export function createLobbySubscribeMessage(requestId: string): ClientMessage {
  return {
    type: "lobby.subscribe",
    requestId
  };
}

export function createTableJoinMessage(requestId: string, tableId: string): ClientMessage {
  return {
    type: "table.join",
    requestId,
    tableId
  };
}

export function createGameActionMessage(args: {
  requestId: string;
  tableId: string;
  playerId: string;
  expectedSeq: number;
  idempotencyKey: string;
  action: PokerAction;
}): GameActionMessage {
  return {
    type: "game.action",
    requestId: args.requestId,
    tableId: args.tableId,
    playerId: args.playerId,
    expectedSeq: args.expectedSeq,
    idempotencyKey: args.idempotencyKey,
    action: args.action
  };
}

export type ActionControlView =
  | {
      type: "Fold" | "Check";
      label: string;
      action: PokerAction;
    }
  | {
      type: "Call" | "AllIn";
      label: string;
      amount: number;
      action: PokerAction;
    }
  | {
      type: "Bet" | "Raise";
      label: string;
      min: number;
      max: number;
      defaultAmount: number;
      action: PokerAction;
    };

export type TableViewModel = {
  tableId: string;
  street: string;
  pot: number;
  currentBet: number;
  activePlayerId: string | null;
  isHeroTurn: boolean;
  board: string[];
  seats: Array<{
    seatIndex: number;
    playerId: string | null;
    stack: number;
    status: string;
    isHero: boolean;
    holeCardCount: number;
    holeCards: string[];
  }>;
  actionControls: ActionControlView[];
};

export type TableClientState = {
  lastSeq: number | null;
  snapshot: PlayerTableSnapshot | null;
  needsResync: boolean;
};

export type HandReplayState = {
  handId: string | null;
  events: PublicReplayEvent[];
  index: number;
  currentEvent: PublicReplayEvent | null;
  currentLabel: string | null;
  board: string[];
  canStepBack: boolean;
  canStepForward: boolean;
};

export const EMPTY_TABLE_CLIENT_STATE: TableClientState = {
  lastSeq: null,
  snapshot: null,
  needsResync: false
};

export function toTableViewModel(
  snapshot: PlayerTableSnapshot,
  viewerPlayerId: string
): TableViewModel {
  const hand = snapshot.hand;
  const isHeroTurn = hand?.activePlayerId === viewerPlayerId;

  return {
    tableId: snapshot.tableId,
    street: hand?.street ?? "waiting",
    pot: hand?.pot ?? 0,
    currentBet: hand?.currentBet ?? 0,
    activePlayerId: hand?.activePlayerId ?? null,
    isHeroTurn,
    board: hand?.board.map(cardLabel) ?? [],
    seats: snapshot.seats.map((seat) => ({
      seatIndex: seat.seatIndex,
      playerId: seat.playerId,
      stack: seat.stack,
      status: seat.status,
      isHero: seat.playerId === viewerPlayerId,
      holeCardCount: seat.holeCardCount,
      holeCards: seat.holeCards.map(cardLabel)
    })),
    actionControls: isHeroTurn ? hand.legalActions.map(toActionControlView) : []
  };
}

export function applyTableSnapshotEnvelope(
  state: TableClientState,
  envelope: unknown
): TableClientState {
  const parsed = TableSnapshotEnvelopeSchema.parse(envelope);

  if (isStaleSnapshot(state, parsed)) {
    return state;
  }

  return {
    lastSeq: parsed.seq ?? state.lastSeq,
    snapshot: parsed.payload,
    needsResync: false
  };
}

export function createHandReplay(events: readonly PublicReplayEvent[]): HandReplayState {
  const parsedEvents = PublicReplayEventSchema.array().parse(events);
  const sortedEvents = [...parsedEvents].sort((left, right) => left.seq - right.seq);
  const firstEvent = sortedEvents[0];

  if (firstEvent === undefined) {
    return replayState([], -1);
  }

  if (sortedEvents.some((event) => event.handId !== firstEvent.handId)) {
    throw new Error("Replay events must belong to the same hand");
  }

  return replayState(sortedEvents, 0);
}

export function stepHandReplay(
  state: HandReplayState,
  direction: "back" | "forward"
): HandReplayState {
  const nextIndex =
    direction === "forward"
      ? Math.min(state.index + 1, state.events.length - 1)
      : Math.max(state.index - 1, 0);

  return replayState(state.events, nextIndex);
}

export function getWebBootstrapStatus() {
  return {
    app: "web",
    framework: "nextjs-planned",
    clientAuthoritative: false
  } as const;
}

function toActionControlView(action: LegalAction): ActionControlView {
  switch (action.type) {
    case "Fold":
      return { type: "Fold", label: "Fold", action: { type: "Fold" } };
    case "Check":
      return { type: "Check", label: "Check", action: { type: "Check" } };
    case "Call":
      return {
        type: "Call",
        label: `Call ${action.amount}`,
        amount: action.amount,
        action: { type: "Call" }
      };
    case "AllIn":
      return {
        type: "AllIn",
        label: `All-in ${action.amount}`,
        amount: action.amount,
        action: { type: "AllIn" }
      };
    case "Bet":
      return {
        type: "Bet",
        label: `Bet ${action.min}`,
        min: action.min,
        max: action.max,
        defaultAmount: action.min,
        action: { type: "Bet", amount: action.min }
      };
    case "Raise":
      return {
        type: "Raise",
        label: `Raise ${action.min}`,
        min: action.min,
        max: action.max,
        defaultAmount: action.min,
        action: { type: "Raise", amount: action.min }
      };
  }
}

function isStaleSnapshot(
  state: TableClientState,
  envelope: TableSnapshotEnvelope
): boolean {
  return (
    envelope.seq !== undefined &&
    state.lastSeq !== null &&
    envelope.seq < state.lastSeq
  );
}

function replayState(events: PublicReplayEvent[], index: number): HandReplayState {
  const currentEvent = index >= 0 ? events[index] ?? null : null;
  const visibleEvents = index >= 0 ? events.slice(0, index + 1) : [];

  return {
    handId: events[0]?.handId ?? null,
    events,
    index,
    currentEvent,
    currentLabel: currentEvent === null ? null : replayEventLabel(currentEvent),
    board: visibleEvents.flatMap((event) =>
      event.eventType === "BoardCardsDealt" ? event.payload.cards.map(cardLabel) : []
    ),
    canStepBack: index > 0,
    canStepForward: index >= 0 && index < events.length - 1
  };
}

function replayEventLabel(event: PublicReplayEvent): string {
  switch (event.eventType) {
    case "HandStarted":
      return `Hand started, button seat ${event.payload.buttonSeat}`;
    case "BlindPosted":
      return `${event.payload.playerId} posted ${event.payload.amount}`;
    case "ActionRequested":
      return `${event.payload.playerId} to act`;
    case "PlayerActed":
      return `${event.payload.playerId} ${actionLabel(event.payload.action)}`;
    case "BoardCardsDealt":
      return `${event.payload.street} ${event.payload.cards.map(cardLabel).join(" ")}`;
    case "StreetAdvanced":
      return `${event.payload.street}`;
    case "ShowdownStarted":
      return "Showdown";
    case "HandEnded":
      return `Hand ended by ${event.payload.reason}`;
  }
}

function actionLabel(action: PokerAction): string {
  switch (action.type) {
    case "Fold":
      return "folded";
    case "Check":
      return "checked";
    case "Call":
      return "called";
    case "AllIn":
      return "went all-in";
    case "Bet":
      return `bet ${action.amount}`;
    case "Raise":
      return `raised to ${action.amount}`;
  }
}

function cardLabel(card: Card): string {
  return `${card.rank}${suitInitial(card.suit)}`;
}

function suitInitial(suit: Card["suit"]): string {
  switch (suit) {
    case "clubs":
      return "c";
    case "diamonds":
      return "d";
    case "hearts":
      return "h";
    case "spades":
      return "s";
  }
}
