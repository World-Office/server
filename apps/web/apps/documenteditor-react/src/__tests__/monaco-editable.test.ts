import { describe, expect, it } from "vitest"
import { resolveMonacoEditable } from "../lib/monaco-editable"

// FE-1: readOnly is now applied dynamically via updateOptions({readOnly:
// !isEditable}); this pins the editability resolution the component feeds it.
describe("resolveMonacoEditable", () => {
  it("explicit isEditable wins", () => {
    expect(resolveMonacoEditable(true, "presentation")).toBe(true)
    expect(resolveMonacoEditable(false, "document")).toBe(false)
    expect(resolveMonacoEditable(false, undefined)).toBe(false)
  })

  it("defaults presentation/pdf editors to read-only when isEditable is not given", () => {
    expect(resolveMonacoEditable(undefined, "presentation")).toBe(false)
    expect(resolveMonacoEditable(undefined, "pdf")).toBe(false)
  })

  it("defaults other editor types to editable when isEditable is not given", () => {
    expect(resolveMonacoEditable(undefined, "document")).toBe(true)
    expect(resolveMonacoEditable(undefined, undefined)).toBe(true)
  })
})
