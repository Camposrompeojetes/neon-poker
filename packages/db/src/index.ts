export const MVP_TABLES = [
  "users",
  "sessions",
  "tables",
  "hands",
  "hand_events",
  "hand_participants",
  "game_action_requests",
  "virtual_chip_accounts",
  "virtual_chip_ledger"
] as const;

export type MvpTableName = (typeof MVP_TABLES)[number];

export function isRequiredMvpTable(tableName: string): tableName is MvpTableName {
  return MVP_TABLES.includes(tableName as MvpTableName);
}

export * from "./schema";
