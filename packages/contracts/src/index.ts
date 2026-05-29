import { z } from "zod";

const IdSchema = z.string().min(1);
const RequestIdSchema = z.string().min(1);
const SequenceSchema = z.number().int().nonnegative();
const PositiveAmountSchema = z.number().int().positive();
const NonnegativeAmountSchema = z.number().int().nonnegative();
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const RankSchema = z.enum([
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A"
]);

export const SuitSchema = z.enum(["clubs", "diamonds", "hearts", "spades"]);

export const CardSchema = z
  .object({
    rank: RankSchema,
    suit: SuitSchema
  })
  .strict();

export const PlayerStatusSchema = z.enum(["empty", "seated", "inHand", "folded", "allIn"]);

export const StreetSchema = z.enum([
  "waiting",
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
  "ended"
]);

export const HandCategorySchema = z.enum([
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush"
]);

export const HandRankSchema = z
  .object({
    category: HandCategorySchema,
    categoryValue: NonnegativeAmountSchema,
    ranks: z.array(NonnegativeAmountSchema).readonly()
  })
  .strict();

export const PokerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Fold") }).strict(),
  z.object({ type: z.literal("Check") }).strict(),
  z.object({ type: z.literal("Call") }).strict(),
  z.object({ type: z.literal("Bet"), amount: PositiveAmountSchema }).strict(),
  z.object({ type: z.literal("Raise"), amount: PositiveAmountSchema }).strict(),
  z.object({ type: z.literal("AllIn") }).strict()
]);

export const LegalActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Fold") }).strict(),
  z.object({ type: z.literal("Check") }).strict(),
  z.object({ type: z.literal("Call"), amount: PositiveAmountSchema }).strict(),
  z
    .object({
      type: z.literal("Bet"),
      min: PositiveAmountSchema,
      max: PositiveAmountSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("Raise"),
      min: PositiveAmountSchema,
      max: PositiveAmountSchema
    })
    .strict(),
  z.object({ type: z.literal("AllIn"), amount: PositiveAmountSchema }).strict()
]);

export const LobbySubscribeMessageSchema = z
  .object({
    type: z.literal("lobby.subscribe"),
    requestId: RequestIdSchema
  })
  .strict();

export const TableJoinMessageSchema = z
  .object({
    type: z.literal("table.join"),
    requestId: RequestIdSchema,
    tableId: IdSchema
  })
  .strict();

export const TableSitDownMessageSchema = z
  .object({
    type: z.literal("table.sitDown"),
    requestId: RequestIdSchema,
    tableId: IdSchema,
    seatIndex: SequenceSchema
  })
  .strict();

export const GameActionMessageSchema = z
  .object({
    type: z.literal("game.action"),
    requestId: RequestIdSchema,
    tableId: IdSchema,
    playerId: IdSchema,
    expectedSeq: SequenceSchema,
    idempotencyKey: z.string().min(12),
    action: PokerActionSchema
  })
  .strict();

export const ClientMessageSchema = z.discriminatedUnion("type", [
  LobbySubscribeMessageSchema,
  TableJoinMessageSchema,
  TableSitDownMessageSchema,
  GameActionMessageSchema
]);

export const HandEventSchema = z
  .object({
    handId: IdSchema,
    seq: SequenceSchema,
    eventType: z.string().min(1),
    payload: JsonObjectSchema,
    schemaVersion: z.number().int().positive(),
    stateHashAfter: z.string().min(16)
  })
  .strict();

export const WinnerSchema = z
  .object({
    playerId: IdSchema,
    amount: NonnegativeAmountSchema,
    handRank: HandRankSchema.nullable()
  })
  .strict();

export const PublicSeatViewSchema = z
  .object({
    seatIndex: SequenceSchema,
    playerId: IdSchema.nullable(),
    stack: NonnegativeAmountSchema,
    status: PlayerStatusSchema,
    holeCardCount: SequenceSchema
  })
  .strict();

export const PlayerSeatViewSchema = PublicSeatViewSchema.extend({
  holeCards: z.array(CardSchema).readonly()
}).strict();

