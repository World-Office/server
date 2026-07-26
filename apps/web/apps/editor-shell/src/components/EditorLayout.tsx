import type { EditorConfig } from "@/types/editor"
import { type ComponentType, type ReactNode, Suspense, lazy, useEffect, useState } from "react"
import { useIsMobile } from "../hooks/useMediaQuery"
import { Canvas } from "./Canvas"
import { ErrorBoundary } from "./ErrorBoundary"
import { ShortcutsOverlay } from "./ShortcutsOverlay"
import { StatusBar } from "./StatusBar"
import { TabBar } from "./TabBar"
import { Toolbar } from "./Toolbar"

// Lazy-loaded panels (deferred until needed)
const LeftPanel = lazy(() => import("./LeftPanel").then((m) => ({ default: m.LeftPanel })))
const RightPanel = lazy(() => import("./RightPanel").then((m) => ({ default: m.RightPanel })))

// Deferred feature modules (loaded only when their feature is activated)
const AdminPanel = lazy<ComponentType<{ onClose: () => void }>>(
  () => import("../features/admin/AdminPanel"),
)
const CollaborationOverlay = lazy<ComponentType<Record<string, never>>>(
  () => import("../features/collaboration/CollaborationOverlay"),
)
const PluginManager = lazy<ComponentType<{ visible: boolean; onClose: () => void }>>(
  () => import("../features/plugins/PluginManager"),
)

interface EditorLayoutProps {
  editorType: EditorConfig["type"]
  children?: ReactNode
  showLeftPanel?: boolean
  showRightPanel?: boolean
  showTabBar?: boolean
  error?: string | null
  notFound?: boolean
  isAdmin?: boolean
  isCollaboration?: boolean
  isWopi?: boolean
  showPluginManager?: boolean
  onClosePluginManager?: () => void
}

export function EditorLayout({
  editorType,
  children,
  showLeftPanel = false,
  showRightPanel = false,
  showTabBar = true,
  error = null,
  notFound = false,
  isAdmin = false,
  isCollaboration = false,
  isWopi = false,
  showPluginManager = false,
  onClosePluginManager,
}: EditorLayoutProps) {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [adminActive, setAdminActive] = useState(false)
  const [collabActive, setCollabActive] = useState(false)
  const [pluginActive, setPluginActive] = useState(false)

  // Deferred feature activation: modules only load when their feature is triggered
  useEffect(() => {
    if (isAdmin) setAdminActive(true)
  }, [isAdmin])

  useEffect(() => {
    if (isCollaboration) setCollabActive(true)
  }, [isCollaboration])

  useEffect(() => {
    if (showPluginManager) setPluginActive(true)
  }, [showPluginManager])

  if (notFound) {
    return (
      <div className="editor-layout editor-layout--error" role="alert">
        <div className="editor-error-page">
          <h1>404</h1>
          <p>The requested page was not found.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="editor-layout editor-layout--error" role="alert">
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
      <header className="editor-toolbar">
        <Toolbar editorType={editorType} />
      </header>
      <main className="editor-body">
        {showTabBar && <TabBar editorType={editorType} />}
        {showLeftPanel && (
          <Suspense fallback={<div className="editor-panel-skeleton" />}>
            <LeftPanel onClose={isMobile ? () => setShowMobileLeft(false) : undefined} />
          </Suspense>
        )}
        <Canvas>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Canvas>
        {showRightPanel && (
          <Suspense fallback={<div className="editor-panel-skeleton" />}>
            <RightPanel onClose={isMobile ? () => setShowMobileRight(false) : undefined} />
          </Suspense>
        )}
      </main>
      <footer className="editor-statusbar">
        <StatusBar
          isWopi={isWopi}
          connectionStatus={isCollaboration ? "connected" : undefined}
          isModified={false}
          userCount={isCollaboration ? 1 : 0}
        />
      </footer>

      <ShortcutsOverlay visible={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Deferred feature overlays — modules loaded only when activated */}
      {adminActive && (
        <Suspense fallback={null}>
          <AdminPanel onClose={() => setAdminActive(false)} />
        </Suspense>
      )}
      {collabActive && (
        <Suspense fallback={null}>
          <CollaborationOverlay />
        </Suspense>
      )}
      {pluginActive && onClosePluginManager && (
        <Suspense fallback={null}>
          <PluginManager visible onClose={onClosePluginManager} />
        </Suspense>
      )}

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
