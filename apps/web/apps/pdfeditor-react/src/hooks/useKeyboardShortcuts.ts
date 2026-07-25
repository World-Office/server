import { useEffect } from "react"
import { pdfStore } from "../stores/PdfStore"

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "=":
          case "+":
            e.preventDefault()
            pdfStore.zoomIn()
            break
          case "-":
            e.preventDefault()
            pdfStore.zoomOut()
            break
          case "0":
            e.preventDefault()
            pdfStore.setZoomLevel(100)
            break
          case "s":
            e.preventDefault()
            void pdfStore.saveToWopi()
            break
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])
}
