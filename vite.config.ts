import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  server: {
    port: 5174,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5175 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
