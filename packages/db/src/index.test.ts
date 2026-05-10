import { describe, expect, it } from "vitest";

import { MVP_TABLES, isRequiredMvpTable } from "./index";

describe("db foundation", () => {
  it("tracks append-only hand event storage as required MVP schema", () => {
    expect(MVP_TABLES).toContain("hand_events");
    expect(isRequiredMvpTable("hand_events")).toBe(true);
  });
});

