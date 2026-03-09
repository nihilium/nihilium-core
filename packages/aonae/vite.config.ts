import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    dts({ include: ["src"] }),
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "Aonae",
      formats: ["es", "cjs"],
      fileName: (format) => format === "es" ? "index.js" : "index.cjs",
    },
    rollupOptions: {
      external: ["circomlibjs", "argon2-browser", "@noble/hashes", "@noble/hashes/sha256"],
    },
    target: "esnext",
  },
});
