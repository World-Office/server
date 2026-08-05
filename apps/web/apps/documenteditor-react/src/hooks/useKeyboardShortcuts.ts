import { useEffect } from "react"
import { openFile, saveFileToPath } from "../bridge/file-operations"
import { documentStore } from "../stores/DocumentStore"

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault()
          documentStore.zoomIn()
        } else if (e.key === "-") {
          e.preventDefault()
          documentStore.zoomOut()
        } else if (e.key === "0") {
          e.preventDefault()
          documentStore.setZoomLevel(100)
        } else if (e.key === "s") {
          e.preventDefault()
          handleSave()
        } else if (e.key === "o") {
          e.preventDefault()
          handleOpen()
        } else if (e.key === "p") {
          e.preventDefault()
          handlePrint()
        }
      }
    }

    async function handleSave(): Promise<void> {
      if (documentStore.wopiConnection) {
        await documentStore.saveToWopi().catch(console.error)
        return
      }
      if (!documentStore.isDesktop) return
      // Build the document content and write it to the file path
      if (documentStore.filePath) {
        try {
          const blob = await documentStore.buildDocumentBlob()
          const text = await blob.text()
          await saveFileToPath(documentStore.filePath, text)
          documentStore.markSaved()
        } catch (err) {
          console.error("Desktop save failed:", err)
        }
      } else {
        documentStore.setActiveTab("file")
        documentStore.setActiveFileMenuPanel("saveas")
      }
    }

    async function handleOpen(): Promise<void> {
      if (!documentStore.isDesktop) return
      const result = await openFile()
      if (result) {
        documentStore.setFilePath(result.path)
        documentStore.setDirty(false)
      }
    }

    function handlePrint(): void {
      if (!documentStore.isDesktop) return
      window.print()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])
}
