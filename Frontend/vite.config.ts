import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) {
              return "charts";
            }

            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/react-table")) {
              return "tanstack";
            }

            if (id.includes("framer-motion")) {
              return "motion";
            }

            if (id.includes("socket.io-client")) {
              return "realtime";
            }

            if (
              id.includes("react-dom") ||
              id.includes("react/") ||
              id.includes("scheduler/")
            ) {
              return "react-vendor";
            }

            if (id.includes("lucide")) {
              return "icons";
            }

            return "vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
