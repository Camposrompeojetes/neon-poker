import type { GameActionMessage } from "@neon-poker/contracts";
import {
  type DomainEvent,
  type EngineDeps,
  type GameState,
  HEADS_UP_TABLE_CONFIG,
  type HandDomainEvent,
  type PersistableHandEvent,
  type PlayerTableView,
  type PublicTableView,
  type TableConfig,
  applyEvent,
  applyEvents,
  createInitialState,
  decide,
  materializeHandEvents,
  stateHash,
  toPlayerTableView,
  toPublicTableView,
  toSpectatorView
} from "@neon-poker/poker-engine";

export type StoredGameActionRequest = {
  tableId: string;
  handId: string;
  playerId: string;
  expectedSeq: number;
  idempotencyKey: string;
  requestHash: string;
  status: "accepted" | "rejected";
  firstEventSeq: number | null;
  lastEventSeq: number | null;
  rejectionCode: string | null;
  createdAt: Date;
};

export type StoredHandParticipant = {
  handId: string;
  playerId: string;
  seatIndex: number;
  startingStack: number;
};

export type StoredHandReplay = {
  handId: string;
  participants: readonly StoredHandParticipant[];
  handEvents: readonly PersistableHandEvent[];
};

export type TableActorStore = {
  appendHandEvents(records: readonly PersistableHandEvent[]): Promise<void>;
  recordStartedHand(args: {
    participants: readonly StoredHandParticipant[];
    handEvents: readonly PersistableHandEvent[];
  }): Promise<void>;
  loadLatestHandReplay?(): Promise<StoredHandReplay | null>;
  loadHandEvents?(handId: string): Promise<readonly PersistableHandEvent[]>;
  findGameActionRequest(args: {
    tableId: string;
    playerId: string;
    idempotencyKey: string;
  }): Promise<StoredGameActionRequest | null>;
  recordAcceptedGameAction(
    record: StoredGameActionRequest,
    handEvents: readonly PersistableHandEvent[]
  ): Promise<void>;
  recordRejectedGameAction(record: StoredGameActionRequest): Promise<void>;
};

export type ActorSuccess = {
  ok: true;
  duplicate: boolean;
  snapshot: PlayerTableView;
  persistedEvents: number;
};

export type ActorFailure = {
  ok: false;
  duplicate: boolean;
  code: string;
  message: string;
  snapshot: PlayerTableView;
};

export type ActorResult = ActorSuccess | ActorFailure;

export type TableActorOptions = {
  tableId: string;
  config?: TableConfig;
  engineDeps: EngineDeps;
  store: TableActorStore;
  clock?: () => Date;
  initialState?: GameState;
};

export class InMemoryTableActorStore implements TableActorStore {
  readonly handEvents: PersistableHandEvent[] = [];
  readonly handParticipants: StoredHandParticipant[] = [];
  readonly gameActionRequests: StoredGameActionRequest[] = [];

  async appendHandEvents(records: readonly PersistableHandEvent[]): Promise<void> {
    for (const record of records) {
      const alreadyExists = this.handEvents.some(
        (candidate) => candidate.handId === record.handId && candidate.seq === record.seq
      );

      if (alreadyExists) {
        throw new Error(`Duplicate hand event ${record.handId}#${record.seq}`);
      }
    }

    this.handEvents.push(...records.map((record) => clone(record)));
  }

  async recordStartedHand(args: {
    participants: readonly StoredHandParticipant[];
    handEvents: readonly PersistableHandEvent[];
  }): Promise<void> {
    await this.appendHandEvents(args.handEvents);
    this.handParticipants.push(...args.participants.map((participant) => clone(participant)));
  }

  async loadLatestHandReplay(): Promise<StoredHandReplay | null> {
    const latestHandId = this.handEvents.at(-1)?.handId;

    if (latestHandId === undefined) {
      return null;
    }

    const handEvents = this.handEvents.filter((event) => event.handId === latestHandId);
    const participants = this.handParticipants.filter(
      (participant) => participant.handId === latestHandId
    );

    if (handEvents.length === 0 || participants.length === 0) {
      return null;
    }

    return {
      handId: latestHandId,
      participants: participants.map((participant) => clone(participant)),
      handEvents: handEvents.map((event) => clone(event))
    };
  }

  async loadHandEvents(handId: string): Promise<readonly PersistableHandEvent[]> {
    return this.handEvents
      .filter((event) => event.handId === handId)
      .map((event) => clone(event));
  }

  async findGameActionRequest(args: {
    tableId: string;
    playerId: string;
    idempotencyKey: string;
  }): Promise<StoredGameActionRequest | null> {
    return (
      this.gameActionRequests.find(
        (record) =>
          record.tableId === args.tableId &&
          record.playerId === args.playerId &&
          record.idempotencyKey === args.idempotencyKey
      ) ?? null
    );
  }

