import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: "/src/" }],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
