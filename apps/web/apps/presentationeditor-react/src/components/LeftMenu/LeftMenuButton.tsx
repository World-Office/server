import type { JSX } from "react"

interface LeftMenuButtonProps {
  action: string
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
      className={`prese-left-menu-btn${active ? " active" : ""}`}
      data-hint={title}
      data-action={action}
      onClick={onClick}
      aria-pressed={active}
    >
      <svg className="prese-left-menu-icon" aria-hidden="true">
        <text x="50%" y="55%" textAnchor="middle" fontSize="16">
          {icon}
        </text>
      </svg>
    </button>
  )
}
