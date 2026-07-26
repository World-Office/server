import { useApi } from "../hooks/useApi"

interface EnvVar {
  key: string
  value: string
}

interface ConfigResponse {
  services: { name: string; status: string; url: string }[]
  config: Record<string, string>
}

export function Settings() {
  const { data } = useApi<ConfigResponse>("/health")
  const envVars: EnvVar[] = data
    ? Object.entries(data.config ?? {}).map(([key, value]) => ({ key, value }))
    : []

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Settings</h2>

      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Environment</h3>
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
          {envVars.length > 0 ? (
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
                    Variable
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
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {envVars.map((env, index) => (
                  <tr
                    key={env.key}
                    style={{
                      borderBottom:
                        index < envVars.length - 1 ? "1px solid var(--wo-gray-100)" : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                      }}
                    >
                      {env.key}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                        color: "var(--wo-gray-500)",
                      }}
                    >
                      {env.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--wo-gray-500)" }}>
              <p>Connect to the API gateway to see configuration.</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Storage</h3>
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            padding: "1.5rem",
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--wo-gray-500)",
                  marginBottom: "0.25rem",
                }}
              >
                Documents
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>0 MB</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--wo-gray-500)",
                  marginBottom: "0.25rem",
                }}
              >
                Users
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>0</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--wo-gray-500)",
                  marginBottom: "0.25rem",
                }}
              >
                Uptime
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>--</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
