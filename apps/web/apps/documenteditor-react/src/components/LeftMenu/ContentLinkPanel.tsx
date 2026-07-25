import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"
import { documentStore } from "../../stores/DocumentStore"

/* ── Types ── */

interface ContentLink {
  id: string
  source_document_id: string
  target_document_id: string
  source_document_name: string
  target_document_name: string
  resolved_content: string | null
  created_at: string
}

interface ContentLinkPanelProps {
  /** When false (default), no network requests are made. LeftMenu passes
   *  `activeLeftPanel === 'contentlinks'` so the panel only fires its initial
   *  fetch when the user opens it — avoids CORS noise on pages where the WOPI
   *  host doesn't expose the storage-service content-links routes. */
  active?: boolean
  style?: React.CSSProperties
}

/* ── API ── */

const STORAGE_API =
  (import.meta.env as unknown as { VITE_WOPI_HOST_URL?: string }).VITE_WOPI_HOST_URL ??
  "http://localhost:8002"

function currentDocId(): string {
  return documentStore.filePath ? (documentStore.filePath.split("/").pop() ?? "doc-1") : "doc-1"
}

async function fetchInboundLinks(docId: string): Promise<ContentLink[]> {
  const res = await fetch(`${STORAGE_API}/documents/${docId}/content-links`)
  if (!res.ok) return []
  const body: { links: ContentLink[] } = await res.json()
  return body.links ?? []
}

async function fetchOutboundLinks(docId: string): Promise<ContentLink[]> {
  const res = await fetch(`${STORAGE_API}/documents/${docId}/outbound-content-links`)
  if (!res.ok) return []
  const body: { links: ContentLink[] } = await res.json()
  return body.links ?? []
}

async function createLink(sourceId: string, targetId: string): Promise<boolean> {
  const res = await fetch(`${STORAGE_API}/documents/${sourceId}/content-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_document_id: targetId }),
  })
  return res.ok
}

async function deleteLink(linkId: string): Promise<boolean> {
  const res = await fetch(`${STORAGE_API}/content-links/${linkId}`, {
    method: "DELETE",
  })
  return res.ok
}

async function resolveLink(linkId: string): Promise<{ resolved_content: string } | null> {
  const res = await fetch(`${STORAGE_API}/content-links/${linkId}/resolve`, {
    method: "POST",
  })
  if (!res.ok) return null
  return res.json()
}

/* ── Component ── */

function ContentLinkPanelInner({ active = false, style }: ContentLinkPanelProps): JSX.Element {
  const [inbound, setInbound] = useState<ContentLink[]>([])
  const [outbound, setOutbound] = useState<ContentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [targetId, setTargetId] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const docId = currentDocId()
  const hasLinks = inbound.length > 0 || outbound.length > 0

  const loadLinks = useCallback(async () => {
    setLoading(true)
    try {
      const [inb, outb] = await Promise.all([fetchInboundLinks(docId), fetchOutboundLinks(docId)])
      setInbound(inb)
      setOutbound(outb)
      // Clear any stale error from a previous attempt now that we succeeded.
      setError("")
    } catch {
      // Network/CORS failure (typical on WOPI-only deployments where the
      // host has no storage-service content-links endpoint). Fail silently
      // so the panel just shows the empty state instead of an error banner.
      setInbound([])
      setOutbound([])
      setError("")
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    // Only fetch when the panel is actually open. Avoids firing requests
    // against WOPI hosts that don't implement the storage-service routes
    // (every page-load would otherwise trigger CORS errors).
    if (active) loadLinks()
  }, [active, loadLinks])

  const handleCreate = async () => {
    if (!targetId.trim()) return
    setCreating(true)
    setError("")
    try {
      const ok = await createLink(docId, targetId.trim())
      if (ok) {
        setTargetId("")
        await loadLinks()
      } else {
        setError("Failed to create link — check the target document ID")
      }
    } catch {
      setError("Network error creating link")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (linkId: string) => {
    const ok = await deleteLink(linkId)
    if (ok) await loadLinks()
  }

  const handleResolve = async (linkId: string) => {
    const result = await resolveLink(linkId)
    if (result) {
      setOutbound((prev) =>
        prev.map((l) =>
          l.id === linkId ? { ...l, resolved_content: result.resolved_content } : l,
        ),
      )
    }
  }

  return (
    <div className="de-contentlink-panel" style={style}>
      {/* Header */}
      <div className="de-contentlink-header">
        <h3 className="de-contentlink-title">Content Links</h3>
      </div>

      {/* Error */}
      {error && <div className="de-contentlink-error">{error}</div>}

      {/* Create link form */}
      <div className="de-contentlink-create">
        <label className="de-contentlink-label" htmlFor="de-contentlink-input">
          Link to document ID
        </label>
        <div className="de-contentlink-create-row">
          <input
            id="de-contentlink-input"
            className="de-contentlink-input"
            type="text"
            placeholder="Document ID..."
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
          />
          <button
            type="button"
            className="de-contentlink-btn de-contentlink-btn-primary"
            disabled={creating || !targetId.trim()}
            onClick={handleCreate}
          >
            {creating ? "..." : "Link"}
          </button>
        </div>
      </div>

      {/* Link lists */}
      <div className="de-contentlink-lists">
        {loading && <div className="de-contentlink-empty">Loading…</div>}

        {!loading && !hasLinks && (
          <div className="de-contentlink-empty">
            No content links yet. Link this document to another one above.
          </div>
        )}

        {!loading && outbound.length > 0 && (
          <section className="de-contentlink-section">
            <h4 className="de-contentlink-section-title">Outbound ({outbound.length})</h4>
            <ul className="de-contentlink-list">
              {outbound.map((link) => (
                <li key={link.id} className="de-contentlink-item">
                  <div className="de-contentlink-item-header">
                    <span className="de-contentlink-item-name">
                      {link.target_document_name || link.target_document_id}
                    </span>
                    <div className="de-contentlink-item-actions">
                      {!link.resolved_content && (
                        <button
                          type="button"
                          className="de-contentlink-btn de-contentlink-btn-sm"
                          title="Resolve content"
                          onClick={() => handleResolve(link.id)}
                        >
                          ↻
                        </button>
                      )}
                      <button
                        type="button"
                        className="de-contentlink-btn de-contentlink-btn-sm de-contentlink-btn-danger"
                        title="Delete link"
                        onClick={() => handleDelete(link.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {link.resolved_content && (
                    <p className="de-contentlink-preview">{link.resolved_content}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && inbound.length > 0 && (
          <section className="de-contentlink-section">
            <h4 className="de-contentlink-section-title">Inbound ({inbound.length})</h4>
            <ul className="de-contentlink-list">
              {inbound.map((link) => (
                <li key={link.id} className="de-contentlink-item">
                  <div className="de-contentlink-item-header">
                    <span className="de-contentlink-item-name">
                      {link.source_document_name || link.source_document_id}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

export const ContentLinkPanel = observer(ContentLinkPanelInner)
