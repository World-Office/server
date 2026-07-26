import { useState } from "react"
import { useApi } from "../hooks/useApi"

interface AiProvider {
  id: string
  name: string
  apiUrl: string
  model: string
  enabled: boolean
}

interface ProviderForm {
  name: string
  apiUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

const emptyForm: ProviderForm = {
  name: "",
  apiUrl: "",
  apiKey: "",
  model: "",
  enabled: true,
}

export function AiProviders() {
  const { data: providers, loading, error, refetch } = useApi<AiProvider[]>("/ai/providers")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  function openAdd() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(provider: AiProvider) {
    setForm({
      name: provider.name,
      apiUrl: provider.apiUrl,
      apiKey: "",
      model: provider.model,
      enabled: provider.enabled,
    })
    setEditingId(provider.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSave() {
    if (!form.name || !form.apiUrl) return
    setSaving(true)

    try {
      if (editingId) {
        const res = await fetch(`/api/ai/providers/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        refetch()
      } else {
        const res = await fetch("/api/ai/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        refetch()
      }
      closeForm()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/ai/providers/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      refetch()
    } catch {}
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>AI Providers</h2>
        <button
          onClick={openAdd}
          style={{
            padding: "0.5rem 1rem",
            border: "none",
            borderRadius: 6,
            backgroundColor: "var(--wo-blue-500)",
            color: "white",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add Provider
        </button>
      </div>

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

      {showForm && (
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            padding: "1.5rem",
            backgroundColor: "white",
            marginBottom: "1.5rem",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
            {editingId ? "Edit Provider" : "New Provider"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
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
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
                API URL
              </label>
              <input
                type="text"
                value={form.apiUrl}
                onChange={(e) => setForm((f) => ({ ...f, apiUrl: e.target.value }))}
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
                API Key
              </label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
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
                Model
              </label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--wo-gray-200)",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                id="provider-enabled"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <label htmlFor="provider-enabled" style={{ fontSize: "0.875rem" }}>
                Enabled
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.apiUrl}
              style={{
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: 6,
                backgroundColor:
                  saving || !form.name || !form.apiUrl
                    ? "var(--wo-gray-300)"
                    : "var(--wo-blue-500)",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: saving || !form.name || !form.apiUrl ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button
              onClick={closeForm}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid var(--wo-gray-200)",
                borderRadius: 6,
                backgroundColor: "white",
                color: "var(--wo-gray-700)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
          {providers && providers.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "2px solid var(--wo-gray-200)",
                    backgroundColor: "var(--wo-gray-50)",
                  }}
                >
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      color: "var(--wo-gray-500)",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      color: "var(--wo-gray-500)",
                    }}
                  >
                    API URL
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      color: "var(--wo-gray-500)",
                    }}
                  >
                    Model
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      color: "var(--wo-gray-500)",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "right",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      color: "var(--wo-gray-500)",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider, index) => (
                  <tr
                    key={provider.id}
                    style={{
                      borderBottom:
                        index < providers.length - 1 ? "1px solid var(--wo-gray-100)" : "none",
                    }}
                  >
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                      {provider.name}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                        color: "var(--wo-gray-500)",
                      }}
                    >
                      {provider.apiUrl}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                      }}
                    >
                      {provider.model}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.125rem 0.5rem",
                          borderRadius: 4,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor: provider.enabled
                            ? "var(--wo-green-500)"
                            : "var(--wo-gray-200)",
                          color: provider.enabled ? "white" : "var(--wo-gray-500)",
                        }}
                      >
                        {provider.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      <button
                        onClick={() => openEdit(provider)}
                        style={{
                          padding: "0.25rem 0.625rem",
                          border: "1px solid var(--wo-gray-200)",
                          borderRadius: 4,
                          backgroundColor: "white",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          marginRight: "0.5rem",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(provider.id)}
                        style={{
                          padding: "0.25rem 0.625rem",
                          border: "1px solid var(--wo-red-500)",
                          borderRadius: 4,
                          backgroundColor: "white",
                          color: "var(--wo-red-500)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--wo-gray-500)",
              }}
            >
              <p>No AI providers configured yet.</p>
              <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
                Click "Add Provider" to get started.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
