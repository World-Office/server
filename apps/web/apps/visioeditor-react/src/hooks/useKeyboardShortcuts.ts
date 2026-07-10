import { useEffect, useRef } from "react"
import { exportFlowchartAsSvg } from "../components/FlowchartCanvas"
import { flowchartStore } from "../stores/FlowchartStore"
import { visioStore } from "../stores/VisioStore"

function isEditingText(): boolean {
  const tag = document.activeElement?.tagName
  return tag === "INPUT" || tag === "TEXTAREA"
}

export function useKeyboardShortcuts(): void {
  // Debounce save to avoid rapid Ctrl+S spamming
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
          if (visioStore.editorMode === "flowchart") {
            window.dispatchEvent(new CustomEvent("fc-zoom-fit"))
          } else {
            visioStore.setZoomLevel(100)
          }
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
      if (mod && !shift && (e.key === "s" || e.key === "S")) {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          visioStore.save().catch(() => {
            // save errors are logged inside save()
          })
        }, 200)
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
      if (mod && shift && e.key === "ArrowUp") {
        e.preventDefault()
        flowchartStore.bringForward()
        return
      }
      if (mod && shift && e.key === "ArrowDown") {
        e.preventDefault()
        flowchartStore.sendBackward()
        return
      }
      if (e.key === "Escape") {
        flowchartStore.clearSelection()
        return
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])
}
