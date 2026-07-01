import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { documentStore } from "../stores/DocumentStore"
import { MonacoEditor } from "./MonacoEditor"

const SAVE_DEBOUNCE_MS = 1500

function languageForFile(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (ext === "txt" || ext === "md") return "plaintext"
  if (ext === "json") return "json"
  if (ext === "html" || ext === "htm") return "html"
  if (ext === "rtf") return "plaintext"
  // .odt, .docx, .fodt are zipped XML; surface as xml for Monaco syntax highlighting
  return "xml"
}

async function blobToText(blob: Blob): Promise<string> {
  return await blob.text()
}

export const DocumentHolder = observer(function DocumentHolder() {
  const [value, setValue] = useState<string>("")
  const lastBlobRef = useRef<Blob | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    void documentStore.detectAndLoadWopi()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger when the WOPI-loaded blob changes so we re-render the editor
  useEffect(() => {
    const blob = documentStore.lastLoadedContent
    if (!blob || blob === lastBlobRef.current) return
    lastBlobRef.current = blob
    void blobToText(blob).then(setValue)
  }, [documentStore.lastLoadedContent])

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
      <MonacoEditor
        value={value}
        onChange={handleChange}
        language={languageForFile(documentStore.fileName ?? "")}
        readOnly={documentStore.wopiFileInfo ? !documentStore.wopiFileInfo.UserCanWrite : false}
        editorType="document"
      />
    </div>
  )
})
