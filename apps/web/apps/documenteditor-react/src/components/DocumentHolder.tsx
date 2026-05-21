import { observer } from "mobx-react-lite"
import { useEffect, useRef } from "react"
import { useSdkCallback } from "@world-office/sdk-bridge"
import { createCursorUpdate } from "@world-office/collaboration-client"
import { documentStore } from "../stores/DocumentStore"
import { collaborationStore } from "../lib/collaboration"
import { collabSendRef, currentUser } from "../lib/collaboration"
import { getTotalPages, init, renderPage, setTotalPages } from "../lib/wasm-renderer"

const DEMO_PAGE_COUNT = 3

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const initialized = useRef(false)

  // Initialize renderer once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true

    init(canvas)
    setTotalPages(DEMO_PAGE_COUNT)
    documentStore.setTotalPages(DEMO_PAGE_COUNT)
    renderPage(documentStore.currentPage, documentStore.zoomLevel)
  }, [])

  // Re-render when page or zoom changes
  useEffect(() => {
    if (!initialized.current) return
    renderPage(documentStore.currentPage, documentStore.zoomLevel)
  }, [documentStore.currentPage, documentStore.zoomLevel])

  const totalPages = getTotalPages()
  const canPrev = documentStore.currentPage > 0
  const canNext = documentStore.currentPage < totalPages - 1

  useSdkCallback("asc_onFocusObject", (objects) => {
    const sender = collabSendRef.send
    if (!sender || objects.length === 0) return

    const sel = objects[0]
    const val = sel.get_ObjectValue()
    if (!val) return

    const page = documentStore.currentPage
    const x = 100
    const y = 100

    const update = createCursorUpdate({
      session_id: collaborationStore.sessionId ?? "",
      user_id: currentUser.id,
      username: currentUser.username,
      color: "#3498DB",
      cursor_position: { page, x, y },
    })
    sender(update)
  })

  const remoteCursors = Array.from(collaborationStore.remoteCursors.entries())

  return (
    <div className="de-document-holder" style={{ display: "flex", flexDirection: "column", alignItems: "center", overflow: "auto", height: "100%", backgroundColor: "#e8e8e8" }}>
      {/* Canvas container with shadow */}
      <div style={{ margin: "16px auto", flexShrink: 0, display: "flex", justifyContent: "center", position: "relative" }}>
        <canvas
          ref={canvasRef}
          className="de-document-canvas"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)" }}
        />
        
        {remoteCursors.map(([uid, cursor]) => {
          const user = collaborationStore.users.find((u) => u.id === uid)
          return (
            <div
              key={uid}
              style={{
                position: "absolute",
                left: cursor.x,
                top: cursor.y,
                pointerEvents: "none",
              }}
            >
              <div style={{
                width: 2,
                height: 16,
                backgroundColor: user?.color ?? "#3498DB",
                position: "absolute",
              }} />
              <div style={{
                position: "absolute",
                top: -18,
                left: 2,
                backgroundColor: user?.color ?? "#3498DB",
                color: "#fff",
                fontSize: 10,
                padding: "1px 4px",
                borderRadius: 3,
                whiteSpace: "nowrap",
              }}>
                {user?.name ?? uid}
              </div>
            </div>
          )
        })}
      </div>

      {/* Page navigation controls */}
      <div className="de-page-nav" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", flexShrink: 0 }}>
        <button
          type="button"
          className="de-page-nav-btn"
          disabled={!canPrev}
          onClick={() => documentStore.setCurrentPage(documentStore.currentPage - 1)}
          aria-label="Previous page"
          style={{
            padding: "4px 10px",
            cursor: canPrev ? "pointer" : "default",
            opacity: canPrev ? 1 : 0.4,
            border: "1px solid #ccc",
            borderRadius: "3px",
            background: "#fff",
            fontSize: "13px",
          }}
        >
          ‹ Prev
        </button>

        <span
          className="de-page-nav-label"
          style={{ fontSize: "12px", color: "#555", minWidth: "70px", textAlign: "center" }}
        >
          Page {documentStore.currentPage + 1} of {totalPages}
        </span>

        <button
          type="button"
          className="de-page-nav-btn"
          disabled={!canNext}
          onClick={() => documentStore.setCurrentPage(documentStore.currentPage + 1)}
          aria-label="Next page"
          style={{
            padding: "4px 10px",
            cursor: canNext ? "pointer" : "default",
            opacity: canNext ? 1 : 0.4,
            border: "1px solid #ccc",
            borderRadius: "3px",
            background: "#fff",
            fontSize: "13px",
          }}
        >
          Next ›
        </button>
      </div>
    </div>
  )
})

export { ObservedDocumentHolder as DocumentHolder }
