import { getInlineIcon } from "@world-office/editor-common"
import type { JSX } from "react"
import type { RightMenuPanel } from "../../types/document"

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
  const IconComp = getInlineIcon(icon)

  return (
    <button
      type="button"
      className={`de-right-menu-btn${active ? " active" : ""}`}
      data-hint={title}
      data-action={action}
      onClick={onClick}
      aria-pressed={active}
    >
      {IconComp ? (
        <span className="de-right-menu-icon">{IconComp}</span>
      ) : (
        <span className="de-right-menu-icon" style={{ fontSize: 16, lineHeight: 1 }}>
          {icon}
        </span>
      )}
    </button>
  )
}
