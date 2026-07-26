import { useEffect, useState } from "react"
import { postApi, putApi, useApi } from "../../hooks/useApi"

interface EmailSettings {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  fromAddress: string
}

interface PushSettings {
  enabled: boolean
  fcmServerKey: string
  apnsKeyId: string
  apnsTeamId: string
  apnsKeyPath: string
}

interface NotificationConfig {
  email: EmailSettings
  push: PushSettings
}

export function NotificationConfig() {
  const { data, loading, error } = useApi<NotificationConfig>("/notifications/config")
  const [form, setForm] = useState<NotificationConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setForm(data)
    }
  }, [data])

  const updateSection = <K extends keyof NotificationConfig>(
    section: K,
    field: string,
    value: unknown,
  ) => {
    if (!form) return
    setForm({
      ...form,
      [section]: { ...form[section], [field]: value },
    })
  }

  const handleSave = async () => {
    if (!form) return
    try {
      setSaving(true)
      setSaveMsg(null)
      await putApi("/notifications/config", form)
      setSaveMsg("Notification configuration saved successfully.")
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    try {
      setTesting(true)
      setTestMsg(null)
      await postApi("/notifications/test", { type: "email" })
      setTestMsg("Test email sent successfully.")
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : "Failed to send test email.")
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <p>Loading...</p>
  if (error) return <p style={{ color: "var(--wo-red-500)" }}>{error}</p>
  if (!form) return null

  const sectionStyle: React.CSSProperties = {
    border: "1px solid var(--wo-gray-200)",
    borderRadius: 8,
    padding: "1.25rem",
    backgroundColor: "white",
    marginBottom: "1rem",
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    marginBottom: "0.375rem",
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--wo-gray-300)",
    borderRadius: 6,
    fontSize: "0.875rem",
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Notification Configuration
      </h2>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Email Settings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>SMTP Host</label>
            <input
              type="text"
              value={form.email.smtpHost}
              onChange={(e) => updateSection("email", "smtpHost", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>SMTP Port</label>
            <input
              type="number"
              value={form.email.smtpPort}
              onChange={(e) => updateSection("email", "smtpPort", Number(e.target.value))}
              min={1}
              max={65535}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>SMTP User</label>
            <input
              type="text"
              value={form.email.smtpUser}
              onChange={(e) => updateSection("email", "smtpUser", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>SMTP Password</label>
            <input
              type="password"
              value={form.email.smtpPassword}
              onChange={(e) => updateSection("email", "smtpPassword", e.target.value)}
              placeholder="Leave empty to keep current"
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <label style={labelStyle}>From Address</label>
          <input
            type="email"
            value={form.email.fromAddress}
            onChange={(e) => updateSection("email", "fromAddress", e.target.value)}
            placeholder="noreply@example.com"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          Push Notifications
        </h3>

        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{ fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
          >
            <input
              type="checkbox"
              checked={form.push.enabled}
              onChange={(e) => updateSection("push", "enabled", e.target.checked)}
            />
            Enable Push Notifications
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>FCM Server Key</label>
            <input
              type="password"
              value={form.push.fcmServerKey}
              onChange={(e) => updateSection("push", "fcmServerKey", e.target.value)}
              placeholder="Firebase Cloud Messaging key"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>APNs Key ID</label>
            <input
              type="text"
              value={form.push.apnsKeyId}
              onChange={(e) => updateSection("push", "apnsKeyId", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>APNs Team ID</label>
            <input
              type="text"
              value={form.push.apnsTeamId}
              onChange={(e) => updateSection("push", "apnsTeamId", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>APNs Key Path</label>
            <input
              type="text"
              value={form.push.apnsKeyPath}
              onChange={(e) => updateSection("push", "apnsKeyPath", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
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

        <button
          onClick={handleTestEmail}
          disabled={testing}
          style={{
            padding: "0.5rem 1.5rem",
            backgroundColor: "var(--wo-green-600)",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: testing ? "not-allowed" : "pointer",
            opacity: testing ? 0.7 : 1,
          }}
        >
          {testing ? "Sending..." : "Test Email"}
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
        {testMsg && (
          <span
            style={{
              fontSize: "0.875rem",
              color: testMsg.includes("success") ? "var(--wo-green-500)" : "var(--wo-red-500)",
            }}
          >
            {testMsg}
          </span>
        )}
      </div>
    </div>
  )
}
