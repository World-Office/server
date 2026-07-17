import { CollaborationStatus, CollaboratorList } from "@world-office/collaboration-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FilePenLine,
  Hand,
  Maximize2,
  Minimize2,
  MousePointerClick,
  SpellCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { collaborationStore } from "../../lib/collaboration"
import { documentStore } from "../../stores/DocumentStore"

function ZoomControls(): JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      <div className="de-statusbar-separator" />
      <button
        type="button"
        className={`de-statusbar-btn${documentStore.fitToPage ? " active" : ""}`}
        title={t("Fit to Page")}
        onClick={() => documentStore.setFitToPage(!documentStore.fitToPage)}
      >
        <Maximize2 size={14} />
      </button>
      <button
        type="button"
        className={`de-statusbar-btn${documentStore.fitToWidth ? " active" : ""}`}
        title={t("Fit to Width")}
        onClick={() => documentStore.setFitToWidth(!documentStore.fitToWidth)}
      >
        <Minimize2 size={14} />
      </button>
      <button
        type="button"
        className="de-statusbar-btn"
        title={t("Zoom Out")}
        onClick={() => documentStore.zoomOut()}
      >
        <ZoomOut size={14} />
      </button>
      <div className="de-statusbar-zoom-label">
        <span className="de-statusbar-label">{`${documentStore.zoomLevel}%`}</span>
      </div>
      <button
        type="button"
        className="de-statusbar-btn"
        title={t("Zoom In")}
        onClick={() => documentStore.zoomIn()}
      >
        <ZoomIn size={14} />
      </button>
    </>
  )
}

const ObservedStatusBar = observer(function ObservedStatusBar(): JSX.Element {
  const { t } = useTranslation()
  const { currentPage, totalPages, languageCode, wordCount, trackChanges, spellingEnabled } =
    documentStore
  const [activeTool, setActiveTool] = useState<"select" | "hand">("select")

  return (
    <div className="de-statusbar">
      {/* Page navigation */}
      <div className="de-statusbar-page-nav">
        <button
          type="button"
          className="de-statusbar-btn"
          title={t("Previous page")}
          disabled={currentPage <= 0}
          onClick={() => documentStore.setCurrentPage(currentPage - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="de-statusbar-page-label">
          {t("Page {{current}} of {{total}}", { current: currentPage + 1, total: totalPages })}
        </span>
        <button
          type="button"
          className="de-statusbar-btn"
          title={t("Next page")}
          disabled={currentPage >= totalPages - 1}
          onClick={() => documentStore.setCurrentPage(currentPage + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Select/Hand tool */}
      <div className="de-statusbar-tools">
        <button
          type="button"
          className={`de-statusbar-btn${activeTool === "select" ? " active" : ""}`}
          title={t("Select Tool")}
          onClick={() => setActiveTool("select")}
        >
          <MousePointerClick size={14} />
        </button>
        <button
          type="button"
          className={`de-statusbar-btn${activeTool === "hand" ? " active" : ""}`}
          title={t("Hand Tool")}
          onClick={() => setActiveTool("hand")}
        >
          <Hand size={14} />
        </button>
      </div>

      <div className="de-statusbar-separator" />

      {/* Language selector */}
      <div className="de-statusbar-tools">
        <select className="de-statusbar-select" value={languageCode} aria-label={t("Language")} onChange={(e) => documentStore.setLanguageCode(e.target.value)}>
          <option value="en-US">EN</option>
          <option value="es-ES">ES</option>
          <option value="fr-FR">FR</option>
          <option value="de-DE">DE</option>
          <option value="it-IT">IT</option>
          <option value="pt-BR">PT</option>
          <option value="ru-RU">RU</option>
          <option value="zh-CN">ZH</option>
          <option value="ja-JP">JA</option>
        </select>
      </div>

      {/* Word count */}
      <div className="de-statusbar-tools">
        <span className="de-statusbar-label">{t("Words: {{count}}", { count: wordCount })}</span>
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
          title={t("Track Changes")}
          onClick={() => documentStore.setTrackChanges(!trackChanges)}
        >
          <FilePenLine size={14} />
        </button>
      </div>

      {/* Spelling */}
      <div className="de-statusbar-tools">
        <button
          type="button"
          className={`de-statusbar-btn${spellingEnabled ? " active" : ""}`}
          title={t("Spell Check")}
          onClick={() => documentStore.setSpellingEnabled(!spellingEnabled)}
        >
          <SpellCheck size={14} />
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
            <Clock
              size={12}
              style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
            />
            {t("Unsaved")}
          </span>
        ) : documentStore.lastSavedAt ? (
          <span className="de-statusbar-label" style={{ color: "#27ae60" }}>
            <Check
              size={12}
              style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
            />
            {t("Saved")} {documentStore.lastSavedAt.toLocaleTimeString()}
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
