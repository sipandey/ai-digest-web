import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./lib/__tests__/setup.ts"],
    include: ["lib/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirror the @/* alias from tsconfig.json so imports in source
      // files resolve correctly during tests.
      "@": resolve(__dirname, "."),
    },
  },
});
