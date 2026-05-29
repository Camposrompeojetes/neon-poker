import {
  PublicReplayEventSchema,
  type PublicReplayEvent
} from "@neon-poker/contracts";
import type { PersistableHandEvent } from "@neon-poker/poker-engine";

import type { TableActorStore } from "./table-actor.js";

const PUBLIC_REPLAY_EVENT_TYPES = new Set([
  "HandStarted",
  "BlindPosted",
  "ActionRequested",
  "PlayerActed",
  "BoardCardsDealt",
  "StreetAdvanced",
  "ShowdownStarted",
  "HandEnded"
]);

export async function loadPublicHandReplay(args: {
  store: TableActorStore;
  handId: string;
}): Promise<PublicReplayEvent[]> {
  if (args.store.loadHandEvents === undefined) {
    throw new Error("Hand history is not available for this table store");
  }

  const events = await args.store.loadHandEvents(args.handId);
  return toPublicReplayEvents(events);
}

export function toPublicReplayEvents(
  records: readonly PersistableHandEvent[]
): PublicReplayEvent[] {
  return records
    .filter((record) => PUBLIC_REPLAY_EVENT_TYPES.has(record.eventType))
    .map(toPublicReplayEvent);
}

function toPublicReplayEvent(record: PersistableHandEvent): PublicReplayEvent {
  const payload = publicPayload(record);
  const event = {
    handId: record.handId,
    seq: record.seq,
    eventType: record.eventType,
    schemaVersion: record.schemaVersion,
    payload
  };

  return PublicReplayEventSchema.parse(event);
}

function publicPayload(record: PersistableHandEvent): Record<string, unknown> {
  switch (record.eventType) {
    case "HandStarted":
      return pick(record.payload, ["buttonSeat"]);
    case "BlindPosted":
      return pick(record.payload, ["playerId", "amount"]);
    case "ActionRequested":
      return pick(record.payload, ["playerId"]);
    case "PlayerActed":
      return pick(record.payload, ["playerId", "action"]);
    case "BoardCardsDealt":
      return pick(record.payload, ["street", "cards"]);
    case "StreetAdvanced":
      return pick(record.payload, ["street"]);
    case "ShowdownStarted":
      return {};
    case "HandEnded":
      return pick(record.payload, ["winners", "reason"]);
    default:
      throw new Error(`Event is not public replayable: ${record.eventType}`);
  }
}

function pick(
  source: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => key in source)
      .map((key) => [key, source[key]])
  );
}
