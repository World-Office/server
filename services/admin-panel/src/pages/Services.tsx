import { useApi } from "../hooks/useApi"

interface GatewayHealth {
  status: string
  service: string
  version: string
  routes: string[]
}

export function Services() {
  const { data: gateway, loading } = useApi<GatewayHealth>("/health")

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Services</h2>

      {loading && <p>Loading...</p>}

      {!loading && gateway && (
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
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
                  Route Prefix
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
                  Upstream
                </th>
              </tr>
            </thead>
            <tbody>
              {gateway.routes.map((route, index) => {
                const [prefix, upstream] = route.split(" → ")
                return (
                  <tr
                    key={prefix}
                    style={{
                      borderBottom:
                        index < gateway.routes.length - 1 ? "1px solid var(--wo-gray-100)" : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                      }}
                    >
                      {prefix}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 1rem",
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                        color: "var(--wo-gray-500)",
                      }}
                    >
                      {upstream}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
