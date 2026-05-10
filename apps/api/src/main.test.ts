import { describe, expect, it } from "vitest";

import { getApiBootstrapStatus, validateIncomingMessage } from "./main";

describe("api bootstrap contract", () => {
  it("keeps the server authoritative", () => {
    expect(getApiBootstrapStatus().authoritativeServer).toBe(true);
  });

  it("validates incoming client messages through shared contracts", () => {
    const message = validateIncomingMessage({
      type: "lobby.subscribe",
      requestId: "req_123"
    });

    expect(message.type).toBe("lobby.subscribe");
  });
});

