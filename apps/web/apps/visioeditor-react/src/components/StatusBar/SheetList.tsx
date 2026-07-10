import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { visioStore } from "../../stores/VisioStore"

function SheetListInner(): JSX.Element {
  const tabs = visioStore.pageTabs

  function handleSelect(index: number): void {
    visioStore.setCurrentPageIndex(index)
  }

  function handleKeyDown(e: React.KeyboardEvent, action: () => void): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      action()
    }
  }

  return (
    <div className="visio-statusbar-sheet-list">
      <button type="button" className="visio-statusbar-btn" title="List of pages">
        ☰
      </button>
      {tabs.length > 0 && (
        <div className="visio-statusbar-sheet-dropdown" role="menu">
          {tabs.map((tab) => (
            <div
              key={tab.sheetIndex}
              className={`visio-statusbar-sheet-item${tab.active ? " active" : ""}`}
              role="menuitem"
              tabIndex={0}
              onClick={() => handleSelect(tab.sheetIndex)}
              onKeyDown={(e) => handleKeyDown(e, () => handleSelect(tab.sheetIndex))}
            >
              {tab.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const SheetList = observer(SheetListInner)
