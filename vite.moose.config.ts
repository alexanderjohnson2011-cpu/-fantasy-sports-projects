import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    alias: [{ find: "./Prototype", replacement: fileURLToPath(new URL("./src/MoosePrototype.tsx", import.meta.url)) }],
  },
  build: { outDir: "dist/client" },
  server: { host: "127.0.0.1" },
  plugins: [react()],
});
