import type { ClientMessage } from "@neon-poker/contracts";

export function createLobbySubscribeMessage(requestId: string): ClientMessage {
  return {
    type: "lobby.subscribe",
    requestId
  };
}

export function getWebBootstrapStatus() {
  return {
    app: "web",
    framework: "nextjs-planned",
    clientAuthoritative: false
  } as const;
}

