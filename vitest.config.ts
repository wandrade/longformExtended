import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "test/mocks/obsidian.ts"),
    },
  },
  test: {
    setupFiles: ["./test/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
