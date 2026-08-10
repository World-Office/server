import { getInlineIcon } from "@world-office/editor-common"
import type { JSX } from "react"

export function LeftMenuButton({
  action,
  title,
  icon,
  active,
  onClick,
}: {
  action: string
  title: string
  icon: string
  active: boolean
  onClick: () => void
}): JSX.Element {
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
        <span className="de-left-menu-icon">{IconComp}</span>
      ) : (
        <span className="de-left-menu-icon" style={{ fontSize: 16, lineHeight: 1 }}>
          {icon}
        </span>
      )}
    </button>
  )
}
