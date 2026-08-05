/**
 * DocumentInfoPanel — view and edit document metadata (title, author, subject,
 * keywords, comments). Changes are stored in the DocumentStore and will be
 * written back on save.
 */

import { useState } from "react"
import { documentStore } from "../../../stores/DocumentStore"

interface DocumentInfoPanelProps {
  visible: boolean
}

export function DocumentInfoPanel({ visible }: DocumentInfoPanelProps) {
  const doc = documentStore.document
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc?.title ?? "")
  const [author, setAuthor] = useState(doc?.info?.author ?? "")
  const [subject, setSubject] = useState(doc?.info?.subject ?? "")
  const [keywords, setKeywords] = useState(doc?.info?.keywords ?? "")
  const [comments, setComments] = useState(doc?.info?.comments ?? "")

  // Reset local state when document changes
  function resetFields() {
    setTitle(doc?.title ?? "")
    setAuthor(doc?.info?.author ?? "")
    setSubject(doc?.info?.subject ?? "")
    setKeywords(doc?.info?.keywords ?? "")
    setComments(doc?.info?.comments ?? "")
  }

  function handleSave() {
    if (doc) {
      doc.title = title || "Untitled"
      if (!doc.info) doc.info = {}
      doc.info.author = author || undefined
      doc.info.subject = subject || undefined
      doc.info.keywords = keywords || undefined
      doc.info.comments = comments || undefined
      documentStore.markModified()
    }
    setEditing(false)
  }

  function handleCancel() {
    resetFields()
    setEditing(false)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingRight: 20,
        }}
      >
        <div className="de-file-menu-header">Document Info</div>
        <button
          type="button"
          onClick={() => {
            if (editing) {
              handleCancel()
            } else {
              resetFields()
              setEditing(true)
            }
          }}
          style={{
            padding: "4px 14px",
            border: "1px solid #0078d4",
            borderRadius: 3,
            background: editing ? "#fff" : "#0078d4",
            color: editing ? "#0078d4" : "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      <div className="de-file-menu-info-table">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {/* Title */}
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left" style={{ width: 100 }}>
                <span className="de-file-menu-label">Title:</span>
              </td>
              <td className="de-file-menu-info-right">
                {editing ? (
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "3px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 3,
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <span className="de-file-menu-value">{title || "Untitled"}</span>
                )}
              </td>
            </tr>

            {/* Author */}
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Author:</span>
              </td>
              <td className="de-file-menu-info-right">
                {editing ? (
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "3px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 3,
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <span className="de-file-menu-value">{author || "\u2014"}</span>
                )}
              </td>
            </tr>

            {/* Subject */}
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Subject:</span>
              </td>
              <td className="de-file-menu-info-right">
                {editing ? (
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "3px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 3,
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <span className="de-file-menu-value">{subject || "\u2014"}</span>
                )}
              </td>
            </tr>

            {/* Keywords */}
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Keywords:</span>
              </td>
              <td className="de-file-menu-info-right">
                {editing ? (
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="comma-separated"
                    style={{
                      width: "100%",
                      padding: "3px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 3,
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <span className="de-file-menu-value">{keywords || "\u2014"}</span>
                )}
              </td>
            </tr>

            {/* Comments / description */}
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left" style={{ verticalAlign: "top" }}>
                <span className="de-file-menu-label">Comments:</span>
              </td>
              <td className="de-file-menu-info-right">
                {editing ? (
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "3px 6px",
                      border: "1px solid #ccc",
                      borderRadius: 3,
                      fontSize: 13,
                      resize: "vertical",
                    }}
                  />
                ) : (
                  <span className="de-file-menu-value">{comments || "\u2014"}</span>
                )}
              </td>
            </tr>

            {/* Divider */}
            <tr>
              <td colSpan={2} style={{ borderBottom: "1px solid #e0e0e0", height: 8 }} />
            </tr>

            {/* Read-only metadata */}
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Created:</span>
              </td>
              <td className="de-file-menu-info-right">
                <span className="de-file-menu-value">{doc?.info?.created ?? "\u2014"}</span>
              </td>
            </tr>
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Modified:</span>
              </td>
              <td className="de-file-menu-info-right">
                <span className="de-file-menu-value">{doc?.info?.modified ?? "\u2014"}</span>
              </td>
            </tr>
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Type:</span>
              </td>
              <td className="de-file-menu-info-right">
                <span className="de-file-menu-value">{doc?.fileType ?? "\u2014"}</span>
              </td>
            </tr>
            <tr className="de-file-menu-info-row">
              <td className="de-file-menu-info-left">
                <span className="de-file-menu-label">Size:</span>
              </td>
              <td className="de-file-menu-info-right">
                <span className="de-file-menu-value">
                  {doc?.info?.pageCount ? `${doc.info.pageCount} pages` : "\u2014"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Save / Cancel buttons when editing */}
      {editing && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "6px 20px",
              border: "none",
              borderRadius: 3,
              background: "#0078d4",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: "6px 20px",
              border: "1px solid #ccc",
              borderRadius: 3,
              background: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
