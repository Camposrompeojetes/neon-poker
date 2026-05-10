import process from "node:process";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://neon_poker:neon_poker@localhost:5432/neon_poker"
  },
  strict: true,
  verbose: true
});
