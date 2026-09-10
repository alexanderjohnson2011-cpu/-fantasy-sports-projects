import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    alias: [
      { find: "./Prototype", replacement: fileURLToPath(new URL("./src/JohnnysPrototype.tsx", import.meta.url)) },
    ],
  },
  build: {
    outDir: "dist/johnnys-jerks",
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
  plugins: [react()],
});
