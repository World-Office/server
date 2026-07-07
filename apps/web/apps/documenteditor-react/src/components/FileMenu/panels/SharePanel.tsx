import { useEffect, useState } from "react"
import { documentStore } from "../../../stores/DocumentStore"

interface ShareEntry {
  id: string
  share_type: number
  share_with: string
  permissions: number
  url: string
  token: string
  expiration: string
}

const SHARE_TYPE_LABELS: Record<number, string> = {
  0: "User",
  1: "Group",
  3: "Public Link",
  4: "Email",
}

const OCS_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json",
}

async function fetchShares(accessToken: string, filePath: string): Promise<ShareEntry[]> {
  const encodedPath = encodeURIComponent(filePath)
  const resp = await fetch(
    `/ocs/v2.php/apps/files_sharing/api/v1/shares?path=${encodedPath}&format=json`,
    {
      headers: { ...OCS_HEADERS, Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  return data.ocs?.data ?? []
}

async function createPublicLink(accessToken: string, filePath: string): Promise<ShareEntry> {
  const resp = await fetch("/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json", {
    method: "POST",
    headers: { ...OCS_HEADERS, Authorization: `Bearer ${accessToken}` },
    body: new URLSearchParams({
      path: filePath,
      shareType: "3",
    }),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  return data.ocs?.data
}

export function SharePanel({ visible }: { visible: boolean }) {
  const conn = documentStore.wopiConnection
  const accessToken = conn?.wopiAccessToken
  const filePath = conn?.wopiFileId ?? ""

  const [shares, setShares] = useState<ShareEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !accessToken || !filePath) return
    let cancelled = false

    setLoading(true)
    setError(null)

    fetchShares(accessToken, filePath)
      .then((data) => {
        if (!cancelled) setShares(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load shares")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible, accessToken, filePath])

  async function handleCreateLink(): Promise<void> {
    if (!accessToken || !filePath) return
    setCreating(true)
    try {
      const newShare = await createPublicLink(accessToken, filePath)
      setShares((prev) => [newShare, ...prev])
    } catch {
      setError("Failed to create share link")
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyLink(share: ShareEntry): Promise<void> {
    if (!share.url) return
    await navigator.clipboard.writeText(share.url)
    setCopiedId(share.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleCancel(): void {
    documentStore.setActiveFileMenuPanel(null)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Share</div>
      <div className="de-file-menu-body">
        <p className="de-file-menu-instruction">
          {filePath ? `Sharing: ${filePath.split("/").pop()}` : "No file loaded"}
        </p>
      </div>

      {loading && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">Loading shares…</p>
        </div>
      )}

      {error && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">{error}</p>
        </div>
      )}

      {!loading && shares.length > 0 && (
        <div className="de-file-menu-list">
          {shares.map((share) => (
            <div
              key={share.id}
              className="de-file-menu-item"
              style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}
            >
              <span className="de-file-menu-item-title">
                {SHARE_TYPE_LABELS[share.share_type] ?? `Type ${share.share_type}`}
                {share.share_with ? ` — ${share.share_with}` : ""}
              </span>
              {share.url && (
                <button
                  type="button"
                  onClick={() => handleCopyLink(share)}
                  style={{
                    fontSize: 11,
                    color: "var(--wo-color-accent, #0066cc)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {copiedId === share.id ? "Copied!" : "Copy Link"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && shares.length === 0 && !error && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">No shares for this file.</p>
        </div>
      )}

      <div className="de-file-menu-footer">
        {accessToken && filePath && (
          <button
            type="button"
            onClick={handleCreateLink}
            disabled={creating}
            style={{ marginRight: "auto", opacity: creating ? 0.5 : 1 }}
          >
            {creating ? "Creating…" : "New Public Link"}
          </button>
        )}
        <button type="button" onClick={handleCancel}>
          Close
        </button>
      </div>
    </div>
  )
}
