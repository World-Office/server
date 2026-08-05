/**
 * CrossReferencePanel — right menu panel to insert and manage cross-references.
 *
 * Shows all available targets (headings, captions, footnotes, section breaks),
 * lets the user pick a format (text, number, above/below), and inserts a
 * cross-reference at the cursor position.
 */

import { useEffect, useState } from "react"
import { type CrossRefFormat, type CrossRefTarget, collectTargets } from "../lib/cross-ref"
import { getActiveRichTextEditor } from "../lib/rte-command"

interface CrossReferencePanelProps {
  visible: boolean
  onInsertCrossReference: (targetId: string, format: CrossRefFormat, display: string) => void
}

export function CrossReferencePanel({ visible, onInsertCrossReference }: CrossReferencePanelProps) {
  const [targets, setTargets] = useState<CrossRefTarget[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>("")
  const [format, setFormat] = useState<CrossRefFormat>("text")
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    if (visible) {
      const editor = getActiveRichTextEditor()
      if (editor) {
        const all = collectTargets(editor)
        setTargets(all)
      }
    }
  }, [visible])

  if (!visible) return null

  const filtered = filter === "all" ? targets : targets.filter((t) => t.type === filter)

  function handleInsert() {
    if (!selectedTarget) return
    const target = targets.find((t) => t.id === selectedTarget)
    if (!target) return

    let display = target.displayText
    if (format === "number") {
      const parts = selectedTarget.split("-")
      display = parts[parts.length - 1]
    } else if (format === "aboveBelow") {
      display = ""
    }

    onInsertCrossReference(selectedTarget, format, display)
  }

  return (
    <div
      style={{
        position: "absolute",
        right: 48,
        top: 0,
        width: 300,
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          fontWeight: 600,
          fontSize: 14,
          background: "#f8f9fa",
        }}
      >
        Cross-Reference
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* Filter tabs */}
        <div style={{ marginBottom: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["all", "heading", "caption", "footnote", "section"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 10px",
                border: `1px solid ${filter === f ? "#0078d4" : "#ccc"}`,
                borderRadius: 12,
                background: filter === f ? "#0078d4" : "#f5f5f5",
                color: filter === f ? "#fff" : "#333",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: filter === f ? 600 : 400,
              }}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Target list */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: "#555" }}>
            Target ({filtered.length})
          </div>
          <div
            style={{
              maxHeight: 240,
              overflowY: "auto",
              border: "1px solid #e0e0e0",
              borderRadius: 3,
            }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "12px 8px",
                  textAlign: "center",
                  color: "#999",
                  fontSize: 12,
                }}
              >
                No {filter === "all" ? "" : filter} targets found.
                <br />
                Add headings or captions first.
              </div>
            ) : (
              filtered.map((target) => (
                <label
                  key={target.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 8px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f0f0f0",
                    background: selectedTarget === target.id ? "#e8f4ff" : "transparent",
                    fontSize: 12,
                  }}
                >
                  <input
                    type="radio"
                    name="crossRefTarget"
                    checked={selectedTarget === target.id}
                    onChange={() => setSelectedTarget(target.id)}
                  />
                  <span
                    style={{
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#fff",
                      background:
                        target.type === "heading"
                          ? "#0078d4"
                          : target.type === "caption"
                            ? "#2ecc71"
                            : target.type === "footnote"
                              ? "#e67e22"
                              : "#9b59b6",
                    }}
                  >
                    {target.type === "heading"
                      ? "H"
                      : target.type === "caption"
                        ? "C"
                        : target.type === "footnote"
                          ? "F"
                          : "S"}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {target.displayText}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Format */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: "#555" }}>
            Format
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(
              [
                ["text", "Text"],
                ["number", "Number"],
                ["aboveBelow", "Above/Below"],
              ] as [CrossRefFormat, string][]
            ).map(([val, label]) => (
              <label
                key={val}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  border: `1px solid ${format === val ? "#0078d4" : "#ccc"}`,
                  borderRadius: 3,
                  background: format === val ? "#e8f4ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <input
                  type="radio"
                  name="crossRefFormat"
                  checked={format === val}
                  onChange={() => setFormat(val)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Insert button */}
        <button
          type="button"
          onClick={handleInsert}
          disabled={!selectedTarget}
          style={{
            width: "100%",
            padding: "8px 16px",
            border: "none",
            borderRadius: 3,
            background: selectedTarget ? "#0078d4" : "#ccc",
            color: "#fff",
            cursor: selectedTarget ? "pointer" : "not-allowed",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Insert Cross-Reference
        </button>
      </div>
    </div>
  )
}
