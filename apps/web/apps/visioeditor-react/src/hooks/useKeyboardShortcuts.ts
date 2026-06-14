import { useEffect } from "react"
import { visioStore } from "../stores/VisioStore"
import { flowchartStore } from "../stores/FlowchartStore"

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault()
          visioStore.zoomIn()
        } else if (e.key === "-") {
          e.preventDefault()
          visioStore.zoomOut()
        } else if (e.key === "0") {
          e.preventDefault()
          visioStore.setZoomLevel(100)
        }
        return
      }

      if (visioStore.editorMode === "flowchart") {
        if (e.key === "Delete" || e.key === "Backspace") {
          if (
            document.activeElement?.tagName === "INPUT" ||
            document.activeElement?.tagName === "TEXTAREA"
          ) {
            return
          }
          e.preventDefault()
          for (const edgeId of flowchartStore.selectedEdgeIds) {
            flowchartStore.removeEdge(edgeId)
          }
          for (const nodeId of flowchartStore.selectedNodeIds) {
            flowchartStore.removeNode(nodeId)
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])
}
