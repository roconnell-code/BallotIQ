import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { newsApiPlugin } from "./server/news.js";

export default defineConfig({
  plugins: [newsApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        future: fileURLToPath(new URL("./future.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 41731,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 41731,
    strictPort: true,
    allowedHosts: true,
  },
});
