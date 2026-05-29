import { randomBytes } from "node:crypto";

import {
  HEADS_UP_TABLE_CONFIG,
  type EngineDeps,
  type TableConfig
} from "@neon-poker/poker-engine";

import {
  createApiDatabaseConnection,
  DrizzleTableActorStore,
  type ApiDatabase,
  type ApiDatabaseConnection
} from "./drizzle-table-actor-store";
import { TableActor, type TableActorStore } from "./table-actor";

export type ApiRuntimeEnv = {
  DATABASE_URL?: string;
  NEON_POKER_TABLE_ID?: string;
  NEON_POKER_TABLE_NAME?: string;
};

export type ApiRuntimeOptions = {
  env?: ApiRuntimeEnv;
  databaseUrl?: string;
  db?: ApiDatabase;
  store?: TableActorStore;
  tableId?: string;
  tableName?: string;
  config?: TableConfig;
  engineDeps?: EngineDeps;
  clock?: () => Date;
  createDatabaseConnection?: (databaseUrl: string) => ApiDatabaseConnection;
};

export type ApiRuntime = {
  actor: TableActor;
  store: TableActorStore;
  db: ApiDatabase | null;
  tableId: string;
  tableName: string;
  config: TableConfig;
  close: () => Promise<void>;
};

const DEFAULT_TABLE_ID = "table_1";
const DEFAULT_TABLE_NAME = "Neon Poker Heads-Up 1";

export function createApiRuntime(options: ApiRuntimeOptions = {}): ApiRuntime {
  const env = options.env ?? process.env;
  const config = options.config ?? HEADS_UP_TABLE_CONFIG;
  const tableId = nonEmpty(options.tableId ?? env.NEON_POKER_TABLE_ID, DEFAULT_TABLE_ID);
  const tableName = nonEmpty(
    options.tableName ?? env.NEON_POKER_TABLE_NAME,
    DEFAULT_TABLE_NAME
  );
  const clock = options.clock;
  let db = options.db ?? null;
  let close = async () => {};
  let store = options.store;

  if (store === undefined) {
    if (db === null) {
      const databaseUrl = requireDatabaseUrl(options.databaseUrl ?? env.DATABASE_URL);
      const connectionFactory =
        options.createDatabaseConnection ?? createApiDatabaseConnection;
      const connection = connectionFactory(databaseUrl);

      db = connection.db;
      close = connection.close;
    }

    store = new DrizzleTableActorStore({
      db,
      tableId,
      tableName,
      config,
      ...(clock === undefined ? {} : { clock })
    });
  }

  const actor = new TableActor({
    tableId,
    config,
    engineDeps: options.engineDeps ?? createRuntimeEngineDeps(),
    store,
    ...(clock === undefined ? {} : { clock })
  });

  return {
    actor,
    store,
    db,
    tableId,
    tableName,
    config,
    close
  };
}

export function createRuntimeEngineDeps(): EngineDeps {
  return {
    rng: cryptoRng
  };
}

function requireDatabaseUrl(databaseUrl: string | undefined): string {
  const value = databaseUrl?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error("DATABASE_URL is required to create the Drizzle table actor store");
  }

  return value;
}

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

function cryptoRng(): number {
  const sample = randomBytes(6).readUIntBE(0, 6);
  return sample / 281_474_976_710_656;
}
