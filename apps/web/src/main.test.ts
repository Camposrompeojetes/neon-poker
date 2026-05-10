import { describe, expect, it } from "vitest";

import { createLobbySubscribeMessage, getWebBootstrapStatus } from "./main";

describe("web bootstrap contract", () => {
  it("does not treat the client as authoritative", () => {
    expect(getWebBootstrapStatus().clientAuthoritative).toBe(false);
  });

  it("creates a typed lobby subscription intent", () => {
    expect(createLobbySubscribeMessage("req_123")).toEqual({
      type: "lobby.subscribe",
      requestId: "req_123"
    });
  });
});

