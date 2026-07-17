import type { EditorConfig } from "@/types/editor"
import { type ReactNode, useEffect, useState } from "react"
import { useIsMobile } from "../hooks/useMediaQuery"
import { Canvas } from "./Canvas"
import { ErrorBoundary } from "./ErrorBoundary"
import { LeftPanel } from "./LeftPanel"
import { RightPanel } from "./RightPanel"
import { ShortcutsOverlay } from "./ShortcutsOverlay"
import { StatusBar } from "./StatusBar"
import { TabBar } from "./TabBar"
import { Toolbar } from "./Toolbar"

interface EditorLayoutProps {
  editorType: EditorConfig["type"]
  children?: ReactNode
  showLeftPanel?: boolean
  showRightPanel?: boolean
  showTabBar?: boolean
  error?: string | null
  notFound?: boolean
}

export function EditorLayout({
  editorType,
  children,
  showLeftPanel = false,
  showRightPanel = false,
  showTabBar = true,
  error = null,
  notFound = false,
}: EditorLayoutProps) {
  const [showShortcuts, setShowShortcuts] = useState(false)

  if (notFound) {
    return (
      <div className="editor-layout editor-layout--error">
        <div className="editor-error-page">
          <h1>404</h1>
          <p>The requested page was not found.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="editor-layout editor-layout--error">
        <div className="editor-error-page">
          <h1>Error</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const isMobile = useIsMobile()
  const [showMobileLeft, setShowMobileLeft] = useState(false)
  const [showMobileRight, setShowMobileRight] = useState(false)
  const [showEditToast, setShowEditToast] = useState(false)
  const [toastKey, setToastKey] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement).isContentEditable) {
          e.preventDefault()
          setShowShortcuts((v) => !v)
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const layoutClass = [
    "editor-layout",
    isMobile ? "editor-layout--mobile" : "",
    showMobileLeft ? "editor-layout--show-left" : "",
    showMobileRight ? "editor-layout--show-right" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={layoutClass}>
      <div className="editor-toolbar">
        <Toolbar editorType={editorType} />
      </div>
      <div className="editor-body">
        {showTabBar && <TabBar editorType={editorType} />}
        {showLeftPanel && (
          <LeftPanel onClose={isMobile ? () => setShowMobileLeft(false) : undefined} />
        )}
        <Canvas>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Canvas>
        {showRightPanel && (
          <RightPanel onClose={isMobile ? () => setShowMobileRight(false) : undefined} />
        )}
      </div>
      <div className="editor-statusbar">
        <StatusBar />
      </div>

      <ShortcutsOverlay visible={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {isMobile && (
        <>
          <button
            type="button"
            className="editor-mobile-fab"
            onClick={() => {
              setShowEditToast(true)
              setToastKey((k) => k + 1)
            }}
            aria-label="Edit"
          >
            &#9998;
          </button>
          {showEditToast && (
            <div key={toastKey} className="editor-mobile-toast">
              Editing on mobile is limited. Open on desktop for full editing.
            </div>
          )}
        </>
      )}
    </div>
  )
}
