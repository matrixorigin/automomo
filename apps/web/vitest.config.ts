import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    fileParallelism: false,
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname
    }
  }
})
