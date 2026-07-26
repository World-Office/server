import { useEffect, useState } from "react"
import { useApi } from "../hooks/useApi"

interface AiSettingsData {
  timeout: number
  corsOrigins: string
  proxyUrl: string
  defaultProvider: string
}

export function AiSettings() {
  const { data, loading, error } = useApi<AiSettingsData>("/ai/settings")
  const [form, setForm] = useState<AiSettingsData>({
    timeout: 30,
    corsOrigins: "",
    proxyUrl: "",
    defaultProvider: "",
  })
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) {
      setForm(data)
    }
  }, [data])

  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch("/api/ai/providers")
        if (res.ok) {
          const list = (await res.json()) as { id: string; name: string }[]
          setProviders(list)
        }
      } catch {}
    }
    fetchProviders()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)

    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>AI Settings</h2>

      {loading && <p>Loading...</p>}

      {error && (
        <div
          style={{
            border: "1px solid var(--wo-red-500)",
            borderRadius: 8,
            padding: "1rem",
            backgroundColor: "#fef2f2",
            color: "var(--wo-red-500)",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {!loading && (
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            padding: "1.5rem",
            backgroundColor: "white",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  marginBottom: "0.375rem",
                  color: "var(--wo-gray-500)",
                }}
              >
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={form.timeout}
                onChange={(e) => setForm((f) => ({ ...f, timeout: Number(e.target.value) }))}
                min={1}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--wo-gray-200)",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  marginBottom: "0.375rem",
                  color: "var(--wo-gray-500)",
                }}
              >
                Default Provider
              </label>
              <select
                value={form.defaultProvider}
                onChange={(e) => setForm((f) => ({ ...f, defaultProvider: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--wo-gray-200)",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                  backgroundColor: "white",
                }}
              >
                <option value="">-- Select provider --</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  marginBottom: "0.375rem",
                  color: "var(--wo-gray-500)",
                }}
              >
                CORS Origins (comma-separated)
              </label>
              <input
                type="text"
                value={form.corsOrigins}
                onChange={(e) => setForm((f) => ({ ...f, corsOrigins: e.target.value }))}
                placeholder="https://app.example.com, https://admin.example.com"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--wo-gray-200)",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                }}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  marginBottom: "0.375rem",
                  color: "var(--wo-gray-500)",
                }}
              >
                Proxy URL
              </label>
              <input
                type="text"
                value={form.proxyUrl}
                onChange={(e) => setForm((f) => ({ ...f, proxyUrl: e.target.value }))}
                placeholder="http://proxy:8080"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--wo-gray-200)",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              marginTop: "1.5rem",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "0.5rem 1.5rem",
                border: "none",
                borderRadius: 6,
                backgroundColor: saving ? "var(--wo-gray-300)" : "var(--wo-blue-500)",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            {saved && (
              <span style={{ fontSize: "0.875rem", color: "var(--wo-green-500)", fontWeight: 600 }}>
                Settings saved successfully.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
