import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/sheet/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "mobx", "mobx-react-lite"],
  },
  server: {
    port: 3007,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco"
          if (id.includes("@univerjs")) return "univer"
          if (id.includes("node_modules")) return "vendor"
        },
      },
    },
  },
})
