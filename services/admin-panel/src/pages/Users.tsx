export function Users() {
  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>Users</h2>
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
        <p>User management coming soon.</p>
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
          Connect to identity-service for user CRUD operations.
        </p>
      </div>
    </div>
  )
}