  async recordAcceptedGameAction(
    record: StoredGameActionRequest,
    handEvents: readonly PersistableHandEvent[]
  ): Promise<void> {
    await this.appendHandEvents(handEvents);
    await this.saveGameActionRequest(record);
  }

  async recordRejectedGameAction(record: StoredGameActionRequest): Promise<void> {
    await this.saveGameActionRequest(record);
  }

  private async saveGameActionRequest(record: StoredGameActionRequest): Promise<void> {
    const existing = await this.findGameActionRequest({
      tableId: record.tableId,
      playerId: record.playerId,
      idempotencyKey: record.idempotencyKey
    });

    if (existing !== null) {
      throw new Error("Game action request already exists");
    }

    this.gameActionRequests.push(clone(record));
  }
}

export class TableActor {
  private state: GameState;
  private readonly tableId: string;
  private readonly engineDeps: EngineDeps;
  private readonly store: TableActorStore;
  private readonly clock: () => Date;

  constructor(options: TableActorOptions) {
    this.tableId = options.tableId;
    this.engineDeps = options.engineDeps;
    this.store = options.store;
    this.clock = options.clock ?? (() => new Date());
    this.state =
      options.initialState ??
      createInitialState(options.tableId, options.config ?? HEADS_UP_TABLE_CONFIG);
  }

  joinTable(playerId: string): PlayerTableView {
    return this.snapshotForPlayer(playerId);
  }

  sitDown(args: { playerId: string; seatIndex: number; stack?: number }): PlayerTableView {
    const command =
      args.stack === undefined
        ? { type: "SeatPlayer" as const, playerId: args.playerId, seatIndex: args.seatIndex }
        : {
            type: "SeatPlayer" as const,
            playerId: args.playerId,
            seatIndex: args.seatIndex,
            stack: args.stack
          };

    this.applyDomainEvents(decide(this.state, command, this.engineDeps));
    return this.snapshotForPlayer(args.playerId);
  }

  async startHand(args: { handId: string; buttonSeat?: number }): Promise<PublicTableView> {
    const before = this.state;
    const command =
      args.buttonSeat === undefined
        ? { type: "StartHand" as const, handId: args.handId }
        : { type: "StartHand" as const, handId: args.handId, buttonSeat: args.buttonSeat };
    const events = decide(before, command, this.engineDeps);
    const handEvents = materializeHandEvents(before, events);

    await this.store.recordStartedHand({
      participants: handParticipantsFromState(before, args.handId),
      handEvents
    });
    this.applyDomainEvents(events);

    return this.publicSnapshot();
  }

  async handleGameAction(
    authenticatedPlayerId: string,
    message: GameActionMessage
  ): Promise<ActorResult> {
    if (message.tableId !== this.tableId) {
      return this.rejectWithoutRecording(authenticatedPlayerId, "table_mismatch", message);
    }

    if (message.playerId !== authenticatedPlayerId) {
      return this.rejectWithoutRecording(
        authenticatedPlayerId,
        "authenticated_player_mismatch",
        message
      );
    }

    const activeHandId = this.state.hand?.handId;

    if (activeHandId === undefined || this.state.hand?.handComplete === true) {
      return this.rejectWithoutRecording(authenticatedPlayerId, "no_active_hand", message);
    }

    const requestHash = hashRequest({
      tableId: message.tableId,
      handId: activeHandId,
      playerId: authenticatedPlayerId,
      expectedSeq: message.expectedSeq,
      action: message.action
    });
    const existing = await this.store.findGameActionRequest({
      tableId: this.tableId,
      playerId: authenticatedPlayerId,
      idempotencyKey: message.idempotencyKey
    });

    if (existing !== null) {
      if (existing.requestHash !== requestHash) {
        return this.failure(
          authenticatedPlayerId,
          "idempotency_key_reused",
          "Idempotency key was already used for a different action",
          true
        );
      }

      if (existing.status === "accepted") {
        return {
          ok: true,
          duplicate: true,
          snapshot: this.snapshotForPlayer(authenticatedPlayerId),
          persistedEvents:
            existing.firstEventSeq === null || existing.lastEventSeq === null
              ? 0
              : existing.lastEventSeq - existing.firstEventSeq + 1
        };
      }

      return this.failure(
        authenticatedPlayerId,
        existing.rejectionCode ?? "rejected",
        "Duplicate rejected action",
        true
      );
    }

    const before = this.state;
    let events: DomainEvent[];

    try {
      events = decide(
        before,
        {
          type: "PlayerAction",
          playerId: authenticatedPlayerId,
          expectedSeq: message.expectedSeq,
          idempotencyKey: message.idempotencyKey,
          action: message.action
        },
        this.engineDeps
      );
    } catch (error) {
      const code = errorCodeFromUnknown(error);

      await this.store.recordRejectedGameAction({
        tableId: this.tableId,
        handId: activeHandId,
        playerId: authenticatedPlayerId,
        expectedSeq: message.expectedSeq,
        idempotencyKey: message.idempotencyKey,
        requestHash,
        status: "rejected",
        firstEventSeq: null,
        lastEventSeq: null,
        rejectionCode: code,
        createdAt: this.clock()
      });

      return this.failure(
        authenticatedPlayerId,
        code,
        error instanceof Error ? error.message : "Action rejected",
        false
      );
    }

    const handEvents = materializeHandEvents(before, events);
    const eventSeqs = handEvents.map((event) => event.seq);

    await this.store.recordAcceptedGameAction(
      {
        tableId: this.tableId,
        handId: activeHandId,
        playerId: authenticatedPlayerId,
        expectedSeq: message.expectedSeq,
        idempotencyKey: message.idempotencyKey,
        requestHash,
        status: "accepted",
        firstEventSeq: eventSeqs[0] ?? null,
        lastEventSeq: eventSeqs[eventSeqs.length - 1] ?? null,
        rejectionCode: null,
        createdAt: this.clock()
      },
      handEvents
    );
    this.applyDomainEvents(events);

    return {
      ok: true,
      duplicate: false,
      snapshot: this.snapshotForPlayer(authenticatedPlayerId),
      persistedEvents: handEvents.length
    };
  }

