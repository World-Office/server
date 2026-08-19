import { registerEditorRouter } from "@world-office/editor-common"
import { observer } from "mobx-react-lite"
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { isCanvasFormat } from "../lib/wasm-renderer"
import { createWordCommandHandler } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"
import { CanvasEditor, type CanvasEditorHandle } from "./CanvasEditor"
import { DocumentCanvas } from "./DocumentCanvas"
import { isCollaborationConfigured } from "../lib/collaboration-config"
import { useCanvasCollaboration } from "../hooks/useCanvasCollaboration"

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
    const collaborationEnabled = isCollaborationConfigured()

    // Generate a stable document ID from the filename
    const docId = fileName.split(".")[0] ?? `doc-${Date.now()}`

    const {
      state: collabState,
      sendModelOp,
      sendCursorUpdate,
      remoteCursors,
    } = useCanvasCollaboration({
      editorRef,
      documentId: collaborationEnabled ? docId : undefined,
      username: "User",
      onLocalModelOp: (op) => {
        console.debug("[WasmEditorCanvas] Local ModelOp broadcast:", op.revision)
      },
    })

    useEffect(() => {
      // Register the WASM editor with the command router — the full 78-command
      // bridge (K3): WASM formatting, store toggles, panels, lib functions.
      const handler = createWordCommandHandler({
        editorRef,
        onRichTextCommand: () => {
          /* monaco/text-mode fallback is wired in App.tsx via useWoCommandListener */
        },
      })
      const unregister = registerEditorRouter("doc", handler)

      return () => unregister()
    }, [editorRef])

    const handleModelOp = useCallback(
      (op: unknown, _docHandle: number) => {
        sendModelOp(op)
      },
      [sendModelOp],
    )

    const handleCursorChange = useCallback(
      (_page: number, para: number, charIdx: number, _x: number, _y: number) => {
        sendCursorUpdate({
          kind: "text",
          para,
          run: 0,
          char: charIdx,
        })
      },
      [sendCursorUpdate],
    )

    return (
      <div
        className="de-document-holder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
          height: "100%",
          position: "relative",
        }}
      >
        {collaborationEnabled && collabState !== "disabled" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "4px 12px",
              gap: "6px",
              fontSize: "11px",
              color: collabState === "connected" ? "#2e7d32" : "#999",
              backgroundColor: "#fafafa",
              borderBottom: "1px solid #e0e0e0",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor:
                  collabState === "connected"
                    ? "#2e7d32"
                    : collabState === "connecting"
                      ? "#f57f17"
                      : "#ccc",
                display: "inline-block",
              }}
            />
            {collabState === "connected"
              ? "Collaboration: connected"
              : collabState === "connecting"
                ? "Connecting..."
                : "Offline"}
          </div>
        )}
        <CanvasEditor
          ref={editorRef}
          docBlob={blob}
          fileName={fileName}
          onChange={() => {
            documentStore.markModified()
          }}
          onModelOp={collaborationEnabled ? handleModelOp : undefined}
          onCursorChange={collaborationEnabled ? handleCursorChange : undefined}
        />
        {/* Remote cursor overlay */}
        {collaborationEnabled && collabState === "connected" && remoteCursors.size > 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {Array.from(remoteCursors.values()).map((cursor) => (
              <div
                key={cursor.userId}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 2,
                  height: 20,
                  backgroundColor: cursor.color,
                  transform: "translate(-1px, -20px)",
                  opacity: 0.8,
                  pointerEvents: "none",
                }}
                title={`${cursor.username}`}
              />
            ))}
          </div>
        )}
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
