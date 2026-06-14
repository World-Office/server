import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { visioStore } from "../../stores/VisioStore"
import { LeftMenuButton } from "./LeftMenuButton"
import { ShapePalette } from "../ShapePalette/ShapePalette"

const BUTTONS = [
  { action: "thumbs" as const, title: "Pages", icon: "⊟" },
  { action: "shapes" as const, title: "Shapes", icon: "◇" },
  { action: "chat" as const, title: "Chat", icon: "💬" },
  { action: "support" as const, title: "Feedback & Support", icon: "❓" },
  { action: "about" as const, title: "About", icon: "ℹ" },
]

function LeftMenuInner(): JSX.Element {
  return (
    <div
      className="visio-left-menu"
      role="menubar"
      aria-orientation="vertical"
      aria-label="Left menu"
    >
      <div className="visio-left-menu-btns">
        {BUTTONS.map(({ action, title, icon }) => (
          <LeftMenuButton
            key={action}
            action={action}
            title={title}
            icon={icon}
            active={visioStore.activeLeftPanel === action}
            onClick={() => visioStore.toggleLeftPanel(action)}
          />
        ))}
      </div>
      <div className="visio-left-panel-side">
        <div
          className="visio-left-panel-chat"
          style={{ display: visioStore.activeLeftPanel === "chat" ? "block" : "none" }}
        />
        <div
          className="visio-left-panel-shapes"
          style={{ display: visioStore.activeLeftPanel === "shapes" ? "block" : "none" }}
        >
          <ShapePalette />
        </div>
      </div>
    </div>
  )
}

export const LeftMenu = observer(LeftMenuInner)
