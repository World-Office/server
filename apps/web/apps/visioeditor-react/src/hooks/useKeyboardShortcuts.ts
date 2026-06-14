import { useEffect } from "react"
import { visioStore } from "../stores/VisioStore"
import { flowchartStore } from "../stores/FlowchartStore"
import { exportFlowchartAsSvg } from "../components/FlowchartCanvas"

function isEditingText(): boolean {
  const tag = document.activeElement?.tagName
  return tag === "INPUT" || tag === "TEXTAREA"
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey
      const shift = e.shiftKey

      if (mod) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault()
          visioStore.zoomIn()
          return
        }
        if (e.key === "-") {
          e.preventDefault()
          visioStore.zoomOut()
          return
        }
        if (e.key === "0") {
          e.preventDefault()
          visioStore.setZoomLevel(100)
          return
        }
      }

      if (visioStore.editorMode !== "flowchart") return
      if (isEditingText()) return

      if (mod && !shift && e.key === "z") {
        e.preventDefault()
        flowchartStore.undo()
        return
      }
      if (mod && shift && e.key === "z") {
        e.preventDefault()
        flowchartStore.redo()
        return
      }
      if (mod && !shift && e.key === "c") {
        e.preventDefault()
        flowchartStore.copySelection()
        return
      }
      if (mod && !shift && e.key === "x") {
        e.preventDefault()
        flowchartStore.cutSelection()
        return
      }
      if (mod && !shift && e.key === "v") {
        e.preventDefault()
        flowchartStore.paste()
        return
      }
      if (mod && !shift && e.key === "d") {
        e.preventDefault()
        flowchartStore.duplicateSelection()
        return
      }
      if (mod && shift && (e.key === "e" || e.key === "E")) {
        e.preventDefault()
        exportFlowchartAsSvg(flowchartStore.document)
        return
      }
      if (mod && shift && (e.key === "g" || e.key === "G")) {
        e.preventDefault()
        flowchartStore.toggleSnapToGrid()
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        for (const edgeId of flowchartStore.selectedEdgeIds) {
          flowchartStore.removeEdge(edgeId)
        }
        for (const nodeId of flowchartStore.selectedNodeIds) {
          flowchartStore.removeNode(nodeId)
        }
        return
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])
}
