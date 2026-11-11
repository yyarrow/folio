import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["web/**", "node_modules/**"],
  },
});
