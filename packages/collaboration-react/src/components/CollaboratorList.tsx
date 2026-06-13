import type { CollabUser } from "@world-office/editor-stores"

export interface CollaboratorListProps {
  users: CollabUser[]
  maxDisplay?: number
  className?: string
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function CollaboratorList({ users, maxDisplay = 5, className }: CollaboratorListProps) {
  if (users.length === 0) return null

  const displayed = users.slice(0, maxDisplay)
  const overflow = users.length - maxDisplay

  return (
    <div
      className={`wo-collaborator-list ${className ?? ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {displayed.map((user) => (
        <span
          key={user.id}
          title={`${user.name}${user.isCurrentUser ? " (you)" : ""}`}
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: user.color,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            border: user.isCurrentUser ? "2px solid #fff" : "2px solid transparent",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
            cursor: "default",
            userSelect: "none",
          }}
          data-testid={`collaborator-${user.id}`}
        >
          {getInitial(user.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          style={{
            fontSize: 11,
            color: "#666",
            marginLeft: 2,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
