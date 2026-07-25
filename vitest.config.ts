// vitest.config.ts
import path from "path";

const config = {
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
};

export default config;
