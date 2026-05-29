import { describe, expect, it } from "vitest";

import type { ApiDatabase } from "./drizzle-table-actor-store";
import { DrizzleTableActorStore } from "./drizzle-table-actor-store";
import { InMemoryTableActorStore } from "./table-actor";
import { createApiRuntime, createRuntimeEngineDeps } from "./runtime";

describe("api runtime composition", () => {
  it("keeps tests able to inject an in-memory actor store", () => {
    const store = new InMemoryTableActorStore();
    const runtime = createApiRuntime({
      env: {},
      store,
      tableId: "table_test",
      engineDeps: createRuntimeEngineDeps()
    });

    const snapshot = runtime.actor.sitDown({ playerId: "alice", seatIndex: 0 });

    expect(runtime.store).toBe(store);
    expect(runtime.db).toBeNull();
    expect(snapshot.seats[0]?.playerId).toBe("alice");
  });

  it("wires DrizzleTableActorStore for the real API runtime", () => {
    const db = {} as ApiDatabase;
    const runtime = createApiRuntime({
      env: {},
      db,
      tableId: "table_runtime",
      tableName: "Runtime HU",
      engineDeps: createRuntimeEngineDeps()
    });

    expect(runtime.db).toBe(db);
    expect(runtime.tableId).toBe("table_runtime");
    expect(runtime.tableName).toBe("Runtime HU");
    expect(runtime.store).toBeInstanceOf(DrizzleTableActorStore);
  });

  it("requires DATABASE_URL when no store or database is injected", () => {
    expect(() => createApiRuntime({ env: {} })).toThrow("DATABASE_URL");
  });
});
