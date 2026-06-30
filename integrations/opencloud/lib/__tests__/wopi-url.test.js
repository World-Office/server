const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const ROOT = join(__dirname, "..")
const CONFIG_JS = join(ROOT, "config.js")
const OCIS_CONFIG_JS = join(ROOT, "ocis-config.js")
const COMPOSE_JS = join(ROOT, "compose.js")

describe("OpenCloud WOPI URL routing", () => {
  it("defines DOCUMENT_SERVER_PUBLIC_URL derived from DOCUMENT_SERVER_DOMAIN", () => {
    const src = readFileSync(CONFIG_JS, "utf8")
    assert.ok(
      src.includes("config.DOCUMENT_SERVER_PUBLIC_URL = `https://${config.DOCUMENT_SERVER_DOMAIN}`"),
      "expected DOCUMENT_SERVER_PUBLIC_URL derived from DOCUMENT_SERVER_DOMAIN",
    )
  })

  it("uses DOCUMENT_SERVER_PUBLIC_URL for the editor URL in web-ui.json", () => {
    const src = readFileSync(OCIS_CONFIG_JS, "utf8")
    assert.match(src, /url:\s*`\$\{config\.DOCUMENT_SERVER_PUBLIC_URL\}\/wopi`/)
  })

  it("uses DOCUMENT_SERVER_PUBLIC_URL for COLLABORATION_WOPI_SRC in ocis env", () => {
    const src = readFileSync(OCIS_CONFIG_JS, "utf8")
    assert.match(src, /COLLABORATION_WOPI_SRC:\s*config\.DOCUMENT_SERVER_PUBLIC_URL/)
  })

  it("uses DOCUMENT_SERVER_PUBLIC_URL for COLLABORATION_WOPI_SRC in docker compose", () => {
    const src = readFileSync(COMPOSE_JS, "utf8")
    assert.match(src, /`COLLABORATION_WOPI_SRC=\$\{config\.DOCUMENT_SERVER_PUBLIC_URL\}`/)
  })

  it("never uses OCIS_WOPI_SRC as the editor URL", () => {
    const ocisConfig = readFileSync(OCIS_CONFIG_JS, "utf8")
    const compose = readFileSync(COMPOSE_JS, "utf8")
    assert.doesNotMatch(ocisConfig, /url:\s*`\$\{config\.OCIS_WOPI_SRC\}\/wopi`/)
    assert.doesNotMatch(ocisConfig, /COLLABORATION_WOPI_SRC:\s*config\.OCIS_WOPI_SRC/)
    assert.doesNotMatch(compose, /COLLABORATION_WOPI_SRC=\$\{config\.OCIS_WOPI_SRC\}/)
  })
})
