import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/diagram/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3003,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco"
          if (id.includes("node_modules/react") || id.includes("node_modules/mobx") || id.includes("node_modules/scheduler")) return "vendor"
          if (id.includes("node_modules")) return "deps"
        },
      },
    },
  },
})
