import { observer } from "mobx-react-lite"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { isCanvasFormat } from "../lib/wasm-renderer"
import { documentStore } from "../stores/DocumentStore"
import { DocumentCanvas } from "./DocumentCanvas"
import { RichTextEditor } from "./RichTextEditor"
import { useSpellcheck } from "../lib/spellcheck-context"

const MonacoEditor = lazy(() => import("./MonacoEditor").then((m) => ({ default: m.MonacoEditor })))

const SAVE_DEBOUNCE_MS = 1500

function languageForFile(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (ext === "txt" || ext === "md") return "plaintext"
  if (ext === "json") return "json"
  if (ext === "html" || ext === "htm") return "html"
  if (ext === "rtf") return "plaintext"
  return "xml"
}

async function blobToText(blob: Blob): Promise<string> {
  return await blob.text()
}

export const DocumentHolder = observer(function DocumentHolder() {
  const [value, setValue] = useState<string>("")
  const lastBlobRef = useRef<Blob | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spellcheck = useSpellcheck()

  const fileName = documentStore.fileName ?? ""
  const blob = documentStore.lastLoadedContent
  const editorType = documentStore.editorType
  const useCanvas = blob !== undefined && isCanvasFormat(fileName)

  // Document loading is handled by useDocumentLoader in App.tsx

  useEffect(() => {
    if (editorType !== "monaco") return
    const currentBlob = documentStore.lastLoadedContent
    if (!currentBlob || currentBlob === lastBlobRef.current) return
    lastBlobRef.current = currentBlob
    void blobToText(currentBlob).then(setValue)
  }, [editorType])

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    },
    [],
  )

  const handleChange = (next: string) => {
    setValue(next)
    documentStore.isModified = true
    if (!documentStore.wopiConnection) return
    if (documentStore.wopiFileInfo && !documentStore.wopiFileInfo.UserCanWrite) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void documentStore.saveToWopi()
    }, SAVE_DEBOUNCE_MS)
  }

  const handleRichTextChange = (html: string) => {
    documentStore.updateRichText(html)
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    documentStore.setWordCount(text ? text.split(/\s+/).length : 0)
    if (!documentStore.wopiConnection) return
    if (documentStore.wopiFileInfo && !documentStore.wopiFileInfo.UserCanWrite) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void documentStore.saveToWopi()
    }, SAVE_DEBOUNCE_MS)
  }

  if (documentStore.loadError) {
    return (
      <div className="de-document-holder de-document-holder--error">
        <p>Failed to load document: {documentStore.loadError}</p>
        <button type="button" onClick={() => void documentStore.detectAndLoadWopi()}>
          Retry
        </button>
      </div>
    )
  }

  if (!documentStore.isDocReady) {
    return (
      <div className="de-document-holder de-document-holder--loading">
        <p>Loading document...</p>
      </div>
    )
  }

  if (editorType === "richtext") {
    return (
      <div
        className="de-document-holder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
          height: "100%",
          backgroundColor: "#e8e8e8",
        }}
      >
        <RichTextEditor html={documentStore.richTextHtml ?? ""} onChange={handleRichTextChange} spellchecker={spellcheck.spellchecker} />
      </div>
    )
  }

  if (editorType === "monaco" && blob) {
    return (
      <div
        className="de-document-holder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
          height: "100%",
          backgroundColor: "#e8e8e8",
        }}
      >
        <Suspense fallback={<div>Loading editor...</div>}>
          <MonacoEditor
            value={value}
            onChange={handleChange}
            language={languageForFile(fileName)}
            readOnly={documentStore.wopiFileInfo ? !documentStore.wopiFileInfo.UserCanWrite : false}
            editorType="document"
          />
        </Suspense>
      </div>
    )
  }

  if (useCanvas && blob) {
    return (
      <div
        className="de-document-holder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
          height: "100%",
        }}
      >
        <DocumentCanvas blob={blob} fileName={fileName} />
      </div>
    )
  }

  return (
    <div
      className="de-document-holder"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        overflow: "hidden",
        height: "100%",
        backgroundColor: "#e8e8e8",
      }}
    >
      <Suspense fallback={<div>Loading editor...</div>}>
        <MonacoEditor
          value={value}
          onChange={handleChange}
          language={languageForFile(fileName)}
          readOnly={documentStore.wopiFileInfo ? !documentStore.wopiFileInfo.UserCanWrite : false}
          editorType="document"
        />
      </Suspense>
    </div>
  )
})
