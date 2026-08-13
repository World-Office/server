import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "/word/",
  plugins: [react()],
  test: {
    // Only run this app's own tests. WASM contract tests (apply-op) require
    // a browser runtime (wasm-pack / browser), not node vitest — see AGENTS.md.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["src/__tests__/apply-op.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Deduplicate React across all workspace packages.
    // pnpm may create separate copies in nested node_modules;
    // this forces Rollup to use a single instance.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "mobx", "mobx-react-lite"],
  },
  define: {
    "import.meta.env.VITE_WOPI_HOST_URL": JSON.stringify(
      process.env.VITE_WOPI_HOST_URL || "https://cloud.graphwiz.ai",
    ),
    // NOTE: names must match collaboration-config.ts (VITE_COAUTHORING_*).
    // Set to placeholder localhost when no coauthoring service is deployed;
    // App.tsx skips rendering DocumentCollaborationProvider in that case.
    "import.meta.env.VITE_COAUTHORING_WS_URL": JSON.stringify(
      process.env.VITE_COAUTHORING_WS_URL || "ws://localhost:8004/ws/{session_id}",
    ),
    "import.meta.env.VITE_COAUTHORING_API_URL": JSON.stringify(
      process.env.VITE_COAUTHORING_API_URL || "http://localhost:8004",
    ),
    "import.meta.env.VITE_WO_TIPTAP": JSON.stringify(process.env.WO_TIPTAP === "1"),
  },
  server: {
    port: 3006,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      external: ["@world-office/wo-renderer-wasm/pkg/wo_renderer_wasm.js"],
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco"
          if (id.includes("node_modules")) return "vendor"
        },
      },
    },
  },
})
