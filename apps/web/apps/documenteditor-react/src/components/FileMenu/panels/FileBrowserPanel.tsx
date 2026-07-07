import { useEffect, useState } from "react"
import { documentStore } from "../../../stores/DocumentStore"

interface WebDAVFileEntry {
  href: string
  displayName: string
  isCollection: boolean
  lastModified: string
  contentLength: string
}

const NS = "DAV:"

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["docx", "doc"].includes(ext)) return "📄"
  if (["odt", "ods", "odp"].includes(ext)) return "📄"
  if (["xlsx", "xls", "csv"].includes(ext)) return "📊"
  if (["pptx", "ppt"].includes(ext)) return "📊"
  if (["pdf"].includes(ext)) return "📕"
  if (["vsdx", "vsd"].includes(ext)) return "📐"
  if (["txt", "md"].includes(ext)) return "📝"
  return "📄"
}

function parseWebDAVResponse(xmlText: string, basePath: string): WebDAVFileEntry[] {
  const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml")
  const responseElements = xmlDoc.getElementsByTagNameNS(NS, "response")
  const entries: WebDAVFileEntry[] = []

  for (let i = 0; i < responseElements.length; i++) {
    const responseEl = responseElements[i]
    const hrefEl = responseEl.getElementsByTagNameNS(NS, "href")[0]
    if (!hrefEl) continue

    const href = hrefEl.textContent ?? ""
    if (href === basePath) continue
    if (!href.startsWith(basePath)) continue

    const relative = href.slice(basePath.length).replace(/\/$/, "")
    if (relative.includes("/")) continue

    const propstat = responseEl.getElementsByTagNameNS(NS, "propstat")[0]
    if (!propstat) continue
    const prop = propstat.getElementsByTagNameNS(NS, "prop")[0]
    if (!prop) continue

    const displayName = prop.getElementsByTagNameNS(NS, "displayname")[0]?.textContent ?? ""
    const lastModified = prop.getElementsByTagNameNS(NS, "getlastmodified")[0]?.textContent ?? ""
    const contentLength = prop.getElementsByTagNameNS(NS, "getcontentlength")[0]?.textContent ?? ""

    const resourceType = prop.getElementsByTagNameNS(NS, "resourcetype")[0]
    const isCollection = resourceType?.getElementsByTagNameNS(NS, "collection").length > 0

    entries.push({
      href,
      displayName: displayName || relative,
      isCollection,
      lastModified,
      contentLength,
    })
  }

  entries.sort((a, b) => {
    if (a.isCollection !== b.isCollection) {
      return a.isCollection ? -1 : 1
    }
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase())
  })

  return entries
}

function buildBreadcrumbs(path: string, base: string): Array<{ label: string; path: string }> {
  const crumbs: Array<{ label: string; path: string }> = []
  const relative = path.slice(base.length).replace(/\/$/, "")
  crumbs.push({ label: "Files", path: base })
  if (relative) {
    const parts = relative.split("/")
    let accumulated = base
    for (const part of parts) {
      accumulated += `${part}/`
      crumbs.push({ label: part, path: accumulated })
    }
  }
  return crumbs
}

export function FileBrowserPanel({ visible }: { visible: boolean }) {
  const conn = documentStore.wopiConnection
  const accessToken = conn?.wopiAccessToken
  const wopiFileId = conn?.wopiFileId
  const userId = wopiFileId ? (wopiFileId.split("/")[1] ?? "admin") : "admin"
  const webDAVBase = `/remote.php/dav/files/${userId}/`

  const [currentPath, setCurrentPath] = useState(webDAVBase)
  const [files, setFiles] = useState<WebDAVFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!visible || !accessToken) return

    if (!initialized) {
      setCurrentPath(webDAVBase)
      setInitialized(true)
    }

    let cancelled = false

    async function fetchFiles() {
      setLoading(true)
      setError(null)

      try {
        const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontenttype/>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

        const response = await fetch(currentPath, {
          method: "PROPFIND",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/xml; charset=utf-8",
            Depth: "1",
          },
          body,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const xmlText = await response.text()

        if (cancelled) return
        setFiles(parseWebDAVResponse(xmlText, currentPath))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to connect to storage")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchFiles()

    return () => {
      cancelled = true
    }
  }, [visible, accessToken, currentPath, webDAVBase, initialized])

  function handleFolderClick(path: string) {
    setCurrentPath(path)
  }

  function handleFileOpen(filePath: string) {
    const origin = window.location.origin
    const encodedPath = encodeURIComponent(filePath)
    const url = `${origin}/word/?file_id=${encodedPath}&access_token=${accessToken}`
    window.location.href = url
  }

  function handleRetry() {
    setError(null)
    setFiles([])
    setCurrentPath(webDAVBase)
  }

  function handleCancel() {
    documentStore.setActiveFileMenuPanel(null)
  }

  const breadcrumbs = buildBreadcrumbs(currentPath, webDAVBase)

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
    >
      <div className="de-file-menu-header">Browse Files</div>
      <div className="de-file-menu-body">
        <p className="de-file-menu-instruction">
          Browse and open files from your OpenCloud storage.
        </p>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "8px" }}>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.path} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {index > 0 && <span style={{ color: "#999" }}>/</span>}
              {index < breadcrumbs.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentPath(crumb.path)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--wo-color-accent, #0066cc)",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  {crumb.label}
                </button>
              ) : (
                <span style={{ color: "var(--wo-color-text-primary, #333)" }}>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {loading && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">Loading...</p>
        </div>
      )}

      {error && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">Unable to connect to storage ({error})</p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              marginTop: "8px",
              padding: "4px 12px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && files.length === 0 && (
        <div className="de-file-menu-body">
          <p className="de-file-menu-instruction">No files</p>
        </div>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="de-file-menu-list">
          {files.map((file) => (
            <button
              key={file.href}
              type="button"
              className="de-file-menu-item"
              onClick={() =>
                file.isCollection ? handleFolderClick(file.href) : handleFileOpen(file.href)
              }
              style={{ cursor: "pointer" }}
            >
              <span
                className="de-file-menu-item-title"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span>{file.isCollection ? "📁" : getFileIcon(file.displayName)}</span>
                <span>{file.displayName}</span>
              </span>
              {!file.isCollection && (
                <span className="de-file-menu-item-date">
                  {formatFileSize(Number(file.contentLength))}
                  {file.lastModified ? ` · ${formatDate(file.lastModified)}` : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="de-file-menu-footer">
        <button type="button" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
