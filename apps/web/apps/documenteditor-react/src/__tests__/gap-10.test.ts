// @vitest-environment jsdom
/**
 * PF-GAP-10 — Parity fill: References — Link
 * covers OO golden labels: ["Links", "Link"]
 * Tests that the References tab contains a Links group with a Link button
 */
import { describe, expect, it } from "vitest"
import { wordRibbonSpec } from "../lib/word-ribbon-spec"

function getReferencesTab() {
  return wordRibbonSpec.tabs.find((tab) => tab.id === "references")
}

function getLinksGroup() {
  return getReferencesTab()?.groups.find((group) => group.id === "links")
}

describe("PF-GAP-10: References tab — Links group and Link button", () => {
  it("References tab exists", () => {
    const referencesTab = getReferencesTab()
    expect(referencesTab).toBeDefined()
    expect(referencesTab?.label).toContain("References")
  })

  it("References tab has Links group", () => {
    const linksGroup = getLinksGroup()
    expect(linksGroup).toBeDefined()
    expect(linksGroup?.label).toBe("Links")
  })

  it("Links group contains Link button with label 'Link'", () => {
    const linksGroup = getLinksGroup()
    expect(linksGroup).toBeDefined()

    const linkControl = linksGroup?.controls.find((control) => control.id === "insert-link")
    expect(linkControl).toBeDefined()
    expect(linkControl?.label).toBe("Link")
    expect(linkControl?.type).toBe("button")
    expect(linkControl?.command).toBe("link")
  })

  it("Link button has Globe icon", () => {
    const linksGroup = getLinksGroup()
    expect(linksGroup).toBeDefined()

    const linkControl = linksGroup?.controls.find((control) => control.id === "insert-link")
    expect(linkControl).toBeDefined()
    expect(linkControl?.icon).toBe("Globe")
  })

  it("Link button has Ctrl+K shortcut", () => {
    const linksGroup = getLinksGroup()
    expect(linksGroup).toBeDefined()

    const linkControl = linksGroup?.controls.find((control) => control.id === "insert-link")
    expect(linkControl).toBeDefined()
    expect(linkControl?.shortcut).toBe("Ctrl+K")
  })

  it("Links group contains all required labels", () => {
    const linksGroup = getLinksGroup()
    expect(linksGroup).toBeDefined()

    const controls = linksGroup?.controls || []
    const labels = controls.map((c) => c.label)

    expect(labels).toContain("Link")
  })
})
