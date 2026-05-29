import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  gameActionRequests,
  handParticipants,
  handEvents,
  hands,
  schema as dbSchema,
  tables,
  users
} from "@neon-poker/db";
import type { PersistableHandEvent, TableConfig } from "@neon-poker/poker-engine";

import type {
  StoredGameActionRequest,
  StoredHandParticipant,
  StoredHandReplay,
  TableActorStore
} from "./table-actor.js";

export type ApiDatabase = PostgresJsDatabase<typeof dbSchema>;
type ApiTransaction = Parameters<Parameters<ApiDatabase["transaction"]>[0]>[0];

export type ApiDatabaseConnection = {
  db: ApiDatabase;
  close: () => Promise<void>;
};

export type DrizzleTableActorStoreOptions = {
  db: ApiDatabase;
  tableId: string;
  tableName: string;
  config: TableConfig;
  clock?: () => Date;
  actionRequestIdFactory?: (record: StoredGameActionRequest) => string;
};

export function createApiDatabase(databaseUrl: string): ApiDatabase {
  return createApiDatabaseConnection(databaseUrl).db;
}

export function createApiDatabaseConnection(databaseUrl: string): ApiDatabaseConnection {
  const client = postgres(databaseUrl);
  return {
    db: drizzle(client, { schema: dbSchema }),
    close: () => client.end()
  };
}

export class DrizzleTableActorStore implements TableActorStore {
  private readonly db: ApiDatabase;
  private readonly tableId: string;
  private readonly tableName: string;
  private readonly config: TableConfig;
  private readonly clock: () => Date;
  private readonly actionRequestIdFactory: (record: StoredGameActionRequest) => string;

  constructor(options: DrizzleTableActorStoreOptions) {
    this.db = options.db;
    this.tableId = options.tableId;
    this.tableName = options.tableName;
    this.config = options.config;
    this.clock = options.clock ?? (() => new Date());
    this.actionRequestIdFactory =
      options.actionRequestIdFactory ?? defaultActionRequestId;
  }

