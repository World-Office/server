import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/word/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_WOPI_HOST_URL": JSON.stringify(
      process.env.VITE_WOPI_HOST_URL || "https://cloud.graphwiz.ai",
    ),
    "import.meta.env.VITE_COLLABORATION_WS_URL": JSON.stringify(
      process.env.VITE_COLLABORATION_WS_URL || "wss://cloud.graphwiz.ai",
    ),
    "import.meta.env.VITE_COLLABORATION_HTTP_URL": JSON.stringify(
      process.env.VITE_COLLABORATION_HTTP_URL || "https://cloud.graphwiz.ai",
    ),
  },
  server: {
    port: 3006,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
})
