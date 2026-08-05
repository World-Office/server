/**
 * MailMergePanel — right menu panel for managing mail merge data sources,
 * inserting merge fields, previewing records, and merging to a new document.
 */

import { useEffect, useRef, useState } from "react"
import {
  type MailMergeData,
  extractMergeFields,
  mailMergeState,
  mergeAllRecords,
  parseCsv,
  previewMerge,
  resetMailMerge,
} from "../lib/mail-merge"
import { getActiveRichTextEditor } from "../lib/rte-command"

interface MailMergePanelProps {
  visible: boolean
  onInsertMergeField: (fieldName: string) => void
  onMergeComplete: (mergedHtml: string) => void
}

export function MailMergePanel({
  visible,
  onInsertMergeField,
  onMergeComplete,
}: MailMergePanelProps) {
  const [data, setData] = useState<MailMergeData>({ fields: [], records: [] })
  const [csvText, setCsvText] = useState("")
  const [currentIdx, setCurrentIdx] = useState(0)
  const [docFields, setDocFields] = useState<string[]>([])
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-scan doc fields when panel opens
  useEffect(() => {
    if (visible) {
      const editor = getActiveRichTextEditor()
      if (editor) {
        const fields = extractMergeFields(editor.getHTML())
        setDocFields(fields)
      }
      setData(mailMergeState.data)
    }
  }, [visible])

  function handleCsvChange(text: string) {
    setCsvText(text)
    setError(null)
    try {
      const parsed = parseCsv(text)
      setData(parsed)
      mailMergeState.data = parsed
      if (parsed.records.length === 0) {
        setError("No records found. Make sure your CSV has a header row.")
      }
    } catch (e) {
      setError(`Failed to parse CSV: ${(e as Error).message}`)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      setCsvText(text)
      handleCsvChange(text)
    }
    reader.readAsText(file)
  }

  function handleInsertField(field: string) {
    onInsertMergeField(field)
    // Refresh doc fields after insertion
    setTimeout(() => {
      const editor = getActiveRichTextEditor()
      if (editor) {
        setDocFields(extractMergeFields(editor.getHTML()))
      }
    }, 100)
  }

  function handlePreview(idx: number) {
    const editor = getActiveRichTextEditor()
    if (!editor || !data.records[idx]) return
    setCurrentIdx(idx)
    const html = previewMerge(editor.getHTML(), data.records[idx])
    setPreviewHtml(html)
  }

  function handleMergeToNew() {
    const editor = getActiveRichTextEditor()
    if (!editor || data.records.length === 0) return
    const html = mergeAllRecords(editor.getHTML(), data)
    onMergeComplete(html)
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: "absolute",
        right: 48,
        top: 0,
        width: 320,
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Mail Merge</span>
        <button
          type="button"
          onClick={resetMailMerge}
          style={{
            padding: "2px 8px",
            border: "1px solid #ccc",
            borderRadius: 3,
            background: "#fff",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* ── Data Source ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, color: "#555" }}>
            Data Source
          </div>
          <textarea
            value={csvText}
            onChange={(e) => handleCsvChange(e.target.value)}
            placeholder={
              "Paste CSV here\u2026\nFirstName,LastName,Email\nJohn,Doe,john@example.com\nJane,Smith,jane@example.com"
            }
            rows={5}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #ccc",
              borderRadius: 3,
              fontSize: 12,
              fontFamily: "monospace",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: 4 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "3px 10px",
                border: "1px solid #0078d4",
                borderRadius: 3,
                background: "#fff",
                color: "#0078d4",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Upload CSV
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "6px 10px",
              background: "#fff0f0",
              border: "1px solid #ecc",
              borderRadius: 3,
              color: "#c00",
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Fields Summary ── */}
        {data.fields.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: "#555" }}>
              Available Fields ({data.fields.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {data.fields.map((field: string) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => handleInsertField(field)}
                  style={{
                    padding: "2px 8px",
                    border: "1px solid #6a6aff",
                    borderRadius: 3,
                    background: "#eef",
                    color: "#6a6aff",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  + {field}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Records ── */}
        {data.records.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: "#555" }}>
              Records ({data.records.length})
            </div>
            <div
              style={{
                maxHeight: 160,
                overflowY: "auto",
                border: "1px solid #e0e0e0",
                borderRadius: 3,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    {data.fields.slice(0, 3).map((f: string) => (
                      <th
                        key={f}
                        style={{
                          padding: "4px 6px",
                          borderBottom: "1px solid #ddd",
                          textAlign: "left",
                          fontWeight: 600,
                        }}
                      >
                        {f}
                      </th>
                    ))}
                    <th
                      style={{
                        padding: "4px 6px",
                        borderBottom: "1px solid #ddd",
                        width: 40,
                      }}
                    >
                      P
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((rec: Record<string, string>, idx: number) => (
                    <tr
                      key={JSON.stringify(rec).slice(0, 20)}
                      style={{
                        background: idx === currentIdx ? "#e8f4ff" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => handlePreview(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePreview(idx)
                      }}
                      tabIndex={0}
                    >
                      {data.fields.slice(0, 3).map((f: string) => (
                        <td
                          key={f}
                          style={{
                            padding: "3px 6px",
                            borderBottom: "1px solid #f0f0f0",
                            maxWidth: 80,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {rec[f] || "\u2014"}
                        </td>
                      ))}
                      <td
                        style={{
                          padding: "3px 6px",
                          borderBottom: "1px solid #f0f0f0",
                          textAlign: "center",
                        }}
                      >
                        {idx === currentIdx ? "\u25B6" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Doc Fields ── */}
        {docFields.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: "#555" }}>
              Fields in Document
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {docFields.map((f: string) => (
                <span
                  key={f}
                  style={{
                    padding: "2px 6px",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    background: "#fafafa",
                    fontSize: 11,
                    color: data.fields.includes(f) ? "#363" : "#999",
                    fontWeight: 600,
                  }}
                >
                  {data.fields.includes(f) ? "\u2713 " : ""}
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        {data.records.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              onClick={handleMergeToNew}
              disabled={data.records.length === 0}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 3,
                background: data.records.length > 0 ? "#0078d4" : "#ccc",
                color: "#fff",
                cursor: data.records.length > 0 ? "pointer" : "not-allowed",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Merge to New Document ({data.records.length} records)
            </button>
            <button
              type="button"
              onClick={() => setPreviewHtml(null)}
              style={{
                padding: "6px 12px",
                border: "1px solid #ccc",
                borderRadius: 3,
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Clear Preview
            </button>
          </div>
        )}
      </div>

      {/* ── Preview Overlay ── */}
      {previewHtml && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "#fff",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #e0e0e0",
              fontWeight: 600,
              fontSize: 12,
              background: "#f8f9fa",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              Preview — Record {currentIdx + 1} of {data.records.length}
            </span>
            <button
              type="button"
              onClick={() => setPreviewHtml(null)}
              style={{
                padding: "2px 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 16,
                color: "#888",
              }}
            >
              &times;
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 12, fontSize: 13, lineHeight: 1.5 }}>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: preview HTML is generated from user's own merge data, sanitized by DOMPurify in buildPreview */}
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid #e0e0e0",
              display: "flex",
              gap: 6,
            }}
          >
            <button
              type="button"
              disabled={currentIdx <= 0}
              onClick={() => handlePreview(currentIdx - 1)}
              style={{
                padding: "4px 12px",
                border: "1px solid #ccc",
                borderRadius: 3,
                background: "#fff",
                cursor: currentIdx > 0 ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentIdx >= data.records.length - 1}
              onClick={() => handlePreview(currentIdx + 1)}
              style={{
                padding: "4px 12px",
                border: "1px solid #ccc",
                borderRadius: 3,
                background: "#fff",
                cursor: currentIdx < data.records.length - 1 ? "pointer" : "not-allowed",
                fontSize: 12,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
