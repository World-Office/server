import { useEffect, useState } from "react"
import { documentStore } from "../../../stores/DocumentStore"

interface VersionEntry {
  versionId: string
  name: string
  size: number
  lastModified: string
  mimeType: string
  previewUrl?: string
}

const OCS_HEADERS = {
  Accept: "application/json",
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return "Just now"
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return `${diffD}d ago`
    return d.toLocaleDateString()
  } catch {
    return iso
  }
}

async function fetchVersions(accessToken: string, filePath: string): Promise<VersionEntry[]> {
  const encodedPath = encodeURIComponent(filePath)

  try {
    const resp = await fetch(
      `/apps/files_versions/api/v1/versions?file=${encodedPath}&format=json`,
      {
        headers: { ...OCS_HEADERS, Authorization: `Bearer ${accessToken}` },
      },
    )

    if (resp.ok) {
      const data = await resp.json()
      const versions = data.ocs?.data ?? []

      if (Array.isArray(versions) && versions.length > 0) {
        return versions.map((v: Record<string, unknown>) => ({
          versionId: String(v.id ?? v.version ?? ""),
          name: String(v.name ?? v.file_name ?? filePath.split("/").pop() ?? ""),
          size: Number(v.size ?? 0),
          lastModified: String(v.mtime ?? v.timestamp ?? ""),
          mimeType: String(v.mimetype ?? ""),
        }))
      }
    }
  } catch {
    // Fall through to WebDAV fallback
  }

  try {
    const resp = await fetch(filePath, {
      method: "PROPFIND",
      headers: {
        ...OCS_HEADERS,
        Authorization: `Bearer ${accessToken}`,
        Depth: "0",
        "Content-Type": "application/xml",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified/>
    <d:getcontentlength/>
  </d:prop>
</d:propfind>`,
    })

    if (resp.ok) {
      return []
    }
  } catch {
    // Fall through
  }

  return []
}

async function restoreVersion(
  accessToken: string,
  filePath: string,
  versionId: string,
): Promise<void> {
  const encodedPath = encodeURIComponent(filePath)
  const resp = await fetch(
    `/apps/files_versions/api/v1/versions/${versionId}/restore?file=${encodedPath}&format=json`,
    {
      method: "POST",
      headers: { ...OCS_HEADERS, Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
}

export function VersionHistoryPanel({ visible }: { visible: boolean }) {
  const conn = documentStore.wopiConnection
  const accessToken = conn?.wopiAccessToken
  const filePath = conn?.wopiFileId ?? ""

  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !accessToken || !filePath) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setVersions([])

    fetchVersions(accessToken, filePath)
      .then((data) => {
        if (!cancelled) setVersions(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load version history")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible, accessToken, filePath])

  async function handleRestore(version: VersionEntry): Promise<void> {
    if (!accessToken || !filePath) return
    setRestoring(version.versionId)
    try {
      await restoreVersion(accessToken, filePath, version.versionId)
      if (documentStore.wopiConnection) {
        documentStore.loadFromWopi(documentStore.wopiConnection)
      }
    } catch {
      setError("Failed to restore version")
    } finally {
      setRestoring(null)
    }
  }

  function handleCancel(): void {
    documentStore.setActiveFileMenuPanel(null)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Version History</div>
      <div className="de-file-menu-body">
        <p className="de-file-menu-instruction">
          {filePath ? `Versions of: ${filePath.split("/").pop()}` : "No file loaded"}
        </p>
      </div>

      {loading && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">Loading versions…</p>
        </div>
      )}

      {error && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">{error}</p>
        </div>
      )}

      {!loading && versions.length > 0 && (
        <div className="de-file-menu-list">
          {versions.map((version) => (
            <div
              key={version.versionId}
              className="de-file-menu-item"
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "4px",
              }}
            >
              <span className="de-file-menu-item-title">
                Version {version.versionId.slice(0, 8)}
                {version.mimeType && ` — ${version.mimeType.split("/").pop()?.toUpperCase()}`}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--wo-color-text-secondary, #666)",
                }}
              >
                {formatSize(version.size)} · {formatDateTime(version.lastModified)}
              </span>
              <button
                type="button"
                onClick={() => handleRestore(version)}
                disabled={restoring === version.versionId}
                style={{
                  fontSize: 11,
                  color: "var(--wo-color-accent, #0066cc)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  opacity: restoring === version.versionId ? 0.5 : 1,
                }}
              >
                {restoring === version.versionId ? "Restoring…" : "Restore this version"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && versions.length === 0 && !error && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">
            No previous versions available for this file.
          </p>
          <p className="de-file-menu-instruction">
            Versions are created automatically when you save changes.
          </p>
        </div>
      )}

      <div className="de-file-menu-footer">
        <button type="button" onClick={handleCancel}>
          Close
        </button>
      </div>
    </div>
  )
}
