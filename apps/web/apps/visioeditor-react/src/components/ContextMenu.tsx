import { useCallback, useEffect, useRef, type JSX } from "react"
import { flowchartStore } from "../stores/FlowchartStore"
import { exportFlowchartAsSvg } from "./FlowchartCanvas"

export interface ContextMenuState {
  x: number
  y: number
  type: "node" | "background"
  nodeId?: string
}

interface ContextMenuProps {
  state: ContextMenuState
  onClose: () => void
}

export function ContextMenu({ state, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const run = useCallback(
    (fn: () => void) => {
      fn()
      onClose()
    },
    [onClose],
  )

  const store = flowchartStore

  return (
    <div
      ref={ref}
      className="fc-context-menu"
      style={{ left: state.x, top: state.y }}
    >
      {state.type === "node" && (
        <>
          <button
            className="fc-context-item"
            onClick={() => run(() => store.cutSelection())}
          >
            Cut
          </button>
          <button
            className="fc-context-item"
            onClick={() => run(() => store.copySelection())}
          >
            Copy
          </button>
          <button
            className="fc-context-item"
            onClick={() => run(() => store.duplicateSelection())}
          >
            Duplicate
          </button>
          <div className="fc-context-sep" />
          <button
            className="fc-context-item"
            onClick={() => run(() => { store.bringForward(); store.bringForward() })}
          >
            Bring Forward
          </button>
          <button
            className="fc-context-item"
            onClick={() => run(() => { store.sendBackward(); store.sendBackward() })}
          >
            Send Backward
          </button>
          <button
            className="fc-context-item"
            onClick={() => run(() => store.bringToFront())}
          >
            Bring to Front
          </button>
          <button
            className="fc-context-item"
            onClick={() => run(() => store.sendToBack())}
          >
            Send to Back
          </button>
          <div className="fc-context-sep" />
          <button
            className="fc-context-item fc-context-danger"
            onClick={() => run(() => {
              for (const nid of store.selectedNodeIds) store.removeNode(nid)
              for (const eid of store.selectedEdgeIds) store.removeEdge(eid)
            })}
          >
            Delete
          </button>
        </>
      )}
      {state.type === "background" && (
        <>
          <button
            className="fc-context-item"
            disabled={!store.clipboard}
            onClick={() => run(() => store.paste())}
          >
            Paste
          </button>
          <button
            className="fc-context-item"
            onClick={() => run(() => exportFlowchartAsSvg(store.document))}
          >
            Export SVG
          </button>
          <div className="fc-context-sep" />
          <button
            className="fc-context-item"
            onClick={() => run(() => store.clear())}
          >
            Clear All
          </button>
        </>
      )}
    </div>
  )
}
