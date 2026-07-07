import { CollaborationStatus, CollaboratorList } from "@world-office/collaboration-react"
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { collaborationStore } from "../../lib/collaboration"
import { documentStore } from "../../stores/DocumentStore"

function ZoomControls(): JSX.Element {
  return (
    <>
      <div className="de-statusbar-separator" />
      <button
        type="button"
        className={`de-statusbar-btn${documentStore.fitToPage ? " active" : ""}`}
        title="Fit to page"
        onClick={() => documentStore.setFitToPage(!documentStore.fitToPage)}
      >
        ⊞
      </button>
      <button
        type="button"
        className={`de-statusbar-btn${documentStore.fitToWidth ? " active" : ""}`}
        title="Fit to width"
        onClick={() => documentStore.setFitToWidth(!documentStore.fitToWidth)}
      >
        ⇔
      </button>
      <button
        type="button"
        className="de-statusbar-btn"
        title="Zoom Out"
        onClick={() => documentStore.zoomOut()}
      >
        −
      </button>
      <div className="de-statusbar-zoom-label">
        <span className="de-statusbar-label">{`${documentStore.zoomLevel}%`}</span>
      </div>
      <button
        type="button"
        className="de-statusbar-btn"
        title="Zoom In"
        onClick={() => documentStore.zoomIn()}
      >
        +
      </button>
    </>
  )
}

const ObservedStatusBar = observer(function ObservedStatusBar(): JSX.Element {
  const { currentPage, totalPages, languageCode, wordCount, trackChanges, spellingEnabled } =
    documentStore

  return (
    <div className="de-statusbar">
      {/* Page navigation */}
      <div className="de-statusbar-page-nav">
        <button
          type="button"
          className="de-statusbar-btn"
          title="Previous page"
          disabled={currentPage <= 0}
          onClick={() => documentStore.setCurrentPage(currentPage - 1)}
        >
          ‹
        </button>
        <span className="de-statusbar-page-label">
          Page {currentPage + 1} of {totalPages}
        </span>
        <button
          type="button"
          className="de-statusbar-btn"
          title="Next page"
          disabled={currentPage >= totalPages - 1}
          onClick={() => documentStore.setCurrentPage(currentPage + 1)}
        >
          ›
        </button>
      </div>

      {/* Select/Hand tool */}
      <div className="de-statusbar-tools">
        <button type="button" className="de-statusbar-btn" title="Select Tool">
          ↖
        </button>
        <button type="button" className="de-statusbar-btn" title="Hand Tool">
          ✋
        </button>
      </div>

      <div className="de-statusbar-separator" />

      {/* Language selector */}
      <div className="de-statusbar-tools">
        <select className="de-statusbar-select" value={languageCode} aria-label="Language">
          <option value="en-US">English (US)</option>
          <option value="es-ES">Spanish (ES)</option>
          <option value="fr-FR">French (FR)</option>
          <option value="de-DE">German (DE)</option>
          <option value="it-IT">Italian (IT)</option>
          <option value="pt-BR">Portuguese (PT)</option>
          <option value="ru-RU">Russian (RU)</option>
          <option value="zh-CN">Chinese (ZH)</option>
          <option value="ja-JP">Japanese (JA)</option>
        </select>
      </div>

      {/* Word count */}
      <div className="de-statusbar-tools">
        <span className="de-statusbar-label">Words: {wordCount}</span>
      </div>

      {/* Desktop file info */}
      {documentStore.isDesktop && (
        <div className="de-statusbar-tools">
          <span className="de-statusbar-label" title={documentStore.filePath ?? undefined}>
            {documentStore.fileName}
            {documentStore.isDirty ? " \u2022" : ""}
          </span>
        </div>
      )}

      <div className="de-statusbar-separator" />

      {/* Track changes */}
      <div className="de-statusbar-tools">
        <button
          type="button"
          className={`de-statusbar-btn${trackChanges ? " active" : ""}`}
          title="Track Changes"
          onClick={() => documentStore.setTrackChanges(!trackChanges)}
        >
          📝
        </button>
      </div>

      {/* Spelling */}
      <div className="de-statusbar-tools">
        <button
          type="button"
          className={`de-statusbar-btn${spellingEnabled ? " active" : ""}`}
          title="Spelling"
          onClick={() => documentStore.setSpellingEnabled(!spellingEnabled)}
        >
          ✓
        </button>
      </div>

      <div className="de-statusbar-separator" />

      {/* Collaboration status + user avatars */}
      <div className="de-statusbar-tools" style={{ gap: 8 }}>
        <CollaborationStatus
          state={collaborationStore.connectionStatus}
          userCount={collaborationStore.users.length}
        />
        <CollaboratorList users={collaborationStore.users} />
      </div>

      {/* Save indicator */}
      <div className="de-statusbar-tools">
        {documentStore.isDirty ? (
          <span className="de-statusbar-label" style={{ color: "#e67e22" }}>
            • Unsaved
          </span>
        ) : documentStore.lastSavedAt ? (
          <span className="de-statusbar-label" style={{ color: "#27ae60" }}>
            Saved {documentStore.lastSavedAt.toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      {/* Zoom controls */}
      <div className="de-statusbar-zoom-box">
        <ZoomControls />
      </div>
    </div>
  )
})

export { ObservedStatusBar as StatusBar }
