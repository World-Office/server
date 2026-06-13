export interface CollaboratorCursorsProps {
  cursors: Map<string, { page: number; x: number; y: number }>
  userColors: Map<string, string>
  userNames: Map<string, string>
  className?: string
}

export function CollaboratorCursors({
  cursors,
  userColors,
  userNames,
  className,
}: CollaboratorCursorsProps) {
  if (cursors.size === 0) return null

  return (
    <div
      className={`wo-collaborator-cursors ${className ?? ""}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {Array.from(cursors.entries()).map(([userId, cursor]) => {
        const color = userColors.get(userId) ?? "#999"
        const name = userNames.get(userId) ?? "Unknown"

        return (
          <div
            key={userId}
            data-testid={`cursor-${userId}`}
            style={{
              position: "absolute",
              left: cursor.x,
              top: cursor.y,
              zIndex: 10,
              transition: "left 0.15s ease, top 0.15s ease",
            }}
          >
            {/* Cursor caret */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              aria-label={`${name} cursor`}
              role="img"
              style={{ display: "block" }}
            >
              <path d="M0 0L16 12L8 12L4 20L0 0Z" fill={color} />
            </svg>
            {/* Name label */}
            <span
              style={{
                backgroundColor: color,
                color: "#fff",
                fontSize: 10,
                padding: "1px 4px",
                borderRadius: 2,
                marginLeft: 12,
                marginTop: -4,
                whiteSpace: "nowrap",
                position: "absolute",
                top: 12,
              }}
            >
              {name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
