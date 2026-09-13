import { describe, expect, it } from "vitest"
import { isEditable, type WopiFileInfo } from "../src/wopi-types"

// Truth table pinned against OpenCloud collaboration behavior:
// its CheckFileInfo sets UserCanWrite=true ONLY for VIEW_MODE_READ_WRITE
// sessions and OMITS the field otherwise (view/view-only), while PutFile
// is not view-mode-gated server-side.
describe("isEditable", () => {
  it("omitted UserCanWrite (OpenCloud view-session click-open) -> editable", () => {
    const info: WopiFileInfo = { BaseFileName: "worepro.docx" }
    expect(isEditable(info)).toBe(true)
  })

  it("UserCanWrite=true -> editable", () => {
    expect(isEditable({ UserCanWrite: true })).toBe(true)
  })

  it("UserCanWrite=false -> read-only", () => {
    expect(isEditable({ UserCanWrite: false })).toBe(false)
  })

  it("explicit ReadOnly=true without UserCanWrite -> read-only", () => {
    expect(isEditable({ ReadOnly: true })).toBe(false)
  })

  it("explicit UserCanWrite=true wins over ReadOnly", () => {
    expect(isEditable({ UserCanWrite: true, ReadOnly: true })).toBe(true)
  })

  it("UserCanWrite=false wins over ReadOnly=false", () => {
    expect(isEditable({ UserCanWrite: false, ReadOnly: false })).toBe(false)
  })
})
