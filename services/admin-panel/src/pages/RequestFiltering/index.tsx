import { useEffect, useState } from "react"
import { putApi, useApi } from "../../hooks/useApi"

interface RequestFilters {
  urlAllowlist: string[]
  urlBlocklist: string[]
  allowedMethods: string[]
  maxRequestSizeBytes: number
}

const ALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]

export function RequestFiltering() {
  const { data, loading, error } = useApi<RequestFilters>("/security/request-filtering")
  const [form, setForm] = useState<RequestFilters>({
    urlAllowlist: [],
    urlBlocklist: [],
    allowedMethods: ["GET", "POST"],
    maxRequestSizeBytes: 10485760,
  })
  const [newAllowUrl, setNewAllowUrl] = useState("")
  const [newBlockUrl, setNewBlockUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (data && !loaded) {
      setForm(data)
      setLoaded(true)
    }
  }, [data, loaded])

  const addUrl = (list: "urlAllowlist" | "urlBlocklist") => {
    const value = list === "urlAllowlist" ? newAllowUrl.trim() : newBlockUrl.trim()
    if (!value) return
    setForm((prev) => ({
      ...prev,
      [list]: prev[list].includes(value) ? prev[list] : [...prev[list], value],
    }))
    if (list === "urlAllowlist") setNewAllowUrl("")
    else setNewBlockUrl("")
  }

  const removeUrl = (list: "urlAllowlist" | "urlBlocklist", item: string) => {
    setForm((prev) => ({
      ...prev,
      [list]: prev[list].filter((i) => i !== item),
    }))
  }

  const toggleMethod = (method: string) => {
    setForm((prev) => ({
      ...prev,
      allowedMethods: prev.allowedMethods.includes(method)
        ? prev.allowedMethods.filter((m) => m !== method)
        : [...prev.allowedMethods, method],
    }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setSaveMsg(null)
      await putApi("/security/request-filtering", form)
      setSaveMsg("Request filters saved successfully.")
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading...</p>
  if (error) return <p style={{ color: "var(--wo-red-500)" }}>{error}</p>

  const sectionStyle: React.CSSProperties = {
    border: "1px solid var(--wo-gray-200)",
    borderRadius: 8,
    padding: "1.25rem",
    backgroundColor: "white",
    marginBottom: "1rem",
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--wo-gray-300)",
    borderRadius: 6,
    fontSize: "0.875rem",
  }

  const renderUrlList = (items: string[], listType: "urlAllowlist" | "urlBlocklist") => (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem" }}>
      <thead>
        <tr
          style={{
            borderBottom: "2px solid var(--wo-gray-200)",
            backgroundColor: "var(--wo-gray-50)",
          }}
        >
          <th
            style={{
              padding: "0.5rem 0.75rem",
              textAlign: "left",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--wo-gray-500)",
            }}
          >
            URL Pattern
          </th>
          <th
            style={{
              width: 80,
              padding: "0.5rem 0.75rem",
              textAlign: "right",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--wo-gray-500)",
            }}
          >
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td
              colSpan={2}
              style={{
                padding: "1rem",
                textAlign: "center",
                fontSize: "0.875rem",
                color: "var(--wo-gray-500)",
              }}
            >
              No entries.
            </td>
          </tr>
        ) : (
          items.map((item, index) => (
            <tr
              key={item}
              style={{
                borderBottom: index < items.length - 1 ? "1px solid var(--wo-gray-100)" : "none",
              }}
            >
              <td
                style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.875rem" }}
              >
                {item}
              </td>
              <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                <button
                  onClick={() => removeUrl(listType, item)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    color: "var(--wo-red-500)",
                    background: "none",
                    border: "1px solid var(--wo-red-500)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Request Filtering
      </h2>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          URL Allowlist
        </h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={newAllowUrl}
            onChange={(e) => setNewAllowUrl(e.target.value)}
            placeholder="e.g. /api/public/*"
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && addUrl("urlAllowlist")}
          />
          <button
            onClick={() => addUrl("urlAllowlist")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--wo-blue-600)",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: "0.875rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Add
          </button>
        </div>
        {renderUrlList(form.urlAllowlist, "urlAllowlist")}
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          URL Blocklist
        </h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={newBlockUrl}
            onChange={(e) => setNewBlockUrl(e.target.value)}
            placeholder="e.g. /api/internal/*"
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && addUrl("urlBlocklist")}
          />
          <button
            onClick={() => addUrl("urlBlocklist")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--wo-blue-600)",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: "0.875rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Add
          </button>
        </div>
        {renderUrlList(form.urlBlocklist, "urlBlocklist")}
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Allowed HTTP Methods
        </h3>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {ALL_METHODS.map((method) => (
            <label
              key={method}
              style={{
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.375rem 0.75rem",
                border: "1px solid var(--wo-gray-300)",
                borderRadius: 6,
                backgroundColor: form.allowedMethods.includes(method)
                  ? "var(--wo-blue-50)"
                  : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.allowedMethods.includes(method)}
                onChange={() => toggleMethod(method)}
              />
              {method}
            </label>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Max Request Size
        </h3>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginBottom: "0.375rem",
            }}
          >
            Max Request Size (bytes)
          </label>
          <input
            type="number"
            value={form.maxRequestSizeBytes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, maxRequestSizeBytes: Number(e.target.value) }))
            }
            min={1}
            style={inputStyle}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--wo-gray-500)", marginTop: "0.25rem" }}>
            {form.maxRequestSizeBytes > 0
              ? `${(form.maxRequestSizeBytes / 1048576).toFixed(1)} MB`
              : ""}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "0.5rem 1.5rem",
            backgroundColor: "var(--wo-blue-600)",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saveMsg && (
          <span
            style={{
              fontSize: "0.875rem",
              color: saveMsg.includes("success") ? "var(--wo-green-500)" : "var(--wo-red-500)",
            }}
          >
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  )
}