export const PublicHandSnapshotSchema = z
  .object({
    handId: IdSchema,
    buttonSeat: SequenceSchema,
    board: z.array(CardSchema).readonly(),
    street: StreetSchema,
    pot: NonnegativeAmountSchema,
    currentBet: NonnegativeAmountSchema,
    activePlayerId: IdSchema.nullable(),
    nextSeq: SequenceSchema,
    handComplete: z.boolean(),
    winners: z.array(WinnerSchema).readonly()
  })
  .strict();

export const PlayerHandSnapshotSchema = PublicHandSnapshotSchema.extend({
  legalActions: z.array(LegalActionSchema).readonly()
}).strict();

export const PublicTableSnapshotSchema = z
  .object({
    tableId: IdSchema,
    seats: z.array(PublicSeatViewSchema).readonly(),
    hand: PublicHandSnapshotSchema.nullable()
  })
  .strict();

export const PlayerTableSnapshotSchema = z
  .object({
    tableId: IdSchema,
    seats: z.array(PlayerSeatViewSchema).readonly(),
    hand: PlayerHandSnapshotSchema.nullable()
  })
  .strict();

const PublicReplayEventBaseSchema = z.object({
  handId: IdSchema,
  seq: SequenceSchema,
  schemaVersion: z.number().int().positive()
});

const BoardStreetSchema = z.enum(["flop", "turn", "river"]);

export const PublicReplayEventSchema = z.discriminatedUnion("eventType", [
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("HandStarted"),
    payload: z.object({ buttonSeat: SequenceSchema }).strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("BlindPosted"),
    payload: z
      .object({
        playerId: IdSchema,
        amount: PositiveAmountSchema
      })
      .strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("ActionRequested"),
    payload: z.object({ playerId: IdSchema }).strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("PlayerActed"),
    payload: z
      .object({
        playerId: IdSchema,
        action: PokerActionSchema
      })
      .strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("BoardCardsDealt"),
    payload: z
      .object({
        street: BoardStreetSchema,
        cards: z.array(CardSchema).readonly()
      })
      .strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("StreetAdvanced"),
    payload: z.object({ street: StreetSchema }).strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("ShowdownStarted"),
    payload: z.object({}).strict()
  }).strict(),
  PublicReplayEventBaseSchema.extend({
    eventType: z.literal("HandEnded"),
    payload: z
      .object({
        winners: z.array(WinnerSchema).readonly(),
        reason: z.enum(["fold", "showdown"])
      })
      .strict()
  }).strict()
]);

export const ServerEnvelopeSchema = z
  .object({
    type: z.enum([
      "lobby.snapshot",
      "lobby.patch",
      "table.snapshot",
      "game.actionRequired",
      "game.actionAccepted",
      "game.actionRejected",
      "table.event",
      "game.resyncRequired"
    ]),
    seq: SequenceSchema.optional(),
    payload: JsonObjectSchema
  })
  .strict();

export const TableSnapshotEnvelopeSchema = z
  .object({
    type: z.literal("table.snapshot"),
    seq: SequenceSchema.optional(),
    payload: PlayerTableSnapshotSchema
  })
  .strict();

export type Rank = z.infer<typeof RankSchema>;
export type Suit = z.infer<typeof SuitSchema>;
export type Card = z.infer<typeof CardSchema>;
export type PlayerStatus = z.infer<typeof PlayerStatusSchema>;
export type Street = z.infer<typeof StreetSchema>;
export type HandRank = z.infer<typeof HandRankSchema>;
export type PokerAction = z.infer<typeof PokerActionSchema>;
export type LegalAction = z.infer<typeof LegalActionSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type GameActionMessage = z.infer<typeof GameActionMessageSchema>;
export type TableSitDownMessage = z.infer<typeof TableSitDownMessageSchema>;
export type HandEvent = z.infer<typeof HandEventSchema>;
export type PublicTableSnapshot = z.infer<typeof PublicTableSnapshotSchema>;
export type PlayerTableSnapshot = z.infer<typeof PlayerTableSnapshotSchema>;
export type PublicReplayEvent = z.infer<typeof PublicReplayEventSchema>;
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;
export type TableSnapshotEnvelope = z.infer<typeof TableSnapshotEnvelopeSchema>;
