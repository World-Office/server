import type { JSX } from "react"
import type { LeftMenuAction } from "../../types/visio"

interface LeftMenuButtonProps {
  action: LeftMenuAction
  title: string
  icon: string
  active: boolean
  onClick: () => void
}

export function LeftMenuButton({
  action,
  title,
  icon,
  active,
  onClick,
}: LeftMenuButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`visio-left-menu-btn${active ? " active" : ""}`}
      data-hint={title}
      data-action={action}
      content-target={action === "chat" ? "left-panel-chat" : ""}
      onClick={onClick}
      aria-pressed={active}
    >
      <svg className="visio-left-menu-icon" aria-hidden="true">
        <text x="50%" y="55%" textAnchor="middle" fontSize="16">
          {icon}
        </text>
      </svg>
    </button>
  )
}
