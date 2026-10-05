import { defineConfig } from "vite";
import { newsApiPlugin } from "./server/news.js";

export default defineConfig({
  plugins: [newsApiPlugin()],
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
