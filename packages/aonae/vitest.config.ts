import { defineConfig } from "vitest/config";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  resolve: {
    alias: {
      // argon2-browser uses emscripten WASM that cannot load via URL in Node.js v24+.
      // Replace with a lightweight HMAC-SHA256 mock for test environments.
      "argon2-browser": path.resolve(__dirname, "test/mocks/argon2-browser.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 60000,
  },
});
