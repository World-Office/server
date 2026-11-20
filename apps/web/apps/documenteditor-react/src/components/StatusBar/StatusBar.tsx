import { CollaborationStatus, CollaboratorList } from "@world-office/collaboration-react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns2,
  FilePenLine,
  Hand,
  Maximize2,
  Minimize2,
  MousePointerClick,
  SpellCheck,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { collaborationStore } from "../../lib/collaboration"
import { documentStore } from "../../stores/DocumentStore"

/**
 * Document languages the picker offers — the same codes the store keeps in
 * languageCode (and the spellchecker dictionaries are keyed by). Labels use
 * OO's statusbar/dialog vocabulary ("English (United States)"), which is also
 * what the statusbar language control shows.
 */
const DOCUMENT_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: "en-US", label: "English (United States)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "it-IT", label: "Italian (Italy)" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ru-RU", label: "Russian (Russia)" },
  { code: "zh-CN", label: "Chinese (China)" },
  { code: "ja-JP", label: "Japanese (Japan)" },
]

/** OO-style display name for a document language code. */
function documentLanguageLabel(code: string): string {
  return DOCUMENT_LANGUAGES.find((entry) => entry.code === code)?.label ?? code
}

/**
 * Document-language picker — the OO "Language" dialog.
 *
 * Disclosed by the statusbar language control (#sb-lang) and by every surface
 * that runs the setDocumentLanguage command (the ctx-menu "Select language"
 * row and the ribbon Language button), which dispatches the
 * world-office:doc-language event. The select (#doc-lang) edits a draft that
 * OK applies to the same documentStore.languageCode the statusbar reads, so
 * the control and the picker can never disagree.
 */
const DocLanguagePicker = observer(function DocLanguagePicker(): JSX.Element | null {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  // Draft selection: the dialog applies on OK (Escape/Cancel discards it),
  // exactly like OO's Language dialog.
  const [draft, setDraft] = useState(documentStore.languageCode)

  // Re-seed the draft whenever the picker (re)opens so it always starts from
  // the live document language.
  useEffect(() => {
    if (documentStore.isDocLangPickerOpen) {
      setDraft(documentStore.languageCode)
      selectRef.current?.focus()
    }
  }, [documentStore.isDocLangPickerOpen])

  // Dialog dismissal: Escape closes, a pointer press outside closes — the
  // same vocabulary the context menus use.
  useEffect(() => {
    if (!documentStore.isDocLangPickerOpen) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") documentStore.closeDocLanguagePicker()
    }
    function onPointerDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        documentStore.closeDocLanguagePicker()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onPointerDown)
    }
  }, [documentStore.isDocLangPickerOpen])

  if (!documentStore.isDocLangPickerOpen) return null

  const buttonStyle = {
    padding: "4px 14px",
    borderRadius: 3,
    border: "1px solid var(--wo-de-border, #d0d0d0)",
    background: "var(--wo-de-bg-secondary, #f5f5f5)",
    color: "var(--wo-de-text-primary, #333)",
    fontSize: 12,
    lineHeight: 1.2,
    cursor: "pointer",
  } as const

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={t("Language")}
      className="de-doc-lang-dialog"
      style={{
        position: "absolute",
        bottom: "100%",
        left: 8,
        marginBottom: 6,
        width: 250,
        padding: "10px 12px 12px",
        background: "var(--wo-de-bg-primary, #fff)",
        border: "1px solid var(--wo-de-border, #d0d0d0)",
        borderRadius: "var(--radius-md, 5px)",
        boxShadow: "var(--shadow-lg, 0 5px 13px rgba(0, 0, 0, 0.16))",
        zIndex: "var(--z-popover, 600)",
        fontFamily: "var(--wo-de-font)",
        fontSize: 12,
        color: "var(--wo-de-text-primary, #333)",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") documentStore.closeDocLanguagePicker()
      }}
    >
      <div
        id="doc-lang-title"
        style={{ marginBottom: 8, fontWeight: 600, whiteSpace: "nowrap" }}
      >
        {t("Language")}
      </div>
      <select
        id="doc-lang"
        ref={selectRef}
        className="de-doc-lang-select"
        aria-label={t("Document language")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{
          width: "100%",
          padding: "4px 6px",
          border: "1px solid var(--wo-de-border, #ccc)",
          borderRadius: 3,
          background: "var(--wo-de-bg-primary, #fff)",
          color: "var(--wo-de-text-primary, #333)",
          fontFamily: "var(--wo-de-font)",
          fontSize: 12,
          outline: "none",
        }}
      >
        {DOCUMENT_LANGUAGES.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.label}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
        <button
          type="button"
          className="de-doc-lang-cancel"
          style={buttonStyle}
          onClick={() => documentStore.closeDocLanguagePicker()}
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          id="btn-doc-lang-ok"
          className="de-doc-lang-ok"
          style={{ ...buttonStyle, fontWeight: 600 }}
          onClick={() => documentStore.applyDocLanguage(draft)}
        >
          {t("OK")}
        </button>
      </div>
    </div>
  )
})

