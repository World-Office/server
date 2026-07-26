import { useApi } from "../hooks/useApi"

interface ServiceStatus {
  service: string
  status: string
  url: string
}

export function Dashboard() {
  const { data: services, loading } = useApi<ServiceStatus[]>("/health")

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Dashboard</h2>

      {loading && <p>Loading...</p>}

      {!loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {services?.map((svc) => (
            <div
              key={svc.service}
              style={{
                border: "1px solid var(--wo-gray-200)",
                borderRadius: 8,
                padding: "1.25rem",
                backgroundColor: "white",
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{svc.service}</h3>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor:
                      svc.status === "ok" ? "var(--wo-green-500)" : "var(--wo-red-500)",
                  }}
                />
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--wo-gray-500)", marginTop: "0.5rem" }}>
                {svc.url}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
