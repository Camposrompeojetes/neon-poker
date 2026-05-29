import { ClientMessageSchema } from "@neon-poker/contracts";

export * from "./table-actor";
export * from "./drizzle-table-actor-store";
export * from "./runtime";

export function validateIncomingMessage(payload: unknown) {
  return ClientMessageSchema.parse(payload);
}

export function getApiBootstrapStatus() {
  return {
    app: "api",
    framework: "nestjs-planned",
    realtime: "socket-io-planned",
    persistence: "drizzle-runtime-ready",
    authoritativeServer: true
  } as const;
}