const ZoomControls = observer(function ZoomControls(): JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      <div className="de-statusbar-separator" />
      {/* Multiple pages zoom mode — same documentStore.multiplePages field
          (and same toggleMultiplePages action) as the View tab toggle, so
          both surfaces stay in sync on ONE state. */}
      <button
        type="button"
        className={`de-statusbar-btn de-statusbar-multipage${documentStore.multiplePages ? " active" : ""}`}
        title={t("Multiple Pages")}
        aria-pressed={documentStore.multiplePages}
        onClick={() => documentStore.toggleMultiplePages()}
      >
        <Columns2 size={14} />
      </button>
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
})

const ObservedStatusBar = observer(function ObservedStatusBar(): JSX.Element {
  const { t } = useTranslation()
  const {
    currentPage,
    totalPages,
    languageCode,
    wordCount,
    trackChanges,
    coEditingMode,
    spellingEnabled,
    statusMessage,
  } = documentStore
  const [activeTool, setActiveTool] = useState<"select" | "hand">("select")

  // setDocumentLanguage (ctx-menu "Select language" row, ribbon Language
  // button) discloses the picker through this event — the statusbar owns the
  // picker surface, the store owns the open flag and the language itself.
  useEffect(() => {
    function openDocLanguage(e: Event): void {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail
      if (!detail || detail.open === false) return
      documentStore.openDocLanguagePicker()
    }
    window.addEventListener("world-office:doc-language", openDocLanguage)
    return () => window.removeEventListener("world-office:doc-language", openDocLanguage)
  }, [])

  return (
    <div className="de-statusbar">
      {/* Document-language picker — anchored to the statusbar (OO Language
          dialog), opened by #sb-lang or the setDocumentLanguage command. */}
      <DocLanguagePicker />

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

      {/* Document language — the OO statusbar language control. It shows the
          live documentStore.languageCode and opens the document-language
          picker (DocLanguagePicker, select#doc-lang); the ctx-menu "Select
          language" row and the ribbon Language button open the same picker
          through the setDocumentLanguage command. */}
      <div className="de-statusbar-tools">
        <button
          type="button"
          id="sb-lang"
          className="de-statusbar-lang"
          title={t("Language")}
          aria-haspopup="dialog"
          aria-expanded={documentStore.isDocLangPickerOpen}
          onClick={() => documentStore.openDocLanguagePicker()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 20,
            padding: "0 6px",
            border: "1px solid transparent",
            borderRadius: 3,
            background: "transparent",
            color: "var(--wo-de-text-secondary)",
            fontFamily: "var(--wo-de-font)",
            fontSize: 11,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {documentLanguageLabel(languageCode)}
        </button>
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

      {/* Co-editing mode */}
      <div className="de-statusbar-tools">
        <button
          type="button"
          className={`de-statusbar-btn${coEditingMode ? " active" : ""}`}
          title={t("Co-editing Mode")}
          onClick={() => documentStore.setCoEditingMode(!coEditingMode)}
        >
          <Users size={14} />
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

      {/* Action status — transient command feedback (OO statusbar
          action-status slot); empty by default, filled via
          documentStore.setStatusMessage (save/export/spellcheck events). */}
      <div
        className="de-statusbar-status-slot"
        style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden" }}
      >
        <output className="de-statusbar-label de-statusbar-status">
          {statusMessage ? t(statusMessage) : ""}
        </output>
      </div>

      {/* Zoom controls */}
      <div className="de-statusbar-zoom-box">
        <ZoomControls />
      </div>
    </div>
  )
})

export { ObservedStatusBar as StatusBar }
