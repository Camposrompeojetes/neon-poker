import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@neon-poker/config": fileURLToPath(
        new URL("./packages/config/src/index.ts", import.meta.url)
      ),
      "@neon-poker/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@neon-poker/db": fileURLToPath(
        new URL("./packages/db/src/index.ts", import.meta.url)
      ),
      "@neon-poker/poker-engine": fileURLToPath(
        new URL("./packages/poker-engine/src/index.ts", import.meta.url)
      ),
      "@neon-poker/test-utils": fileURLToPath(
        new URL("./packages/test-utils/src/index.ts", import.meta.url)
      ),
      "@neon-poker/ui": fileURLToPath(
        new URL("./packages/ui/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["src/**/*.test.ts", "apps/**/*.test.ts", "packages/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  }
});
