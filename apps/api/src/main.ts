import { ClientMessageSchema } from "@neon-poker/contracts";
import { pathToFileURL } from "node:url";

export * from "./table-actor.js";
export * from "./drizzle-table-actor-store.js";
export * from "./runtime.js";
export * from "./message-router.js";
export * from "./http-server.js";

export function validateIncomingMessage(payload: unknown) {
  return ClientMessageSchema.parse(payload);
}

export function getApiBootstrapStatus() {
  return {
    app: "api",
    framework: "nestjs-planned",
    realtime: "socket-io-planned",
    http: "node-http-ready",
    persistence: "drizzle-runtime-ready",
    authoritativeServer: true
  } as const;
}

if (isMainModule()) {
  const { startRestoredApiHttpServer } = await import("./http-server.js");
  const started = await startRestoredApiHttpServer();

  process.on("SIGINT", () => {
    void started.close().finally(() => {
      process.exit(0);
    });
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
