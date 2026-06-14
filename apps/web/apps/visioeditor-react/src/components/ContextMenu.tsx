import { useCallback, useEffect, useRef, useState, type JSX } from "react"
import { flowchartStore, THEMES } from "../stores/FlowchartStore"
import { exportFlowchartAsSvg, exportFlowchartAsPng, exportFlowchartAsPdf } from "./FlowchartCanvas"

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
  const [submenu, setSubmenu] = useState<string | null>(null)

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
      if (e.key === "Escape") { onClose(); setSubmenu(null) }
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
  const multiSelected = store.selectedNodeIds.length >= 2

  if (submenu === "theme") {
    return (
      <div ref={ref} className="fc-context-menu" style={{ left: state.x, top: state.y }}>
        {THEMES.map((t) => (
          <button key={t.id} className="fc-context-item" onClick={() => run(() => store.applyTheme(t.id))}>
            {store.currentThemeId === t.id ? "\u2713 " : ""}{t.name}
          </button>
        ))}
        <div className="fc-context-sep" />
        <button className="fc-context-item" onClick={() => setSubmenu(null)}>Back</button>
      </div>
    )
  }

  if (submenu === "align") {
    return (
      <div ref={ref} className="fc-context-menu" style={{ left: state.x, top: state.y }}>
        <button className="fc-context-item" onClick={() => run(() => store.alignLeft())}>Align Left</button>
        <button className="fc-context-item" onClick={() => run(() => store.alignRight())}>Align Right</button>
        <button className="fc-context-item" onClick={() => run(() => store.alignTop())}>Align Top</button>
        <button className="fc-context-item" onClick={() => run(() => store.alignBottom())}>Align Bottom</button>
        <button className="fc-context-item" onClick={() => run(() => store.alignCenter())}>Align Center</button>
        <button className="fc-context-item" onClick={() => run(() => store.alignMiddle())}>Align Middle</button>
        <div className="fc-context-sep" />
        <button className="fc-context-item" onClick={() => run(() => store.distributeHorizontally())}>Distribute Horizontally</button>
        <button className="fc-context-item" onClick={() => run(() => store.distributeVertically())}>Distribute Vertically</button>
        <div className="fc-context-sep" />
        <button className="fc-context-item" onClick={() => run(() => store.makeEqualWidth())}>Make Equal Width</button>
        <button className="fc-context-item" onClick={() => run(() => store.makeEqualHeight())}>Make Equal Height</button>
        <div className="fc-context-sep" />
        <button className="fc-context-item" onClick={() => setSubmenu(null)}>Back</button>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="fc-context-menu"
      style={{ left: state.x, top: state.y }}
    >
      {state.type === "node" && (
        <>
          <button className="fc-context-item" onClick={() => run(() => store.cutSelection())}>Cut</button>
          <button className="fc-context-item" onClick={() => run(() => store.copySelection())}>Copy</button>
          <button className="fc-context-item" onClick={() => run(() => store.duplicateSelection())}>Duplicate</button>
          {multiSelected && (
            <>
              <div className="fc-context-sep" />
              <button className="fc-context-item" onClick={() => setSubmenu("align")}>Align &rarr;</button>
            </>
          )}
          <div className="fc-context-sep" />
          <button className="fc-context-item" onClick={() => run(() => { store.bringForward(); store.bringForward() })}>Bring Forward</button>
          <button className="fc-context-item" onClick={() => run(() => { store.sendBackward(); store.sendBackward() })}>Send Backward</button>
          <button className="fc-context-item" onClick={() => run(() => store.bringToFront())}>Bring to Front</button>
          <button className="fc-context-item" onClick={() => run(() => store.sendToBack())}>Send to Back</button>
          <div className="fc-context-sep" />
          <button className="fc-context-item fc-context-danger" onClick={() => run(() => {
            for (const nid of store.selectedNodeIds) store.removeNode(nid)
            for (const eid of store.selectedEdgeIds) store.removeEdge(eid)
          })}>Delete</button>
        </>
      )}
      {state.type === "background" && (
        <>
          <button className="fc-context-item" disabled={!store.clipboard} onClick={() => run(() => store.paste())}>Paste</button>
          <div className="fc-context-sep" />
          <button className="fc-context-item" onClick={() => setSubmenu("theme")}>Theme &rarr;</button>
          <div className="fc-context-sep" />
          <button className="fc-context-item" onClick={() => run(() => exportFlowchartAsSvg(store.document))}>Export SVG</button>
          <button className="fc-context-item" onClick={() => run(() => exportFlowchartAsPng(store.document))}>Export PNG</button>
          <button className="fc-context-item" onClick={() => run(() => exportFlowchartAsPdf(store.document))}>Export PDF</button>
          <div className="fc-context-sep" />
          <button className="fc-context-item" onClick={() => run(() => store.autoLayout())}>Auto Layout</button>
          <div className="fc-context-sep" />
          <button className="fc-context-item" onClick={() => run(() => store.clear())}>Clear All</button>
        </>
      )}
    </div>
  )
}
