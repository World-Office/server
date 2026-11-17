// @vitest-environment jsdom
/**
 * PF-GAP-9 — Parity fill: Insert — Comment, Header &
 * covers OO golden labels: ["Comment", "Header & Footer"]
 */
import { describe, expect, it } from "vitest"
import { wordRibbonSpec } from "../lib/word-ribbon-spec"

function getInsertTab() {
  return wordRibbonSpec.tabs.find((tab) => tab.id === "insert")
}

function getHeaderFooterGroup() {
  return getInsertTab()?.groups.find((group) => group.id === "header-footer")
}

describe("PF-GAP-9: Insert tab — Comment, Header & Footer labels", () => {
  it("Insert tab exists", () => {
    const insertTab = getInsertTab()
    expect(insertTab).toBeDefined()
    expect(insertTab?.label).toContain("Insert")
  })

  it("Insert tab has Header & Footer group", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup).toBeDefined()
    expect(headerFooterGroup?.label).toBe("Header & Footer")
  })

  it("Header & Footer group contains Comment control with label 'Comment'", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup).toBeDefined()
    
    const commentControl = headerFooterGroup?.controls.find(
      (control) => control.id === "add-comment",
    )
    expect(commentControl).toBeDefined()
    expect(commentControl?.label).toBe("Comment")
    expect(commentControl?.type).toBe("button")
    expect(commentControl?.command).toBe("addComment")
  })

  it("Header & Footer group contains Header & Footer control with label 'Header & Footer'", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup).toBeDefined()
    
    const headerFooterControl = headerFooterGroup?.controls.find(
      (control) => control.id === "insert-header-footer",
    )
    expect(headerFooterControl).toBeDefined()
    expect(headerFooterControl?.label).toBe("Header & Footer")
    expect(headerFooterControl?.type).toBe("button")
    expect(headerFooterControl?.command).toBe("insertHeaderFooter")
  })

  it("Header & Footer group contains all required labels", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup).toBeDefined()
    
    const controls = headerFooterGroup?.controls || []
    const labels = controls.map(c => c.label)
    
    expect(labels).toContain("Comment")
    expect(labels).toContain("Header & Footer")
  })
})
