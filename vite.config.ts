import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/chat": "http://localhost:3847",
      "/capture": "http://localhost:3847",
      "/projects": "http://localhost:3847",
      "/tasks": "http://localhost:3847",
      "/reminders": "http://localhost:3847",
      "/watch": "http://localhost:3847",
      "/updates": "http://localhost:3847",
      "/messages": "http://localhost:3847",
      "/brief": "http://localhost:3847",
      "/email": "http://localhost:3847",
      "/telegram": "http://localhost:3847",
      "/health": "http://localhost:3847",
    },
  },
});