  async appendHandEvents(records: readonly PersistableHandEvent[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    await this.db.transaction(async (transaction) => {
      await this.ensureTable(transaction);
      await this.ensureStartedHands(transaction, records);
      await transaction.insert(handEvents).values(records.map(toHandEventRow));
    });
  }

  async recordStartedHand(args: {
    participants: readonly StoredHandParticipant[];
    handEvents: readonly PersistableHandEvent[];
  }): Promise<void> {
    if (args.handEvents.length === 0) {
      return;
    }

    await this.db.transaction(async (transaction) => {
      await this.ensureTable(transaction);
      await this.ensureStartedHands(transaction, args.handEvents);

      for (const participant of args.participants) {
        await this.ensureUser(transaction, participant.playerId);
      }

      if (args.participants.length > 0) {
        await transaction
          .insert(handParticipants)
          .values(args.participants.map(toHandParticipantRow))
          .onConflictDoNothing();
      }

      await transaction.insert(handEvents).values(args.handEvents.map(toHandEventRow));
    });
  }

  async loadLatestHandReplay(): Promise<StoredHandReplay | null> {
    const [latestHand] = await this.db
      .select({ id: hands.id })
      .from(hands)
      .where(eq(hands.tableId, this.tableId))
      .orderBy(desc(hands.handNumber))
      .limit(1);

    if (latestHand === undefined) {
      return null;
    }

    const [participantRows, eventRows] = await Promise.all([
      this.db
        .select()
        .from(handParticipants)
        .where(eq(handParticipants.handId, latestHand.id))
        .orderBy(asc(handParticipants.seatIndex)),
      this.db
        .select()
        .from(handEvents)
        .where(eq(handEvents.handId, latestHand.id))
        .orderBy(asc(handEvents.seq))
    ]);

    if (participantRows.length === 0 || eventRows.length === 0) {
      return null;
    }

    return {
      handId: latestHand.id,
      participants: participantRows.map((participant) => ({
        handId: participant.handId,
        playerId: participant.userId,
        seatIndex: participant.seatIndex,
        startingStack: participant.startingStack
      })),
      handEvents: eventRows.map((event) => ({
        handId: event.handId,
        seq: event.seq,
        eventType: event.eventType,
        payload: event.payload,
        schemaVersion: event.schemaVersion,
        stateHashAfter: event.stateHashAfter
      }))
    };
  }

  async findGameActionRequest(args: {
    tableId: string;
    playerId: string;
    idempotencyKey: string;
  }): Promise<StoredGameActionRequest | null> {
    const [record] = await this.db
      .select()
      .from(gameActionRequests)
      .where(
        and(
          eq(gameActionRequests.tableId, args.tableId),
          eq(gameActionRequests.userId, args.playerId),
          eq(gameActionRequests.idempotencyKey, args.idempotencyKey)
        )
      )
      .limit(1);

    if (record === undefined) {
      return null;
    }

    return {
      tableId: record.tableId,
      handId: record.handId,
      playerId: record.userId,
      expectedSeq: record.expectedSeq,
      idempotencyKey: record.idempotencyKey,
      requestHash: record.requestHash,
      status: record.status,
      firstEventSeq: record.firstEventSeq,
      lastEventSeq: record.lastEventSeq,
      rejectionCode: record.rejectionCode,
      createdAt: record.createdAt
    };
  }

  async recordAcceptedGameAction(
    record: StoredGameActionRequest,
    records: readonly PersistableHandEvent[]
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await this.ensureTable(transaction);
      await this.ensureStartedHands(transaction, records);

      if (records.length > 0) {
        await transaction.insert(handEvents).values(records.map(toHandEventRow));
      }

      await this.ensureUser(transaction, record.playerId);
      await transaction.insert(gameActionRequests).values(
        toGameActionRequestRow(
          record,
          this.actionRequestIdFactory(record),
          this.clock()
        )
      );
    });
  }

  async recordRejectedGameAction(record: StoredGameActionRequest): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await this.ensureTable(transaction);
      await this.ensureUser(transaction, record.playerId);
      await transaction.insert(gameActionRequests).values(
        toGameActionRequestRow(
          record,
          this.actionRequestIdFactory(record),
          this.clock()
        )
      );
    });
  }

  private async ensureTable(transaction: ApiTransaction): Promise<void> {
    await transaction
      .insert(tables)
      .values({
        id: this.tableId,
        name: this.tableName,
        maxSeats: this.config.maxSeats,
        smallBlind: this.config.smallBlind,
        bigBlind: this.config.bigBlind,
        startingStack: this.config.startingStack
      })
      .onConflictDoNothing();
  }

  private async ensureStartedHands(
    transaction: ApiTransaction,
    records: readonly PersistableHandEvent[]
  ): Promise<void> {
    for (const record of records) {
      if (record.eventType !== "HandStarted") {
        continue;
      }

      const [existingHand] = await transaction
        .select({ id: hands.id })
        .from(hands)
        .where(eq(hands.id, record.handId))
        .limit(1);

      if (existingHand !== undefined) {
        continue;
      }

      const [latestHand] = await transaction
        .select({ handNumber: hands.handNumber })
        .from(hands)
        .where(eq(hands.tableId, this.tableId))
        .orderBy(desc(hands.handNumber))
        .limit(1);

      await transaction.insert(hands).values({
        id: record.handId,
        tableId: this.tableId,
        handNumber: (latestHand?.handNumber ?? 0) + 1,
        buttonSeat: getNumberPayloadField(record, "buttonSeat"),
        schemaVersion: record.schemaVersion
      });
    }
  }

  private async ensureUser(transaction: ApiTransaction, userId: string): Promise<void> {
    await transaction
      .insert(users)
      .values({
        id: userId,
        username: userId,
        displayName: userId,
        passwordHash: "local-dev-placeholder"
      })
      .onConflictDoNothing();
  }
}

function toHandEventRow(record: PersistableHandEvent) {
  return {
    handId: record.handId,
    seq: record.seq,
    eventType: record.eventType,
    payload: record.payload,
    schemaVersion: record.schemaVersion,
    stateHashAfter: record.stateHashAfter
  };
}

function toHandParticipantRow(record: StoredHandParticipant) {
  return {
    handId: record.handId,
    userId: record.playerId,
    seatIndex: record.seatIndex,
    startingStack: record.startingStack
  };
}

function toGameActionRequestRow(
  record: StoredGameActionRequest,
  id: string,
  completedAt: Date
) {
  return {
    id,
    tableId: record.tableId,
    handId: record.handId,
    userId: record.playerId,
    expectedSeq: record.expectedSeq,
    idempotencyKey: record.idempotencyKey,
    requestHash: record.requestHash,
    status: record.status,
    firstEventSeq: record.firstEventSeq,
    lastEventSeq: record.lastEventSeq,
    rejectionCode: record.rejectionCode,
    createdAt: record.createdAt,
    completedAt
  };
}

function getNumberPayloadField(record: PersistableHandEvent, key: string): number {
  const value = record.payload[key];

  if (typeof value !== "number") {
    throw new Error(`Expected numeric ${key} in ${record.eventType} payload`);
  }

  return value;
}

function defaultActionRequestId(record: StoredGameActionRequest): string {
  return `gar_${fnv1a64(
    `${record.tableId}:${record.playerId}:${record.idempotencyKey}`
  )}`;
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
