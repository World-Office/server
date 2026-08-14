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
