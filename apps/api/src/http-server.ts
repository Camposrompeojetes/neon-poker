import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { ServerEnvelope } from "@neon-poker/contracts";

import { ApiMessageRouter } from "./message-router.js";
import { createApiRuntime, type ApiRuntime, type ApiRuntimeOptions } from "./runtime.js";

export type ApiHttpServerOptions = {
  runtime: ApiRuntime;
  router?: ApiMessageRouter;
};

export type StartedApiHttpServer = {
  runtime: ApiRuntime;
  server: Server;
  close: () => Promise<void>;
};

const MAX_BODY_BYTES = 64 * 1024;

export function createApiHttpServer(options: ApiHttpServerOptions): Server {
  const router =
    options.router ??
    new ApiMessageRouter({
      actor: options.runtime.actor,
      tableId: options.runtime.tableId
    });

  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, options.runtime, router);
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Bad request"
      });
    }
  });
}

export function startApiHttpServer(
  options: ApiRuntimeOptions & { port?: number } = {}
): StartedApiHttpServer {
  const runtime = createApiRuntime(options);
  const server = createApiHttpServer({ runtime });
  const port = options.port ?? Number(process.env.API_PORT ?? 4000);

  server.listen(port);

  return {
    runtime,
    server,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }

          reject(error);
        });
      });
      await runtime.close();
    }
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: ApiRuntime,
  router: ApiMessageRouter
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      tableId: runtime.tableId
    });
    return;
  }

  if (request.method === "GET" && url.pathname === `/tables/${runtime.tableId}/snapshot`) {
    const playerId = url.searchParams.get("playerId")?.trim();

    if (playerId === undefined || playerId.length === 0) {
      throw new Error("playerId query parameter is required");
    }

    sendJson(response, 200, {
      type: "table.snapshot",
      payload: runtime.actor.snapshotForPlayer(playerId)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/messages") {
    const playerId = getHeader(request, "x-player-id");
    const body = await readJsonBody(request);
    const envelopes = await router.handle(body, { playerId });

    sendJson(response, 200, {
      envelopes
    });
    return;
  }

  sendJson(response, 404, {
    error: "Not found"
  });
}

function getHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  const text = Array.isArray(value) ? value[0] : value;

  if (text === undefined || text.trim().length === 0) {
    throw new Error(`${name} header is required`);
  }

  return text;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body is too large");
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (rawBody.trim().length === 0) {
    throw new Error("Request body is required");
  }

  return JSON.parse(rawBody);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: { envelopes?: ServerEnvelope[]; [key: string]: unknown }
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}
