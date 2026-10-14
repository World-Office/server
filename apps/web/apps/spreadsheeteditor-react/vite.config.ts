import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// Workspace packages ship their TypeScript source (`exports.import:
// "./src/index.ts"`), so Rollup resolves *their* bare imports (react, i18next,
// mobx, …) from `<workspace-package>/src/**` upward. A filtered
// `pnpm install --filter @world-office/spreadsheeteditor` links those packages
// but does not create `<workspace-package>/node_modules`, so every one of those
// imports resolves to nothing and the build dies on the first one it meets
// ("Rollup failed to resolve import \"i18next\" …"). This app already declares
// each of those dependencies itself, so re-resolve a bare specifier against the
// app's own package (i.e. its node_modules) whenever the normal resolver,
// rooted at the importing workspace package, cannot resolve it at all.
const workspaceSourceFallback = (): Plugin => {
	const appEntry = path.resolve(__dirname, "package.json")
	return {
		name: "wo-workspace-source-fallback",
		async resolveId(source, importer) {
			if (
				!importer ||
				importer.includes("\0") ||
				importer.includes("/node_modules/") ||
				source.startsWith(".") ||
				source.startsWith("@/") ||
				path.isAbsolute(source)
			) {
				return null
			}
			// Let the default resolver (and every other plugin) try first — the
			// fallback is only for imports it cannot resolve at all.
			if (await this.resolve(source, importer, { skipSelf: true })) return null
			return this.resolve(source, appEntry, { skipSelf: true })
		},
	}
}

export default defineConfig({
	base: "/sheet/",
	plugins: [react(), workspaceSourceFallback()],
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
