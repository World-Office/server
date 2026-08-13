import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { pdfStore } from "../../stores/PdfStore"
import type { PdfAnnotation } from "../../stores/PdfStore"
import { AnnotationEditor } from "../AnnotationEditor"

interface Props {
  visible: boolean
}

function AnnotationPanelInner({ visible }: Props): JSX.Element | null {
  const annotations = pdfStore.annotations
  const currentPage = pdfStore.currentPage + 1

  const pageAnnotations = annotations.filter((a) => a.page === currentPage)

  if (!visible) return null

  const dispatchCommand = (command: string, value?: string | object) => {
    window.dispatchEvent(
      new CustomEvent("wo-command", {
        detail: { command, value },
      }),
    )
  }

  const handleAdd = () => {
    dispatchCommand("addAnnotation", "<p>New annotation</p>")
  }

  return (
    <div
      className="pdf-annotation-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, height: "100%" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Annotations</h3>
        <button
          type="button"
          onClick={handleAdd}
          style={{
            padding: "4px 12px",
            fontSize: 12,
            background: "#f59e0b",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          + New
        </button>
      </div>

      {pageAnnotations.length === 0 && (
        <p style={{ fontSize: 12, color: "#888", margin: 0 }}>No annotations on this page</p>
      )}

      {pageAnnotations.map((annot: PdfAnnotation) => (
        <div
          key={annot.id}
          style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "4px 8px",
              background: "#f5f5f5",
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 500 }}>{annot.id.slice(0, 12)}</span>
            <button
              type="button"
              onClick={() => dispatchCommand("removeAnnotation", annot.id)}
              style={{
                background: "none",
                border: "none",
                color: "#d32f2f",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ padding: 8 }}>
            <AnnotationEditor
              value={annot.text ?? ""}
              onChange={(html: string) => {
                dispatchCommand("updateAnnotation", { id: annot.id, text: html })
              }}
            />
          </div>
          <div style={{ padding: "4px 8px", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#a855f7"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  dispatchCommand("setAnnotationColor", { id: annot.id, color: c })
                }}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: c,
                  border: c === annot.color ? "2px solid #333" : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export const AnnotationPanel = observer(AnnotationPanelInner)
