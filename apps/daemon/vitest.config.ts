import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false
  },
  resolve: {
    alias: {
      "@": new URL("../web", import.meta.url).pathname
    }
  }
});
