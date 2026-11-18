const CONVERSION_ENDPOINT = "/api/conversion/convert"

interface ConversionResponse {
  status: string
  data?: string
  format?: string
  error?: string
  duration_ms: number
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(",")[1] ?? "")
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const byteChars = atob(b64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

export async function convertToHtml(blob: Blob, sourceFormat: string): Promise<string> {
  // Handle empty files gracefully — return empty HTML instead of sending
  // empty data to the backend (which would fail with a ZIP parse error).
  if (blob.size === 0) {
    return ""
  }
  const data = await blobToBase64(blob)
  const res = await fetch(CONVERSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_format: sourceFormat, target_format: "html", data }),
  })
  if (!res.ok) {
    throw new Error(`Conversion request failed: ${res.status} ${res.statusText}`)
  }
  const json: ConversionResponse = await res.json()
  if (!json.data) {
    throw new Error(`Conversion failed: ${json.status} — ${json.error ?? "unknown error"}`)
  }
  const htmlBytes = base64ToBlob(json.data, "text/html; charset=utf-8")
  return htmlBytes.text()
}

const FORMAT_MIME_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  odt: "application/vnd.oasis.opendocument.text",
  ott: "application/vnd.oasis.opendocument.text-template",
  rtf: "application/rtf",
  txt: "text/plain",
  html: "text/html; charset=utf-8",
  epub: "application/epub+zip",
  fb2: "application/x-fictionbook+xml",
  pdf: "application/pdf",
}

export async function convertFromHtml(html: string, targetFormat: string): Promise<Blob> {
  // TXT is a special case — strip HTML tags server-side would be ideal,
  // but we can do it client-side for immediate export
  if (targetFormat === "txt") {
    const text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
    return new Blob([text.trim()], { type: "text/plain" })
  }

  const encoder = new TextEncoder()
  const htmlBytes = encoder.encode(html)
  const blob = new Blob([htmlBytes], { type: "text/html; charset=utf-8" })
  const data = await blobToBase64(blob)
  const res = await fetch(CONVERSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_format: "html", target_format: targetFormat, data }),
  })
  if (!res.ok) {
    throw new Error(`Conversion request failed: ${res.status} ${res.statusText}`)
  }
  const json: ConversionResponse = await res.json()
  if (!json.data) {
    throw new Error(`Conversion failed: ${json.status} — ${json.error ?? "unknown error"}`)
  }
  const mimeType = FORMAT_MIME_TYPES[targetFormat] ?? "application/octet-stream"
  return base64ToBlob(json.data, mimeType)
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Convert a word-processing document (odt) to DOCX bytes so the canvas
 * renderer can process it (the WASM renderer accepts docx natively).
 * Returns the original blob for formats that need no conversion.
 */
export async function toDocxForCanvas(blob: Blob, sourceFormat: string): Promise<Blob> {
  if (sourceFormat === "docx" || blob.size === 0) {
    return blob
  }
  const data = await blobToBase64(blob)
  const res = await fetch(CONVERSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_format: sourceFormat, target_format: "docx", data }),
  })
  if (!res.ok) {
    throw new Error(`Conversion to docx failed: ${res.status} ${res.statusText}`)
  }
  const json: ConversionResponse = await res.json()
  if (json.status !== "Success" || !json.data) {
    throw new Error(json.error ?? "Conversion to docx failed")
  }
  const bytes = Uint8Array.from(atob(json.data), (c) => c.charCodeAt(0))
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
}

/* ------------------------------------------------------------------ *
 * Save Form — .docxf-equivalent export (DOCX with content controls)  *
 * ------------------------------------------------------------------ */

/**
 * OO's "Save Form" writes a DOCXF: a DOCX whose fillable fields are Word
 * structured document tags (content controls). The backend converter cannot
 * carry form fields, so the DOCX package is assembled client-side: every
 * `data-content-control` span rendered by the TipTap form-control nodes
 * (lib/content-controls.ts: plain-text / dropdown / checkbox / date-picker)
 * is mapped 1:1 to an inline `<w:sdt>` so the exported document stays
 * fillable in Word and WO.
 *
 * Divergence note: controls the walker cannot model degrade to their plain
 * text content, but the current value AND the dropdown option list are
 * always written to the sdt content / listItem entries — nothing is
 * silently dropped (see src/__tests__/save-form.test.ts).
 */

const FORM_CONTROL_ATTR = "data-content-control"
const DOCX_MIME = FORMAT_MIME_TYPES.docx

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Minimal stored-entry (uncompressed) ZIP writer — a DOCX is a ZIP. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const parts: Uint8Array<ArrayBuffer>[] = []
  const locals: Uint8Array<ArrayBuffer>[] = []
  const centrals: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const entry of entries) {
    const name = enc.encode(entry.name)
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + name.length + entry.data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, entry.data.length, true) // compressed size
    lv.setUint32(22, entry.data.length, true) // uncompressed size
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(name, 30)
    local.set(entry.data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true) // flags
    cv.setUint16(10, 0, true) // method: stored
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, entry.data.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  parts.push(...locals, ...centrals, end)
  const out = new Uint8Array(offset + centralSize + end.length)
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

interface RunFormat {
  bold: boolean
  italic: boolean
  underline: boolean
}

const PLAIN_FORMAT: RunFormat = { bold: false, italic: false, underline: false }

