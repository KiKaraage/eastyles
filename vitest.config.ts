import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        resources: "usable",
        runScripts: "dangerously",
      },
    },
    setupFiles: ["./test/setup.ts"],
    globals: true,
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
