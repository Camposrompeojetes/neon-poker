import { sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export type JsonObject = Record<string, unknown>;

export const tableStatusEnum = pgEnum("table_status", [
  "waiting",
  "active",
  "paused",
  "closed"
]);

export const handStatusEnum = pgEnum("hand_status", [
  "running",
  "ended",
  "voided"
]);

export const actionRequestStatusEnum = pgEnum("game_action_request_status", [
  "accepted",
  "rejected"
]);

export const virtualChipLedgerReasonEnum = pgEnum("virtual_chip_ledger_reason", [
  "initial_grant",
  "table_buy_in",
  "table_cash_out",
  "hand_win",
  "hand_loss",
  "admin_adjustment"
]);

function createdAtColumn() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

function updatedAtColumn() {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn()
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_email_unique").on(table.email)
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAtColumn()
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt)
  ]
);

export const tables = pgTable(
  "tables",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: tableStatusEnum("status").notNull().default("waiting"),
    maxSeats: integer("max_seats").notNull(),
    smallBlind: integer("small_blind").notNull(),
    bigBlind: integer("big_blind").notNull(),
    startingStack: integer("starting_stack").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn()
  },
  (table) => [
    index("tables_status_idx").on(table.status),
    check("tables_max_seats_check", sql`${table.maxSeats} in (2, 6)`),
    check("tables_blinds_positive_check", sql`${table.smallBlind} > 0 and ${table.bigBlind} > 0`),
    check("tables_starting_stack_positive_check", sql`${table.startingStack} > 0`)
  ]
);

export const hands = pgTable(
  "hands",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "restrict" }),
    handNumber: integer("hand_number").notNull(),
    status: handStatusEnum("status").notNull().default("running"),
    buttonSeat: integer("button_seat").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    finalStateHash: text("final_state_hash"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("hands_table_id_hand_number_unique").on(table.tableId, table.handNumber),
    index("hands_table_id_idx").on(table.tableId),
    index("hands_status_idx").on(table.status),
    check("hands_hand_number_positive_check", sql`${table.handNumber} > 0`),
    check("hands_button_seat_check", sql`${table.buttonSeat} >= 0`)
  ]
);

export const handEvents = pgTable(
  "hand_events",
  {
    handId: text("hand_id")
      .notNull()
      .references(() => hands.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull(),
    schemaVersion: integer("schema_version").notNull(),
    stateHashAfter: text("state_hash_after").notNull(),
    createdAt: createdAtColumn()
  },
  (table) => [
    primaryKey({
      name: "hand_events_hand_id_seq_pk",
      columns: [table.handId, table.seq]
    }),
    index("hand_events_hand_id_idx").on(table.handId),
    index("hand_events_event_type_idx").on(table.eventType),
    check("hand_events_seq_nonnegative_check", sql`${table.seq} >= 0`),
    check("hand_events_schema_version_positive_check", sql`${table.schemaVersion} > 0`)
  ]
);

export const handParticipants = pgTable(
  "hand_participants",
  {
    handId: text("hand_id")
      .notNull()
      .references(() => hands.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    seatIndex: integer("seat_index").notNull(),
    startingStack: integer("starting_stack").notNull(),
    endingStack: integer("ending_stack"),
    netChips: integer("net_chips"),
    createdAt: createdAtColumn()
  },
  (table) => [
    primaryKey({
      name: "hand_participants_hand_id_user_id_pk",
      columns: [table.handId, table.userId]
    }),
    uniqueIndex("hand_participants_hand_id_seat_index_unique").on(
      table.handId,
      table.seatIndex
    ),
    index("hand_participants_user_id_idx").on(table.userId),
    check("hand_participants_seat_index_check", sql`${table.seatIndex} >= 0`),
    check("hand_participants_starting_stack_check", sql`${table.startingStack} >= 0`)
  ]
);

export const gameActionRequests = pgTable(
  "game_action_requests",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "restrict" }),
    handId: text("hand_id")
      .notNull()
      .references(() => hands.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expectedSeq: integer("expected_seq").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: actionRequestStatusEnum("status").notNull(),
    firstEventSeq: integer("first_event_seq"),
    lastEventSeq: integer("last_event_seq"),
    rejectionCode: text("rejection_code"),
    createdAt: createdAtColumn(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("game_action_requests_idempotency_unique").on(
      table.tableId,
      table.userId,
      table.idempotencyKey
    ),
    index("game_action_requests_hand_id_idx").on(table.handId),
    check("game_action_requests_expected_seq_check", sql`${table.expectedSeq} >= 0`)
  ]
);

export const virtualChipAccounts = pgTable("virtual_chip_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  version: integer("version").notNull().default(0),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn()
});

export const virtualChipLedger = pgTable(
  "virtual_chip_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tableId: text("table_id").references(() => tables.id, { onDelete: "set null" }),
    handId: text("hand_id").references(() => hands.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: virtualChipLedgerReasonEnum("reason").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAtColumn()
  },
  (table) => [
    uniqueIndex("virtual_chip_ledger_idempotency_unique").on(table.idempotencyKey),
    index("virtual_chip_ledger_user_id_idx").on(table.userId),
    index("virtual_chip_ledger_hand_id_idx").on(table.handId)
  ]
);

export const schema = {
  users,
  sessions,
  tables,
  hands,
  handEvents,
  handParticipants,
  gameActionRequests,
  virtualChipAccounts,
  virtualChipLedger
};

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;
export type Table = InferSelectModel<typeof tables>;
export type NewTable = InferInsertModel<typeof tables>;
export type Hand = InferSelectModel<typeof hands>;
export type NewHand = InferInsertModel<typeof hands>;
export type HandEvent = InferSelectModel<typeof handEvents>;
export type NewHandEvent = InferInsertModel<typeof handEvents>;
export type HandParticipant = InferSelectModel<typeof handParticipants>;
export type NewHandParticipant = InferInsertModel<typeof handParticipants>;
export type GameActionRequest = InferSelectModel<typeof gameActionRequests>;
export type NewGameActionRequest = InferInsertModel<typeof gameActionRequests>;
export type VirtualChipAccount = InferSelectModel<typeof virtualChipAccounts>;
export type NewVirtualChipAccount = InferInsertModel<typeof virtualChipAccounts>;
export type VirtualChipLedgerEntry = InferSelectModel<typeof virtualChipLedger>;
export type NewVirtualChipLedgerEntry = InferInsertModel<typeof virtualChipLedger>;
