import type { JSX } from "react"
import type { RightMenuPanel } from "../../types/presentation"

interface RightMenuButtonProps {
  action: RightMenuPanel
  title: string
  icon: string
  active: boolean
  onClick: () => void
}

export function RightMenuButton({
  action,
  title,
  icon,
  active,
  onClick,
}: RightMenuButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`prese-right-menu-btn${active ? " active" : ""}`}
      data-hint={title}
      data-action={action}
      onClick={onClick}
      aria-pressed={active}
    >
      <svg className="prese-right-menu-icon" aria-hidden="true">
        <text x="50%" y="55%" textAnchor="middle" fontSize="16">
          {icon}
        </text>
      </svg>
    </button>
  )
}
