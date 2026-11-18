// @vitest-environment jsdom
/**
 * PGP-7 — Save Form: export as form (.docxf-equivalent via DOCX with
 * content controls).
 *
 * Pins:
 *  - buildFormDocx emits a real DOCX (ZIP) package whose word/document.xml
 *    maps every data-content-control span to a Word <w:sdt> content control
 *    (dropdown list items, checkbox state, date picker, plain text).
 *  - Control text/options are always carried — nothing silently lost when a
 *    control degrades.
 *  - SaveAsPanel exposes a "Form" entry (aria "Save as Form") that exports a
 *    DOCX-mime blob built from the document HTML.
 */
import type { ReactNode } from "react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SaveAsPanel } from "../components/FileMenu/panels/SaveAsPanel"
import { buildFormDocx, downloadBlob } from "../lib/conversion"
import { documentStore } from "../stores/DocumentStore"

vi.mock("../../../bridge/file-operations", () => ({
  saveFile: vi.fn(),
}))

// downloadBlob is mocked away (jsdom has no URL.createObjectURL); the form
// builder itself stays REAL so the exported bytes are asserted below.
vi.mock("../lib/conversion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/conversion")>()
  return {
    ...actual,
    convertFromHtml: vi.fn(actual.convertFromHtml),
    buildFormDocx: vi.fn(actual.buildFormDocx),
    downloadBlob: vi.fn(),
  }
})

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** Editor HTML as the TipTap form-control nodes render it (content-controls.ts). */
const FORM_HTML = [
  "<p><strong>Name:</strong> ",
  '<span data-content-control="plain-text" data-placeholder="Enter text">Ada</span></p>',
  '<p>Plan: <span data-content-control="dropdown" data-options="Basic, Pro, Enterprise">Pro</span></p>',
  '<p>Subscribe: <span data-content-control="checkbox" data-checked="true"></span></p>',
  '<p>Start date: <span data-content-control="date-picker" data-value="2026-01-31">2026-01-31</span></p>',
  "<p>Signature: <em>handwritten</em></p>",
].join("")

/* ---------- zip helpers (entries are STORED — no inflate needed) ---------- */

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

function extractZipEntry(bytes: Uint8Array, name: string): Uint8Array {
  const decoder = new TextDecoder()
  let pos = 0
  while (pos + 30 <= bytes.length) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, bytes.length - pos)
    if (dv.getUint32(0, true) !== 0x04034b50) break // local file header sig
    const size = dv.getUint32(22, true)
    const nameLen = dv.getUint16(26, true)
    const extraLen = dv.getUint16(28, true)
    const entryName = decoder.decode(bytes.slice(pos + 30, pos + 30 + nameLen))
    const dataStart = pos + 30 + nameLen + extraLen
    if (entryName === name) return bytes.slice(dataStart, dataStart + size)
    pos = dataStart + size
  }
  throw new Error(`zip entry "${name}" not found`)
}

function zipEntryNames(bytes: Uint8Array): string[] {
  const decoder = new TextDecoder()
  const names: string[] = []
  let pos = 0
  while (pos + 30 <= bytes.length) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, bytes.length - pos)
    if (dv.getUint32(0, true) !== 0x04034b50) break
    const size = dv.getUint32(22, true)
    const nameLen = dv.getUint16(26, true)
    const extraLen = dv.getUint16(28, true)
    names.push(decoder.decode(bytes.slice(pos + 30, pos + 30 + nameLen)))
    pos = pos + 30 + nameLen + extraLen + size
  }
  return names
}

/* ------------------------------ panel helpers ----------------------------- */

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  mounted.push({ root, container })
  return container
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )
  if (!button) throw new Error(`button "${text}" not found`)
  return button as HTMLButtonElement
}

