// @vitest-environment jsdom
/**
 * PF-GAP-6 — Parity fill: View — Headings, Multiple Pages, Dark
 * covers ONLYOFFICE golden labels: ["Headings", "Multiple Pages", "Dark Document"]
 * Tests that the View tab's Show group contains checkboxes for Headings, Multiple Pages, and Dark Document
 */
import { describe, expect, it } from "vitest"
import { wordRibbonSpec } from "../lib/word-ribbon-spec"

describe("PF-GAP-6: View tab Show group checkboxes", () => {
  it("has a View tab", () => {
    const viewTab = wordRibbonSpec.tabs.find((tab) => tab.id === "view")
    expect(viewTab).toBeDefined()
    expect(viewTab?.label).toContain("View")
  })

  it("View tab has a Show group", () => {
    const viewTab = wordRibbonSpec.tabs.find((tab) => tab.id === "view")
    expect(viewTab).toBeDefined()
    
    const showGroup = viewTab?.groups.find((group) => group.id === "show")
    expect(showGroup).toBeDefined()
    expect(showGroup?.label).toBe("Show")
  })

  it("Show group contains a Headings checkbox", () => {
    const viewTab = wordRibbonSpec.tabs.find((tab) => tab.id === "view")
    expect(viewTab).toBeDefined()
    
    const showGroup = viewTab?.groups.find((group) => group.id === "show")
    expect(showGroup).toBeDefined()
    
    const headingsCheckbox = showGroup?.controls.find(
      (control) => control.id === "headings" && control.type === "checkbox",
    )
    expect(headingsCheckbox).toBeDefined()
    expect(headingsCheckbox?.label).toBe("Headings")
    expect(headingsCheckbox?.command).toBe("toggleNavigation")
  })

  it("Show group contains a Multiple Pages checkbox", () => {
    const viewTab = wordRibbonSpec.tabs.find((tab) => tab.id === "view")
    expect(viewTab).toBeDefined()
    
    const showGroup = viewTab?.groups.find((group) => group.id === "show")
    expect(showGroup).toBeDefined()
    
    const multiplePagesCheckbox = showGroup?.controls.find(
      (control) => control.id === "multiple-pages-checkbox" && control.type === "checkbox",
    )
    expect(multiplePagesCheckbox).toBeDefined()
    expect(multiplePagesCheckbox?.label).toBe("Multiple pages")
    expect(multiplePagesCheckbox?.command).toBe("toggleMultiplePages")
  })

  it("Show group contains a Dark Document checkbox", () => {
    const viewTab = wordRibbonSpec.tabs.find((tab) => tab.id === "view")
    expect(viewTab).toBeDefined()
    
    const showGroup = viewTab?.groups.find((group) => group.id === "show")
    expect(showGroup).toBeDefined()
    
    const darkDocumentCheckbox = showGroup?.controls.find(
      (control) => control.id === "dark-document" && control.type === "checkbox",
    )
    expect(darkDocumentCheckbox).toBeDefined()
    expect(darkDocumentCheckbox?.label).toBe("Dark Document")
    expect(darkDocumentCheckbox?.command).toBe("toggleDarkDocument")
  })

  it("checkboxes are in the correct order: Headings, Multiple Pages, Dark Document", () => {
    const viewTab = wordRibbonSpec.tabs.find((tab) => tab.id === "view")
    expect(viewTab).toBeDefined()
    
    const showGroup = viewTab?.groups.find((group) => group.id === "show")
    expect(showGroup).toBeDefined()
    
    const controls = showGroup?.controls || []
    
    // Find the indices of our checkboxes
    const headingsIndex = controls.findIndex(
      (control) => control.id === "headings" && control.type === "checkbox",
    )
    const multiplePagesIndex = controls.findIndex(
      (control) => control.id === "multiple-pages-checkbox" && control.type === "checkbox",
    )
    const darkDocumentIndex = controls.findIndex(
      (control) => control.id === "dark-document" && control.type === "checkbox",
    )
    
    // All checkboxes should be found
    expect(headingsIndex).not.toBe(-1)
    expect(multiplePagesIndex).not.toBe(-1)
    expect(darkDocumentIndex).not.toBe(-1)
    
    // Headings should come before Multiple Pages
    expect(headingsIndex).toBeLessThan(multiplePagesIndex)
    
    // Multiple Pages should come before Dark Document
    expect(multiplePagesIndex).toBeLessThan(darkDocumentIndex)
  })
})
