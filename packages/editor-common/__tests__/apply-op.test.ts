/**
 * DM-10 acceptance test (task 4.3 of openspec/changes/rebuild-doc-mutation-engine):
 * JS smoke test for the WASM `apply_op` + `model_to_bytes` exports of
 * `core/crates/wo-renderer-wasm`.
 *
 * Contract (plan §4 / spec doc-mutation-api):
 * 1. create_model with 'stub' and 'docx' formats
 * 2. apply_op with a ModelOp JSON (InsertText)
 * 3. model_to_bytes to serialize back
 * 4. Round-trip: insert → serialize → re-parse → assert inserted text present
 *
 * The wasm module is loaded from the wasm-pack output at
 * `core/crates/wo-renderer-wasm/pkg` (built via
 * `wasm-pack build --target web core/crates/wo-renderer-wasm`).
 */
import { existsSync, readFileSync } from "node:fs"
import { inflateRawSync } from "node:zlib"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

const PKG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../core/crates/wo-renderer-wasm/pkg",
)
const DEMO_DOCX = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../assets/demo.docx",
)

interface WasmApi {
  init(input?: BufferSource): Promise<void> | void
  default?(input?: BufferSource): Promise<void>
  create_model(bytes: Uint8Array, fmt: string): number
  apply_op(handle: number, opJson: string): void
  model_to_bytes(handle: number): Uint8Array
}

let wasm: WasmApi

beforeAll(async () => {
  const mod = (await import(
    "../../../core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm.js"
  )) as unknown as WasmApi
  // The `--target web` glue cannot fetch the .wasm via a file:// URL under
  // Node, so pass the bytes directly to init().
  // Node's fetch cannot load file:// URLs, so pass the .wasm bytes directly
  // to the async default export — the crate's sync `init()` is NOT the loader.
  const wasmBytes = new Uint8Array(readFileSync(resolve(PKG_DIR, "wo_renderer_wasm_bg.wasm")))
  if (typeof mod.default !== "function") {
    throw new Error("wasm module has no default init export — is pkg/ a real wasm-pack build?")
  }
  await mod.default(wasmBytes)
  wasm = mod
}, 60000)

function stubModel(paragraphs: string[]): number {
  return wasm.create_model(new TextEncoder().encode(JSON.stringify(paragraphs)), "stub")
}

function stubParagraphs(handle: number): string[] {
  return JSON.parse(new TextDecoder().decode(wasm.model_to_bytes(handle)))
}

/**
 * Extract one file from a ZIP archive (central-directory based, no deps).
 * DOCX files written by the wo-ooxml serializer are standard ZIPs.
 */
function extractZipEntry(zip: Uint8Array, name: string): Uint8Array | null {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const dec = new TextDecoder()

  // Locate End Of Central Directory record (scan backwards over max comment).
  let eocd = -1
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  const entryCount = dv.getUint16(eocd + 10, true)
  let off = dv.getUint32(eocd + 16, true)
  for (let n = 0; n < entryCount; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) return null
    const method = dv.getUint16(off + 10, true)
    const compSize = dv.getUint32(off + 20, true)
    const nameLen = dv.getUint16(off + 28, true)
    const extraLen = dv.getUint16(off + 30, true)
    const commentLen = dv.getUint16(off + 32, true)
    const localOffset = dv.getUint32(off + 42, true)
    const entryName = dec.decode(zip.subarray(off + 46, off + 46 + nameLen))
    off += 46 + nameLen + extraLen + commentLen

    if (entryName !== name) continue

    const nameLenLocal = dv.getUint16(localOffset + 26, true)
    const extraLenLocal = dv.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + nameLenLocal + extraLenLocal
    const data = zip.subarray(dataStart, dataStart + compSize)
    if (method === 0) return data
    if (method === 8) return new Uint8Array(inflateRawSync(data))
    return null
  }
  return null
}

describe("DM-10: WASM apply_op + model_to_bytes contract", () => {
  it("exports create_model, apply_op, and model_to_bytes", () => {
    expect(typeof wasm.create_model).toBe("function")
    expect(typeof wasm.apply_op).toBe("function")
    expect(typeof wasm.model_to_bytes).toBe("function")
  })

  it("insert → serialize → re-parse → inserted text present (stub model)", () => {
    const handle = stubModel(["Hello"])

    // InsertText at para 0, run 0, char 5 (char indices, not bytes).
    const insertOp = {
      op: "insert",
      at: { kind: "text", para: 0, run: 0, char: 5 },
      content: " world",
    }
    wasm.apply_op(handle, JSON.stringify(insertOp))

    const serialized = wasm.model_to_bytes(handle)
    expect(new TextDecoder().decode(serialized)).toContain("Hello world")

    // Re-parse with the wasm lib's own parse export and assert again.
    const reparsed = wasm.create_model(serialized, "stub")
    expect(stubParagraphs(reparsed)).toEqual(["Hello world"])
  })

  it("counts characters as Unicode scalar values (stub model)", () => {
    // "A😀B" is 3 chars / 5 UTF-8 bytes; insertion at char index 2 must
    // land between 😀 and B, proving char (not byte) addressing.
    const handle = stubModel(["A😀B"])
    const insertOp = {
      op: "insert",
      at: { kind: "text", para: 0, run: 0, char: 2 },
      content: "-",
    }
    wasm.apply_op(handle, JSON.stringify(insertOp))
    expect(stubParagraphs(handle)[0]).toBe("A😀-B")
  })

  it("rejects invalid op JSON", () => {
    const handle = stubModel(["A"])
    expect(() => wasm.apply_op(handle, "not json")).toThrow()
  })

  describe.skipIf(!existsSync(DEMO_DOCX))("DOCX fixture round-trip", () => {
    it("insert → serialize → assert text in word/document.xml → re-parse", () => {
      const original = new Uint8Array(readFileSync(DEMO_DOCX))
      const handle = wasm.create_model(original, "docx")
      expect(Number.isInteger(handle)).toBe(true)

      const marker = "DM10-SMOKE-MARKER"
      const insertOp = {
        op: "insert",
        at: { kind: "text", para: 0, run: 0, char: 0 },
        content: marker,
      }
      wasm.apply_op(handle, JSON.stringify(insertOp))

      const serialized = wasm.model_to_bytes(handle)
      expect(serialized.length).toBeGreaterThan(0)
      // Serialized DOCX is a ZIP: the inserted text must appear in
      // word/document.xml.
      const documentXml = extractZipEntry(serialized, "word/document.xml")
      expect(documentXml).not.toBeNull()
      const xmlText = new TextDecoder().decode(documentXml as Uint8Array)
      expect(xmlText).toContain(marker)

      // Re-parse the serialized bytes: the model must load and stay mutable.
      const reparsed = wasm.create_model(serialized, "docx")
      const secondMarker = "DM10-AFTER-REPARSE"
      wasm.apply_op(
        reparsed,
        JSON.stringify({
          op: "insert",
          at: { kind: "text", para: 0, run: 0, char: marker.length },
          content: secondMarker,
        }),
      )
      const reserialized = wasm.model_to_bytes(reparsed)
      const xml2 = new TextDecoder().decode(
        extractZipEntry(reserialized, "word/document.xml") as Uint8Array,
      )
      expect(xml2).toContain(marker)
      expect(xml2).toContain(secondMarker)
    })
  })
})
