import * as fs from "node:fs"
import * as path from "node:path"
import type { PluginManifest } from "./types"

/**
 * Scaffold a new plugin project in the specified output directory.
 * Creates the directory structure, source files, and configuration.
 */
export function scaffoldPlugin(manifest: PluginManifest, outputDir: string): void {
  const outPath = path.resolve(outputDir)
  const srcDir = path.join(outPath, "src")
  fs.mkdirSync(srcDir, { recursive: true })

  fs.writeFileSync(path.join(srcDir, "index.ts"), generatePluginSource(manifest), "utf-8")
  fs.writeFileSync(path.join(outPath, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8")
  fs.writeFileSync(path.join(outPath, "package.json"), JSON.stringify(generatePackageJson(manifest), null, 2), "utf-8")
  fs.writeFileSync(path.join(outPath, "tsconfig.json"), JSON.stringify(generateTsConfig(), null, 2), "utf-8")
  fs.writeFileSync(path.join(outPath, "README.md"), generateReadme(manifest), "utf-8")

  const relPath = path.relative(process.cwd(), outPath)
  console.log(`\n  ✅ Plugin "${manifest.name}" scaffolded at ${outPath}`)
  console.log(`\n  Next steps:`)
  console.log(`    cd ${relPath}`)
  console.log(`    npm install`)
  console.log(`    npm run build`)
  console.log(`    Then load the plugin in World Office via the Plugin Manager.\n`)
}

function generatePluginSource(manifest: PluginManifest): string {
  return `import type { WorldOfficePlugin, PluginContext } from "@world-office/plugin-sdk"

const plugin: WorldOfficePlugin = {
  id: "${manifest.id}",
  name: "${manifest.name}",
  version: "${manifest.version}",${manifest.description ? `\n  description: "${manifest.description}",` : ""}
  init(ctx: PluginContext) {
    ctx.toolbar.registerButton({
      id: "${manifest.id}-btn",
      label: "${manifest.name}",
      icon: "${manifest.icon ?? "puzzle"}",
      onClick: () => {
        console.log("${manifest.name} clicked")
      },
    })

    ctx.menu.registerItem({
      id: "${manifest.id}-menu",
      label: "${manifest.name}",
      menuPath: "tools",
      onClick: () => {
        console.log("${manifest.name} menu clicked")
      },
    })

    ctx.panel.registerPanel({
      id: "${manifest.id}-panel",
      title: "${manifest.name}",
      position: "right",
      render(container: HTMLElement) {
        container.innerHTML = \`<div style="padding: 16px">
          <h3>${manifest.name}</h3>
          <p>Your plugin content goes here.</p>
        </div>\`
      },
    })

    console.log("[${manifest.id}] Plugin initialized")
  },

  destroy() {
    console.log("[${manifest.id}] Plugin destroyed")
  },
}

export default plugin
`
}

function generatePackageJson(manifest: PluginManifest): Record<string, unknown> {
  return {
    name: manifest.id,
    version: manifest.version,
    description: manifest.description ?? `${manifest.name} plugin for World Office`,
    main: manifest.main ?? "src/index.ts",
    types: manifest.main?.replace(/\.ts$/, ".d.ts") ?? "src/index.d.ts",
    license: manifest.license ?? "MIT",
    scripts: {
      build: "tsc",
      dev: "tsc --watch",
    },
    dependencies: {
      "@world-office/plugin-sdk": "^0.1.0",
    },
    devDependencies: {
      typescript: "^5.7.0",
    },
  }
}

function generateTsConfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src"],
  }
}

function generateReadme(manifest: PluginManifest): string {
  return `# ${manifest.name}

${manifest.description ?? `A World Office plugin.`}

## Installation

1. Build the plugin:
   \`\`\`sh
   npm run build
   \`\`\`

2. Open World Office and go to **Plugin Manager**.
3. Click **Load Plugin** and select the \`dist/index.js\` file.

## Development

\`\`\`sh
npm run dev    # Watch mode
npm run build  # Production build
\`\`\`

## License

${manifest.license ?? "MIT"}
`
}
