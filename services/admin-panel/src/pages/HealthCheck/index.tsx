import { useEffect, useState } from "react"
import { useApi } from "../../hooks/useApi"

interface ServiceHealth {
  name: string
  status: "healthy" | "unhealthy"
  lastCheck: string
  responseTimeMs: number
}

export function HealthCheck() {
  const { data, loading, error, refetch } = useApi<ServiceHealth[]>("/health")
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      refetch()
    }, 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  const getStatusColor = (status: string) =>
    status === "healthy" ? "var(--wo-green-500)" : "var(--wo-red-500)"

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
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Health Check</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <label
            style={{ fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (15s)
          </label>
          <button
            onClick={() => refetch()}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--wo-blue-600)",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Refresh Now
          </button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "var(--wo-red-500)" }}>{error}</p>}

      {!loading && data && data.length === 0 && (
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            padding: "2rem",
            backgroundColor: "white",
            textAlign: "center",
            color: "var(--wo-gray-500)",
          }}
        >
          <p>No health data available.</p>
        </div>
      )}

      {!loading && data && data.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1rem",
          }}
        >
          {data.map((svc) => (
            <div
              key={svc.name}
              style={{
                border: "1px solid var(--wo-gray-200)",
                borderRadius: 8,
                padding: "1.25rem",
                backgroundColor: "white",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.75rem",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{svc.name}</h3>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.25rem 0.625rem",
                    borderRadius: 999,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    backgroundColor:
                      svc.status === "healthy" ? "var(--wo-green-50)" : "var(--wo-red-50)",
                    color: svc.status === "healthy" ? "var(--wo-green-700)" : "var(--wo-red-700)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: getStatusColor(svc.status),
                      display: "inline-block",
                    }}
                  />
                  {svc.status}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--wo-gray-500)",
                      marginBottom: "0.125rem",
                    }}
                  >
                    Last Check
                  </div>
                  <div style={{ fontSize: "0.875rem" }}>{svc.lastCheck}</div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--wo-gray-500)",
                      marginBottom: "0.125rem",
                    }}
                  >
                    Response Time
                  </div>
                  <div style={{ fontSize: "0.875rem" }}>{svc.responseTimeMs} ms</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
