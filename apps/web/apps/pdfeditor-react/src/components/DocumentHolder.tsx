import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { pdfStore } from "../stores/PdfStore"
import { MonacoEditor } from "./MonacoEditor"
import { PdfViewer } from "./PdfViewer"

const SAVE_DEBOUNCE_MS = 1500

function languageForFile(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (ext === "txt" || ext === "md") return "plaintext"
  if (ext === "json") return "json"
  return "xml"
}

async function blobToText(blob: Blob): Promise<string> {
  return await blob.text()
}

export const DocumentHolder = observer(function DocumentHolder() {
  const [value, setValue] = useState<string>("")
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(null)
  const [pdfRenderError, setPdfRenderError] = useState(false)
  const lastBlobRef = useRef<Blob | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    void pdfStore.detectAndLoadWopi()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger when the WOPI-loaded blob changes
  useEffect(() => {
    const blob = pdfStore.lastLoadedContent
    if (!blob || blob === lastBlobRef.current) return
    lastBlobRef.current = blob

    try {
      blob.arrayBuffer().then((buf) => {
        setPdfArrayBuffer(buf)
        setPdfRenderError(false)
      })
    } catch {
      void blobToText(blob).then(setValue)
      setPdfRenderError(true)
    }
  }, [pdfStore.lastLoadedContent])

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    },
    [],
  )

  const handleChange = (next: string) => {
    setValue(next)
    pdfStore.isModified = true
    if (!pdfStore.wopiConnection) return
    if (pdfStore.wopiFileInfo && !pdfStore.wopiFileInfo.UserCanWrite) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void pdfStore.saveToWopi()
    }, SAVE_DEBOUNCE_MS)
  }

  if (pdfStore.isLoadingError) {
    return (
      <div className="pdf-document-holder pdf-document-holder--error">
        <p>Failed to load PDF: {pdfStore.isLoadingError}</p>
        <button type="button" onClick={() => void pdfStore.detectAndLoadWopi()}>
          Retry
        </button>
      </div>
    )
  }

  if (!pdfStore.isDocReady) {
    return (
      <div className="pdf-document-holder pdf-document-holder--loading">
        <p>Loading PDF...</p>
      </div>
    )
  }

  if (!pdfRenderError && pdfArrayBuffer) {
    return (
      <div
        className="pdf-document-holder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
          height: "100%",
        }}
      >
        <PdfViewer pdfData={pdfArrayBuffer} />
      </div>
    )
  }

  return (
    <div
      className="pdf-document-holder"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        overflow: "hidden",
        height: "100%",
        backgroundColor: "#e8e8e8",
      }}
    >
      <MonacoEditor
        value={value}
        onChange={handleChange}
        language={languageForFile(pdfStore.wopiFileInfo?.BaseFileName ?? "")}
        readOnly={pdfStore.wopiFileInfo ? !pdfStore.wopiFileInfo.UserCanWrite : false}
        editorType="pdf"
      />
    </div>
  )
})
