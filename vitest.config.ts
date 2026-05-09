// vitest.config.ts
// Uses vitest installed in em-campaign-studio (no local install needed)
// Run: /home/ubuntu/em-campaign-studio/node_modules/.bin/vitest run --config vitest.config.ts
import { defineConfig } from "/home/ubuntu/em-campaign-studio/node_modules/vitest/dist/config.js";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