function run(text: string, fmt: RunFormat): string {
  if (text === "") return ""
  const props =
    (fmt.bold ? "<w:b/>" : "") +
    (fmt.italic ? "<w:i/>" : "") +
    (fmt.underline ? '<w:u w:val="single"/>' : "")
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
}

function sdtWrap(alias: string, id: number, typeProp: string, content: string): string {
  return (
    `<w:sdt><w:sdtPr><w:alias w:val="${alias}"/>` +
    `<w:tag w:val="wo-form-control"/><w:id w:val="${100000 + id}"/>` +
    `${typeProp}</w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`
  )
}

/** Map one TipTap form-control span to an inline Word content control (sdt). */
function controlSdt(el: Element, fmt: RunFormat, ctx: { id: number }): string {
  const kind = el.getAttribute(FORM_CONTROL_ATTR) ?? ""
  const value = el.textContent ?? ""
  const id = ++ctx.id
  switch (kind) {
    case "dropdown": {
      const options = (el.getAttribute("data-options") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const items = options
        .map((o) => `<w:listItem w:displayText="${escapeXml(o)}" w:value="${escapeXml(o)}"/>`)
        .join("")
      // No option list on the node → plain editable combo box (the picked
      // value still round-trips through sdtContent below).
      const typeProp = items ? `<w:dropDownList>${items}</w:dropDownList>` : "<w:comboBox/>"
      return sdtWrap("wo-dropdown", id, typeProp, run(value || " ", fmt))
    }
    case "checkbox": {
      const checked = el.getAttribute("data-checked") === "true"
      const typeProp =
        "<w14:checkbox>" +
        `<w14:checked w14:val="${checked ? 1 : 0}"/>` +
        '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>' +
        '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/>' +
        "</w14:checkbox>"
      return sdtWrap("wo-checkbox", id, typeProp, run(checked ? "☒" : "☐", fmt))
    }
    case "date-picker": {
      const dateValue = el.getAttribute("data-value") || value
      const iso = /^\d{4}-\d{2}-\d{2}/.test(dateValue) ? dateValue : ""
      const full = iso ? ` w:fullDate="${escapeXml(`${iso}T00:00:00Z`)}"` : ""
      const typeProp =
        `<w:date${full}><w:dateFormat w:val="yyyy-MM-dd"/>` +
        '<w:calendar w:val="gregorian"/></w:date>'
      return sdtWrap("wo-date", id, typeProp, run(dateValue || value || " ", fmt))
    }
    default: {
      // "plain-text" and any unknown control kind: degrade to an editable
      // plain-text content control; keep the placeholder as initial text.
      const placeholder =
        el.getAttribute("data-placeholder") ?? el.getAttribute("placeholder") ?? ""
      return sdtWrap("wo-text", id, "<w:text/>", run(value || placeholder || " ", fmt))
    }
  }
}

function inlineNodesXml(nodes: ArrayLike<Node>, fmt: RunFormat, ctx: { id: number }): string {
  let out = ""
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      out += run(node.nodeValue ?? "", fmt)
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (el.hasAttribute(FORM_CONTROL_ATTR)) {
      out += controlSdt(el, fmt, ctx)
      continue
    }
    if (tag === "br") {
      out += "<w:r><w:br/></w:r>"
      continue
    }
    const next = { ...fmt }
    if (tag === "b" || tag === "strong") next.bold = true
    else if (tag === "i" || tag === "em") next.italic = true
    else if (tag === "u") next.underline = true
    out += inlineNodesXml(el.childNodes, next, ctx)
  }
  return out
}

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()))
}

function blocksXml(nodes: ArrayLike<Node>, ctx: { id: number }): string {
  let out = ""
  let inline: Node[] = []
  const flush = () => {
    if (inline.length === 0) return
    out += `<w:p>${inlineNodesXml(inline, PLAIN_FORMAT, ctx)}</w:p>`
    inline = []
  }
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.nodeValue ?? "").trim() !== "") inline.push(node)
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    if (!BLOCK_TAGS.has(el.tagName.toLowerCase())) {
      inline.push(el)
      continue
    }
    flush()
    // Container blocks (div with <p> children, lists, tables…) recurse into
    // their children; leaf blocks become one paragraph. Tables degrade to a
    // sequence of paragraphs — form export only promises text + controls.
    if (hasBlockChild(el)) {
      out += blocksXml(el.childNodes, ctx)
    } else if (el.tagName.toLowerCase() === "hr") {
      out += "<w:p/>"
    } else {
      out += `<w:p>${inlineNodesXml(el.childNodes, PLAIN_FORMAT, ctx)}</w:p>`
    }
  }
  flush()
  return out
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>"

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>"

/**
 * Build a fillable-form DOCX (.docxf-equivalent) from the editor's HTML.
 * Form controls (data-content-control spans) become Word content controls.
 */
export function buildFormDocx(html: string): Blob {
  const parsed = new DOMParser().parseFromString(html, "text/html")
  const ctx = { id: 0 }
  const body = blocksXml(parsed.body.childNodes, ctx)
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
    'mc:Ignorable="w14"><w:body>' +
    body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>' +
    "</w:body></w:document>"
  const enc = new TextEncoder()
  const bytes = buildZip([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS_XML) },
    { name: "word/document.xml", data: enc.encode(documentXml) },
  ])
  return new Blob([bytes], { type: DOCX_MIME })
}
