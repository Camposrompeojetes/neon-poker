import { randomUUID } from "node:crypto";

import {
  ClientMessageSchema,
  type ClientMessage,
  type GameActionMessage,
  type PlayerTableSnapshot,
  type ServerEnvelope
} from "@neon-poker/contracts";

import type { TableActor } from "./table-actor.js";

export type MessageAuthContext = {
  playerId: string;
};

export type ApiMessageRouterOptions = {
  actor: TableActor;
  tableId: string;
  handIdFactory?: () => string;
};

export class ApiMessageRouter {
  private readonly actor: TableActor;
  private readonly tableId: string;
  private readonly handIdFactory: () => string;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: ApiMessageRouterOptions) {
    this.actor = options.actor;
    this.tableId = options.tableId;
    this.handIdFactory = options.handIdFactory ?? (() => `hand_${randomUUID()}`);
  }

  async handle(rawMessage: unknown, auth: MessageAuthContext): Promise<ServerEnvelope[]> {
    const message = ClientMessageSchema.parse(rawMessage);
    return this.enqueue(() => this.handleValidated(message, auth));
  }

  private async handleValidated(
    message: ClientMessage,
    auth: MessageAuthContext
  ): Promise<ServerEnvelope[]> {
    assertAuthenticated(auth);

    switch (message.type) {
      case "lobby.subscribe":
        return [
          envelope("lobby.snapshot", {
            requestId: message.requestId,
            tables: [this.actor.publicSnapshot()]
          })
        ];
      case "table.join":
        this.assertTable(message.tableId);
        return [
          tableSnapshotEnvelope(
            message.requestId,
            this.actor.joinTable(auth.playerId)
          )
        ];
      case "table.sitDown":
        this.assertTable(message.tableId);
        this.actor.sitDown({
          playerId: auth.playerId,
          seatIndex: message.seatIndex
        });
        await this.startHandIfReady();
        return [
          tableSnapshotEnvelope(
            message.requestId,
            this.actor.snapshotForPlayer(auth.playerId)
          )
        ];
      case "game.action":
        this.assertTable(message.tableId);
        return this.handleGameAction(message, auth);
    }
  }

  private async handleGameAction(
    message: GameActionMessage,
    auth: MessageAuthContext
  ): Promise<ServerEnvelope[]> {
    const result = await this.actor.handleGameAction(auth.playerId, message);

    if (result.ok) {
      return [
        envelope("game.actionAccepted", {
          requestId: message.requestId,
          duplicate: result.duplicate,
          persistedEvents: result.persistedEvents
        }),
        tableSnapshotEnvelope(message.requestId, result.snapshot)
      ];
    }

    return [
      envelope("game.actionRejected", {
        requestId: message.requestId,
        duplicate: result.duplicate,
        code: result.code,
        message: result.message
      }),
      tableSnapshotEnvelope(message.requestId, result.snapshot)
    ];
  }

  private async startHandIfReady(): Promise<void> {
    const snapshot = this.actor.publicSnapshot();
    const occupiedSeats = snapshot.seats.filter(
      (seat) => seat.playerId !== null && seat.stack > 0
    );

    if (occupiedSeats.length !== 2) {
      return;
    }

    if (snapshot.hand !== null && !snapshot.hand.handComplete) {
      return;
    }

    const buttonSeat = occupiedSeats[0]?.seatIndex;

    if (buttonSeat === undefined) {
      throw new Error("Unable to determine button seat");
    }

    await this.actor.startHand({
      handId: this.handIdFactory(),
      buttonSeat
    });
  }

  private assertTable(tableId: string): void {
    if (tableId !== this.tableId) {
      throw new Error(`Unknown table: ${tableId}`);
    }
  }

  private async enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function assertAuthenticated(auth: MessageAuthContext): void {
  if (auth.playerId.trim().length === 0) {
    throw new Error("Authenticated player is required");
  }
}

function tableSnapshotEnvelope(
  requestId: string,
  snapshot: PlayerTableSnapshot
): ServerEnvelope {
  return envelope("table.snapshot", {
    requestId,
    ...snapshot
  });
}

function envelope(
  type: ServerEnvelope["type"],
  payload: Record<string, unknown>
): ServerEnvelope {
  return {
    type,
    payload
  };
}
