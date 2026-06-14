import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { visioStore } from "../../stores/VisioStore"
import { PageTabs } from "./PageTabs"
import { SheetList } from "./SheetList"
import { ZoomControls } from "./ZoomControls"

function SaveIndicator(): JSX.Element {
  let label = ""
  let cls = "visio-save-indicator"
  if (visioStore.isSaving) {
    label = "Saving..."
    cls += " saving"
  } else if (visioStore.isModified) {
    label = "Unsaved changes"
    cls += " modified"
  } else if (visioStore.isDocReady) {
    label = "Saved"
  }
  if (!label) return <span />
  return <span className={cls}>{label}</span>
}

const ObservedStatusBar = observer(function ObservedStatusBar(): JSX.Element {
  const isCompact = visioStore.isCompactStatusbar

  return (
    <div className={`visio-statusbar${isCompact ? "" : " visio-statusbar-no-compact"}`}>
      <div className="visio-statusbar-tabs-scroll">
        <button
          type="button"
          className="visio-statusbar-btn"
          title="Previous page"
          onClick={() =>
            visioStore.setCurrentPageIndex(Math.max(0, visioStore.currentPageIndex - 1))
          }
        >
          ‹
        </button>
        <button
          type="button"
          className="visio-statusbar-btn"
          title="Next page"
          onClick={() =>
            visioStore.setCurrentPageIndex(
              Math.min(visioStore.pageCount - 1, visioStore.currentPageIndex + 1),
            )
          }
        >
          ›
        </button>
      </div>

      <div className="visio-statusbar-addtabs-box">
        <SheetList />
      </div>

        <div className="visio-statusbar-zoom-box">
        <div className="visio-statusbar-separator" />
        <SaveIndicator />
        <div className="visio-statusbar-separator" />
        <ZoomControls />
      </div>

      <div className="visio-statusbar-sheets-bar-box">
        <PageTabs />
      </div>

      {!isCompact && (
        <div className="visio-statusbar-number-of-sheet">
          <span className="visio-statusbar-label">
            {visioStore.pageCount > 0
              ? `Page ${visioStore.currentPageIndex + 1} of ${visioStore.pageCount}`
              : ""}
          </span>
        </div>
      )}
    </div>
  )
})

export { ObservedStatusBar as StatusBar }
