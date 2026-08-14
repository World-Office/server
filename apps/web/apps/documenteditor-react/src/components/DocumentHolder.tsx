import { registerEditorRouter } from "@world-office/editor-common"
import { observer } from "mobx-react-lite"
import { Suspense, lazy, useEffect, useRef, useState } from "react"
import { isCanvasFormat } from "../lib/wasm-renderer"
import { documentStore } from "../stores/DocumentStore"
import { CanvasEditor, type CanvasEditorHandle } from "./CanvasEditor"
import { DocumentCanvas } from "./DocumentCanvas"

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

interface DocumentHolderProps {
  embedded?: boolean
}

/** Helper component: WASM CanvasEditor with formatting event listener. */
const WasmEditorCanvas = observer(
  ({
    blob,
    fileName,
    editorRef,
  }: {
    blob: Blob
    fileName: string
    editorRef: React.RefObject<CanvasEditorHandle | null>
  }) => {
    useEffect(() => {
      // Register the WASM editor with the command router
      const unregister = registerEditorRouter("doc", (cmd) => {
        const command = cmd.command
        const value = cmd.value

        // Map toolbar formatting commands to WASM format JSON
        let format: Record<string, unknown> | null = null
        if (command === "bold") format = { bold: true }
        else if (command === "italic") format = { italic: true }
        else if (command === "underline") format = { underline: value ?? "single" }
        else if (command === "strikethrough") format = { strikethrough: true }
        else if (command === "fontSize" && value)
          format = { fontSize: Number.parseInt(value as string, 10) * 2 }
        else if (command === "fontFamily" && value) format = { fontName: value }
        else if (command === "textColor" && value) format = { textColor: value }
        else if (command === "highlight" && value) format = { highlight: value }
        else if (command === "highlightColor" && value) format = { highlight: value }

        if (format) {
          editorRef.current?.applyFormatting(format)
        }
      })

      return () => unregister()
    }, [editorRef])

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
        <CanvasEditor
          ref={editorRef}
          docBlob={blob}
          fileName={fileName}
          onChange={() => {
            documentStore.markModified()
          }}
        />
      </div>
    )
  },
)

export const DocumentHolder = observer(function DocumentHolder({ embedded }: DocumentHolderProps) {
  const [value, setValue] = useState<string>("")
  const lastBlobRef = useRef<Blob | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fileName = documentStore.fileName ?? ""
  const blob = documentStore.lastLoadedContent
  const editorType = documentStore.editorType
  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null)
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

  const handleChange = embedded
    ? (next: string) => {
        setValue(next)
        documentStore.updateMonacoContent(next)
      }
    : (next: string) => {
        setValue(next)
        documentStore.updateMonacoContent(next)
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
    // Canvas-native rendering (canvas/OOXML via WASM). CanvasEditor loads
    // the wasm itself; no TipTap fallback — TipTap was removed (A1).
    if (blob) {
      return <WasmEditorCanvas blob={blob} fileName={fileName} editorRef={canvasEditorRef} />
    }
    return (
      <div className="de-document-holder de-document-holder--loading">
        <p>Loading document...</p>
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
