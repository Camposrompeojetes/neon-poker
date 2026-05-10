import { z } from "zod";

const IdSchema = z.string().min(1);
const RequestIdSchema = z.string().min(1);
const SequenceSchema = z.number().int().nonnegative();
const PositiveAmountSchema = z.number().int().positive();
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const PokerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Fold") }).strict(),
  z.object({ type: z.literal("Check") }).strict(),
  z.object({ type: z.literal("Call") }).strict(),
  z.object({ type: z.literal("Bet"), amount: PositiveAmountSchema }).strict(),
  z.object({ type: z.literal("Raise"), amount: PositiveAmountSchema }).strict(),
  z.object({ type: z.literal("AllIn") }).strict()
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

export type PokerAction = z.infer<typeof PokerActionSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type GameActionMessage = z.infer<typeof GameActionMessageSchema>;
export type HandEvent = z.infer<typeof HandEventSchema>;
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;

