import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // tools/quality holds the quality review's lifecycle regression checks.
    include: ["src/**/*.test.{ts,tsx}", "tools/quality/*.test.ts"],
  },
});