function click(button: HTMLElement): void {
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/* --------------------------------- tests ---------------------------------- */

describe("buildFormDocx — DOCX package with content controls", () => {
  it("emits a valid DOCX zip (content types, rels, document.xml + EOCD)", async () => {
    const bytes = await blobBytes(buildFormDocx(FORM_HTML))
    expect(zipEntryNames(bytes)).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"])
    // End-of-central-directory record is the last 22 bytes.
    const eocd = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 22, 22)
    expect(eocd.getUint32(0, true)).toBe(0x06054b50)
    expect(eocd.getUint16(8, true)).toBe(3) // entries on this disk
    expect(new TextDecoder().decode(extractZipEntry(bytes, "[Content_Types].xml"))).toContain(
      "wordprocessingml.document.main+xml",
    )
  })

  it("maps a dropdown control to a w:dropDownList sdt keeping every option", async () => {
    const bytes = await blobBytes(buildFormDocx(FORM_HTML))
    const xml = new TextDecoder().decode(extractZipEntry(bytes, "word/document.xml"))
    expect(xml).toContain("<w:dropDownList>")
    expect(xml).toContain('<w:listItem w:displayText="Basic" w:value="Basic"/>')
    expect(xml).toContain('<w:listItem w:displayText="Pro" w:value="Pro"/>')
    expect(xml).toContain('<w:listItem w:displayText="Enterprise" w:value="Enterprise"/>')
    // Current value round-trips through the sdt content — nothing silently lost.
    expect(xml).toContain(">Pro</w:t>")
  })

  it("maps checkbox, date-picker and plain-text controls to sdts", async () => {
    const bytes = await blobBytes(buildFormDocx(FORM_HTML))
    const xml = new TextDecoder().decode(extractZipEntry(bytes, "word/document.xml"))
    expect(xml).toContain("<w14:checkbox>")
    expect(xml).toContain('<w14:checked w14:val="1"/>')
    expect(xml).toContain('<w:date w:fullDate="2026-01-31T00:00:00Z">')
    expect(xml).toContain("<w:dateFormat")
    expect(xml).toContain("<w:text/>")
    expect(xml).toContain(">Ada</w:t>")
  })

  it("keeps document text and basic formatting; each control is tagged", async () => {
    const bytes = await blobBytes(buildFormDocx(FORM_HTML))
    const xml = new TextDecoder().decode(extractZipEntry(bytes, "word/document.xml"))
    expect(xml).toContain("Name:")
    expect(xml).toContain("<w:b/>")
    expect(xml).toContain("<w:i/>")
    expect(xml).toContain("handwritten")
    expect(xml.match(/<w:tag w:val="wo-form-control"\/>/g)?.length).toBe(4)
    expect(xml).toContain("<w:sectPr>")
  })

  it("unchecked checkbox writes val=0 and the unchecked glyph", async () => {
    const html = '<p><span data-content-control="checkbox" data-checked="false"></span></p>'
    const xml = new TextDecoder().decode(
      extractZipEntry(await blobBytes(buildFormDocx(html)), "word/document.xml"),
    )
    expect(xml).toContain('<w14:checked w14:val="0"/>')
    expect(xml).toContain("☐")
  })

  it("control without options degrades to a combo box, keeping its value", async () => {
    const html = '<p><span data-content-control="dropdown">Fallback</span></p>'
    const xml = new TextDecoder().decode(
      extractZipEntry(await blobBytes(buildFormDocx(html)), "word/document.xml"),
    )
    expect(xml).toContain("<w:comboBox/>")
    expect(xml).not.toContain("<w:dropDownList>")
    expect(xml).toContain(">Fallback</w:t>")
  })

  it("unknown control kind degrades to a plain-text control, content preserved", async () => {
    const html = '<p><span data-content-control="future-widget">payload</span></p>'
    const xml = new TextDecoder().decode(
      extractZipEntry(await blobBytes(buildFormDocx(html)), "word/document.xml"),
    )
    expect(xml).toContain("<w:sdt>")
    expect(xml).toContain("<w:text/>")
    expect(xml).toContain(">payload</w:t>")
  })

  it("plain document without controls exports clean text (no sdt)", async () => {
    const xml = new TextDecoder().decode(
      extractZipEntry(
        await blobBytes(buildFormDocx("<p>No forms here</p>")),
        "word/document.xml",
      ),
    )
    expect(xml).not.toContain("<w:sdt>")
    expect(xml).toContain("No forms here")
  })
})

describe("SaveAsPanel — Save as Form", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    documentStore.isDesktop = false
    documentStore.fileName = "Contract.docx"
    documentStore.richTextHtml = FORM_HTML
    documentStore.setActiveFileMenuPanel("saveas")
    documentStore.setFileMenuOpen(true)
  })

  afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount())
      container.remove()
    }
    documentStore.richTextHtml = null
    documentStore.fileName = "Untitled Document"
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
    vi.restoreAllMocks()
  })

  it("renders the Form entry with a Save as Form accessible label", () => {
    const container = mount(createElement(SaveAsPanel, { visible: true }))
    const formButton = findButton(container, "Form")
    expect(formButton.getAttribute("aria-label")).toBe("Save as Form")
  })

  it("exports a DOCX-mime blob with content controls and a .docx file name", async () => {
    const container = mount(createElement(SaveAsPanel, { visible: true }))
    click(findButton(container, "Form"))
    await flush()

    expect(vi.mocked(buildFormDocx)).toHaveBeenCalledWith(FORM_HTML)
    expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1)
    const [blob, fileName] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string]
    expect(blob.type).toBe(DOCX_MIME)
    expect(fileName).toBe("Contract.docx")

    const xml = new TextDecoder().decode(
      extractZipEntry(await blobBytes(blob), "word/document.xml"),
    )
    expect(xml).toContain("<w:dropDownList>")
    expect(xml).toContain('<w:listItem w:displayText="Basic" w:value="Basic"/>')

    // Menu closes after a successful export.
    expect(documentStore.isFileMenuOpen).toBe(false)
  })

  it("shows an error instead of exporting when there is no content", async () => {
    documentStore.richTextHtml = null
    const container = mount(createElement(SaveAsPanel, { visible: true }))
    click(findButton(container, "Form"))
    await flush()

    expect(vi.mocked(downloadBlob)).not.toHaveBeenCalled()
    expect(container.textContent).toContain("No document content to export")
  })
})
