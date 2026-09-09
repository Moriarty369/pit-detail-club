import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig(({ mode }) => ({
  root: resolve(mode === "admin" ? "cloud/admin" : "cloud/client"),
  publicDir: resolve("public"),
  plugins: [react()],
  build: {
    outDir: resolve(mode === "admin" ? "dist-cloud-admin" : "dist-cloud"),
    emptyOutDir: true,
    modulePreload: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
}));
