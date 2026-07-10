import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { visioStore } from "../../stores/VisioStore"

function PageTabsInner(): JSX.Element {
  const tabs = visioStore.pageTabs

  function handleTabClick(index: number): void {
    visioStore.setCurrentPageIndex(index)
  }

  if (tabs.length === 0) {
    return <div className="visio-statusbar-sheets-bar" />
  }

  return (
    <div className="visio-statusbar-sheets-bar">
      <div className="visio-statusbar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.sheetIndex}
            type="button"
            className={`visio-statusbar-page-tab${tab.active ? " active" : ""}`}
            onClick={() => handleTabClick(tab.sheetIndex)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export const PageTabs = observer(PageTabsInner)
