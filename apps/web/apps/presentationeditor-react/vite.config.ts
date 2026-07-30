import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/slide/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "mobx", "mobx-react-lite"],
  },
  server: {
    port: 3005,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco"
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/mobx") ||
            id.includes("node_modules/scheduler") ||
            id.includes("node_modules/use-sync-external-store")
          )
            return "vendor"
          if (id.includes("node_modules")) return "deps"
        },
      },
    },
  },
})
