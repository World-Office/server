#!/usr/bin/env node

// ── create-wo-plugin: Plugin Scaffold CLI ────────────────────────────────
// Usage: npx create-wo-plugin my-plugin-name
// Prompts for additional metadata and scaffolds a new plugin project.

import * as readline from "node:readline/promises"
import * as process from "node:process"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : ""
  const answer = await rl.question(`${question}${suffix}: `)
  return answer.trim() || defaultValue || ""
}

async function main() {
  const pluginNameArg = process.argv[2]

  console.log("\n  🧩  create-wo-plugin - World Office Plugin Scaffolder\n")

  const name = pluginNameArg || (await prompt("Plugin name (kebab-case)", "my-plugin"))
  const description = await prompt("Description", "A World Office plugin")
  const author = await prompt("Author", "")
  const license = await prompt("License", "MIT")

  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")

  const pluginDir = `${process.cwd()}/${id}`

  try {
    const { createPluginManifest, scaffoldPlugin } = await import("@world-office/plugin-sdk")

    const manifest = createPluginManifest({
      id,
      name,
      version: "1.0.0",
      description,
      author: author || undefined,
      license,
    })

    scaffoldPlugin(manifest, pluginDir)
  } catch (err) {
    console.error("\n  ❌ Failed to scaffold plugin. Make sure @world-office/plugin-sdk is installed.")
    console.error(`  ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => rl.close())
