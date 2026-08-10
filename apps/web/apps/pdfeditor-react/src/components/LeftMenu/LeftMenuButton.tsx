import { getInlineIcon } from "@world-office/editor-common"
import type { JSX } from "react"
import type { LeftMenuAction } from "../../types/pdf"

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
  const IconComp = getInlineIcon(icon)

  return (
    <button
      type="button"
      className={`de-left-menu-btn${active ? " active" : ""}`}
      data-hint={title}
      data-action={action}
      onClick={onClick}
      aria-pressed={active}
    >
      {IconComp ? (
        <span className="pdf-left-menu-icon">{IconComp}</span>
      ) : (
        <span className="pdf-left-menu-icon" style={{ fontSize: 16, lineHeight: 1 }}>
          {icon}
        </span>
      )}
    </button>
  )
}
