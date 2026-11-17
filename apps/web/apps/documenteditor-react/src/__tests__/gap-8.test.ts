// @vitest-environment jsdom
/**
 * PF-GAP-8 — Parity fill: Collaboration — Co-editing
 * covers OO golden labels: ["Co-editing"]
 * Tests that the Collaboration tab contains a Co-editing Mode button
 */
import { describe, expect, it } from "vitest"
import { wordRibbonSpec } from "../lib/word-ribbon-spec"

describe("PF-GAP-8: Collaboration tab Co-editing Mode button", () => {
  it("has a Collaboration tab", () => {
    const collaborationTab = wordRibbonSpec.tabs.find((tab) => tab.id === "collaboration")
    expect(collaborationTab).toBeDefined()
    expect(collaborationTab?.label).toContain("Collaboration")
  })

  it("Collaboration tab has a tracking group", () => {
    const collaborationTab = wordRibbonSpec.tabs.find((tab) => tab.id === "collaboration")
    expect(collaborationTab).toBeDefined()

    const trackingGroup = collaborationTab?.groups.find((group) => group.id === "tracking")
    expect(trackingGroup).toBeDefined()
    expect(trackingGroup?.label).toBe("Tracking")
  })

  it("Tracking group contains a Co-editing Mode button", () => {
    const collaborationTab = wordRibbonSpec.tabs.find((tab) => tab.id === "collaboration")
    expect(collaborationTab).toBeDefined()

    const trackingGroup = collaborationTab?.groups.find((group) => group.id === "tracking")
    expect(trackingGroup).toBeDefined()

    const coEditingButton = trackingGroup?.controls.find(
      (control) => control.id === "co-editing-mode",
    )
    expect(coEditingButton).toBeDefined()
    expect(coEditingButton?.label).toBe("Co-editing Mode")
  })

  it("Co-editing Mode button is a button with toggleCoEditingMode command", () => {
    const collaborationTab = wordRibbonSpec.tabs.find((tab) => tab.id === "collaboration")
    expect(collaborationTab).toBeDefined()

    const trackingGroup = collaborationTab?.groups.find((group) => group.id === "tracking")
    expect(trackingGroup).toBeDefined()

    const coEditingButton = trackingGroup?.controls.find(
      (control) => control.id === "co-editing-mode",
    )
    expect(coEditingButton?.type).toBe("button")
    expect(coEditingButton?.command).toBe("toggleCoEditingMode")
  })

  it("Co-editing Mode button has Users icon", () => {
    const collaborationTab = wordRibbonSpec.tabs.find((tab) => tab.id === "collaboration")
    expect(collaborationTab).toBeDefined()

    const trackingGroup = collaborationTab?.groups.find((group) => group.id === "tracking")
    expect(trackingGroup).toBeDefined()

    const coEditingButton = trackingGroup?.controls.find(
      (control) => control.id === "co-editing-mode",
    )
    expect(coEditingButton?.icon).toBe("Users")
  })

  it("Co-editing Mode button is at position 1 in tracking group (after Track Changes)", () => {
    const collaborationTab = wordRibbonSpec.tabs.find((tab) => tab.id === "collaboration")
    expect(collaborationTab).toBeDefined()

    const trackingGroup = collaborationTab?.groups.find((group) => group.id === "tracking")
    expect(trackingGroup).toBeDefined()

    const controls = trackingGroup?.controls || []
    const coEditingIndex = controls.findIndex((control) => control.id === "co-editing-mode")
    expect(coEditingIndex).not.toBe(-1)
    expect(coEditingIndex).toBe(1)
  })
})
