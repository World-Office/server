/**
 * annotation-conversion.ts
 *
 * Converts frontend PdfAnnotations to the backend WoPdfAnnotation format
 * and calls the conversion service to produce an annotated PDF blob.
 *
 * The conversion flow is:
 *   1. POST to conversion service: pdf → wo-pdf-document (get base JSON)
 *   2. Merge frontend annotations into the WoPdfDocument
 *   3. POST to conversion service: wo-pdf-document → pdf (get annotated PDF)
 */

import type { PdfAnnotation } from "../stores/PdfStore"

const CONVERSION_ENDPOINT = "/api/conversion/convert"

interface ConvertRequest {
  input_format: string
  output_format: string
  data: string
}

interface ConversionJob {
  id: string
  input_format: string
  output_format: string
  status: "completed" | "failed"
  created_at: string
  completed_at: string
  error: string | null
  output_data: string | null
  output_size: number | null
  duration_ms: number | null
}

interface ConvertResponse {
  job: ConversionJob
}

/** Default colour for unknown annotation colours */
const DEFAULT_COLOR: [number, number, number] = [1.0, 0.6, 0.0]

/** Map frontend annotation tool to PDF annotation subtype */
function toolToSubtype(toolOrColor?: string): string {
  switch (toolOrColor) {
    case "highlight":
    case "#FFEB3B":
      return "Highlight"
    case "strikeout":
    case "#F44336":
      return "StrikeOut"
    case "underline":
    case "#2196F3":
      return "Underline"
    case "text-comment":
    case "#FF9800":
      return "Text"
    case "stamp":
    case "#9C27B0":
      return "Stamp"
    case "shape-comment":
    case "#4CAF50":
      return "FreeText"
    default:
      return "Text"
  }
}

/** Convert a CSS hex colour to PDF RGB ratio array */
function hexToRgb(hex: string): [number, number, number] {
  const match = hex.replace("#", "")
  if (match.length !== 6) return DEFAULT_COLOR
  const r = Number.parseInt(match.substring(0, 2), 16) / 255
  const g = Number.parseInt(match.substring(2, 4), 16) / 255
  const b = Number.parseInt(match.substring(4, 6), 16) / 255
  return [r, g, b]
}

/** Convert a frontend PdfAnnotation to a backend WoPdfAnnotation */
function toWoPdfAnnotation(annot: PdfAnnotation): Record<string, unknown> {
  const subtype = toolToSubtype(annot.color)
  const rect: [number, number, number, number] = [
    annot.x,
    annot.y - annot.height,
    annot.x + annot.width,
    annot.y,
  ]
  const rgb = hexToRgb(annot.color)
  const result: Record<string, unknown> = {
    subtype,
    rect,
    contents: annot.text ?? "",
    author: "User",
    modified: new Date().toISOString(),
    color: rgb,
    opacity: 0.8,
    name: annot.id,
  }
  if (subtype === "FreeText") {
    result.border = [0, 0, 0]
  }
  if (subtype === "Highlight" || subtype === "StrikeOut" || subtype === "Underline") {
    result.quadPoints = [
      annot.x,
      annot.y - annot.height,
      annot.x + annot.width,
      annot.y - annot.height,
      annot.x,
      annot.y,
      annot.x + annot.width,
      annot.y,
    ]
  }
  return result
}

/** Base64-encode a blob */
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

/** Base64-decode a string to a Blob */
function base64ToBlob(b64: string, mimeType: string): Blob {
  const byteChars = atob(b64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

/** Call the conversion service */
async function convert(
  inputBytes: ArrayBuffer | Blob,
  sourceFormat: string,
  targetFormat: string,
): Promise<Blob> {
  const blob = inputBytes instanceof Blob ? inputBytes : new Blob([inputBytes])
  const data = await blobToBase64(blob)
  const body: ConvertRequest = {
    input_format: sourceFormat,
    output_format: targetFormat,
    data,
  }
  const res = await fetch(CONVERSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Conversion failed (${res.status}): ${errText}`)
  }
  const json: ConvertResponse = await res.json()
  if (!json.job.output_data || json.job.status !== "completed") {
    throw new Error(`Conversion failed: ${json.job.error ?? "unknown error"}`)
  }
  return base64ToBlob(json.job.output_data, "application/pdf")
}

/**
 * Produce an annotated PDF blob by:
 * 1. Parsing the original PDF to a WoPdfDocument
 * 2. Merging frontend annotations into the pages
 * 3. Re-serializing to PDF
 */
export async function produceAnnotatedPdf(
  originalPdf: ArrayBuffer | Blob,
  annotations: PdfAnnotation[],
): Promise<Blob> {
  if (annotations.length === 0) {
    // No annotations to merge — return original
    return originalPdf instanceof Blob
      ? originalPdf
      : new Blob([originalPdf], { type: "application/pdf" })
  }

  // Step 1: Parse original PDF → WoPdfDocument JSON
  const woDocBlob = await convert(originalPdf, "pdf", "wo-pdf-document")
  const woDocText = await woDocBlob.text()
  const woDoc: Record<string, unknown> = JSON.parse(woDocText)

  // Step 2: Merge annotations into the correct pages
  const pages = (woDoc.pages as Record<string, unknown>[]) ?? []
  const annotsByPage = new Map<number, PdfAnnotation[]>()
  for (const annot of annotations) {
    const pageAnnots = annotsByPage.get(annot.page) ?? []
    pageAnnots.push(annot)
    annotsByPage.set(annot.page, pageAnnots)
  }

  for (const page of pages) {
    const pageNum = page.number as number
    const pageAnnots = annotsByPage.get(pageNum) ?? []
    const existingAnnots = (page.annotations as Record<string, unknown>[]) ?? []

    // Remove any existing annotations from a previous save (matched by name)
    const existingNames = new Set(pageAnnots.map((a) => a.id))
    const kept = existingAnnots.filter((a) => !a.name || !existingNames.has(a.name as string))

    // Convert frontend annotations to backend format
    const newAnnots = pageAnnots.map(toWoPdfAnnotation)
    page.annotations = [...kept, ...newAnnots]
  }

  // Step 3: Serialize back to PDF
  const updatedJson = JSON.stringify(woDoc)
  const encoder = new TextEncoder()
  const jsonBlob = new Blob([encoder.encode(updatedJson)], {
    type: "application/json",
  })
  return await convert(jsonBlob, "wo-pdf-document", "pdf")
}
