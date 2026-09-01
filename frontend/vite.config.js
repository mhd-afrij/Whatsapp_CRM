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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (id.includes("react-dom") || id.includes("react/jsx-runtime") || id.endsWith("/react/index.js") || id.includes("\\react\\") || id.includes("/react/")) {
            return "react-vendor";
          }

          if (id.includes("@tanstack")) {
            return "tanstack";
          }

          if (id.includes("lucide-react")) {
            return "icons";
          }

          if (
            id.includes("recharts") ||
            id.includes("framer-motion") ||
            id.includes("socket.io-client") ||
            id.includes("react-qr-code")
          ) {
            return "ui-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
