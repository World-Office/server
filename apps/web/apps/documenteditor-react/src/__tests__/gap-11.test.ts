// @vitest-environment jsdom
/**
 * View tab parity vs ONLYOFFICE golden census (census-oo-deep.json ▸ view):
 *   Show group checkboxes: Spell Check, Ruler, Gridlines, Headings, Dark Document
 *   Zoom cluster: Fit To Page, Fit To Width, Multiple Pages, Zoom to 100%
 * "Multiple Pages" is a zoom-cluster control in OO, NOT a Show checkbox.
 */
import { describe, expect, it } from "vitest"
import { wordRibbonSpec } from "../lib/word-ribbon-spec"

const viewTab = () => wordRibbonSpec.tabs.find((tab) => tab.id === "view")
const showGroup = () => viewTab()?.groups.find((g) => g.id === "show" || g.label === "Show")
const allLabels = () =>
  (viewTab()?.groups ?? []).flatMap((g) => g.controls.map((c) => c.label ?? ""))

describe("View tab parity (OO golden)", () => {
  it("has a View tab with a Show group", () => {
    expect(viewTab()).toBeDefined()
    expect(showGroup()).toBeDefined()
  })

  it("Show group contains Headings and Dark Document checkboxes (OO golden)", () => {
    const labels = (showGroup()?.controls ?? []).map((c) => c.label)
    expect(labels).toContain("Headings")
    expect(labels).toContain("Dark Document")
  })

  it("Show group does NOT duplicate zoom controls (no Multiple Pages checkbox)", () => {
    const labels = (showGroup()?.controls ?? []).map((c) => c.label)
    expect(labels).not.toContain("Multiple Pages")
    expect(labels).not.toContain("Dark")
  })

  it("zoom cluster provides Multiple Pages (OO places it there)", () => {
    expect(allLabels()).toContain("Multiple Pages")
  })
})
