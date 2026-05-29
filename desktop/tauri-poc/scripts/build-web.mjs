import { execSync } from "node:child_process"
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "../../..")
const webDist = resolve(root, "apps/web/apps/documenteditor-react/dist")
const target = resolve(__dirname, "../dist")

console.log("Building React document editor...")
execSync("pnpm --filter @world-office/documenteditor build", {
  cwd: root,
  stdio: "inherit",
})

if (!existsSync(webDist)) {
  console.error("Build output not found at", webDist)
  process.exit(1)
}

if (existsSync(target)) {
  rmSync(target, { recursive: true })
}
mkdirSync(target, { recursive: true })

cpSync(webDist, target, { recursive: true })
cpSync(resolve(__dirname, "../settings.html"), resolve(target, "settings.html"))
console.log("Copied build output to", target)
console.log("Copied settings.html to dist")