  snapshotForPlayer(playerId: string): PlayerTableView {
    return toPlayerTableView(this.state, playerId);
  }

  spectatorSnapshot(): PublicTableView {
    return toSpectatorView(this.state);
  }

  publicSnapshot(): PublicTableView {
    return toPublicTableView(this.state);
  }

  internalStateForTests(): GameState {
    return clone(this.state);
  }

  private applyDomainEvents(events: readonly DomainEvent[]): void {
    this.state = applyEvents(this.state, events);
  }

  private rejectWithoutRecording(
    playerId: string,
    code: string,
    message: GameActionMessage
  ): ActorFailure {
    return this.failure(
      playerId,
      code,
      `Rejected ${message.type} for ${message.tableId}`,
      false
    );
  }

  private failure(
    playerId: string,
    code: string,
    message: string,
    duplicate: boolean
  ): ActorFailure {
    return {
      ok: false,
      duplicate,
      code,
      message,
      snapshot: this.snapshotForPlayer(playerId)
    };
  }
}

export function restoreStateFromHandReplay(
  tableId: string,
  config: TableConfig,
  replay: StoredHandReplay
): GameState {
  let state = createInitialState(tableId, config);

  for (const participant of replay.participants) {
    state = applyEvent(state, {
      type: "PlayerSeated",
      playerId: participant.playerId,
      seatIndex: participant.seatIndex,
      stack: participant.startingStack
    });
  }

  for (const record of replay.handEvents) {
    const event = handEventFromRecord(record);
    state = applyEvent(state, event);

    if (stateHash(state) !== record.stateHashAfter) {
      throw new Error(`State hash mismatch while restoring ${record.handId}#${record.seq}`);
    }
  }

  return state;
}

function handParticipantsFromState(
  state: GameState,
  handId: string
): StoredHandParticipant[] {
  return state.seats
    .filter((seat) => seat.playerId !== null && seat.stack > 0)
    .map((seat) => {
      if (seat.playerId === null) {
        throw new Error("Expected seated player");
      }

      return {
        handId,
        playerId: seat.playerId,
        seatIndex: seat.seatIndex,
        startingStack: seat.stack
      };
    });
}

function handEventFromRecord(record: PersistableHandEvent): HandDomainEvent {
  const payload = record.payload;
  const base = {
    handId: record.handId,
    seq: record.seq
  };

  switch (record.eventType) {
    case "HandStarted":
    case "PrivateCardsDealt":
    case "BlindPosted":
    case "ActionRequested":
    case "PlayerActed":
    case "BoardCardsDealt":
    case "CardBurned":
    case "StreetAdvanced":
    case "ShowdownStarted":
    case "HandEnded":
      return {
        ...base,
        type: record.eventType,
        ...payload
      } as HandDomainEvent;
    default:
      throw new Error(`Unsupported hand event type: ${record.eventType}`);
  }
}

function errorCodeFromUnknown(error: unknown): string {
  if (!(error instanceof Error)) {
    return "action_rejected";
  }

  if (error.message.includes("expectedSeq")) {
    return "expected_seq_mismatch";
  }

  if (error.message.includes("turn")) {
    return "not_players_turn";
  }

  if (error.message.includes("legal")) {
    return "illegal_action";
  }

  return "action_rejected";
}

function hashRequest(value: unknown): string {
  return fnv1a64(stableStringify(value));
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
