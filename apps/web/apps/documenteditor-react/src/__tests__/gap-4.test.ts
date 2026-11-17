// @vitest-environment jsdom
/**
 * PF-GAP-4 — Parity fill: Insert — Comment, Header &
 * covers OO golden labels: ["Comment", "Header"]
 */
import { describe, expect, it } from "vitest"
import { wordRibbonSpec } from "../lib/word-ribbon-spec"

function getHeaderFooterGroup() {
  const insertTab = wordRibbonSpec.tabs.find((tab) => tab.id === "insert")
  return insertTab?.groups.find((group) => group.id === "header-footer")
}

describe("PF-GAP-4: Insert tab — Comment, Header labels", () => {
  it("renders Header label in Insert tab", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup).toBeDefined()

    const headerControl = headerFooterGroup?.controls.find(
      (control) => control.id === "edit-header",
    )
    expect(headerControl).toBeDefined()
    expect(headerControl?.label).toBe("Header")
  })

  it("renders Comment label in Insert tab", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup).toBeDefined()

    const commentControl = headerFooterGroup?.controls.find(
      (control) => control.id === "add-comment",
    )
    expect(commentControl).toBeDefined()
    expect(commentControl?.label).toBe("Comment")
  })

  it("Header control is a button with editHeader command", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    const headerControl = headerFooterGroup?.controls.find(
      (control) => control.id === "edit-header",
    )
    expect(headerControl?.type).toBe("button")
    expect(headerControl?.command).toBe("editHeader")
  })

  it("Comment control is a button with addComment command", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    const commentControl = headerFooterGroup?.controls.find(
      (control) => control.id === "add-comment",
    )
    expect(commentControl?.type).toBe("button")
    expect(commentControl?.command).toBe("addComment")
  })

  it("Header & Footer group label is correct", () => {
    const headerFooterGroup = getHeaderFooterGroup()
    expect(headerFooterGroup?.label).toBe("Header & Footer")
  })

  it("Header & Footer group is in Insert tab", () => {
    const insertTab = wordRibbonSpec.tabs.find((tab) => tab.id === "insert")
    expect(insertTab).toBeDefined()
    expect(insertTab?.groups.some((g) => g.id === "header-footer")).toBe(true)
  })
})
