import deLocale from "@world-office/editor-common/locales/de.json"
import { createI18n } from "@world-office/i18n"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { DocumentStore } from "./stores/DocumentStore"
import "./styles/document.css"
import "./styles/toolbar.css"
import "./styles/statusbar.css"
import "./styles/leftmenu.css"
import "./styles/contentlink.css"
import "./styles/rightmenu.css"
import "./styles/filemenu.css"
import "./styles/track-changes.css"
import "./styles/spellcheck.css"

createI18n({
  lng: navigator.language.startsWith("de") ? "de" : "en",
  fallbackLng: "en",
  resources: {
    de: { translation: deLocale as Record<string, string> },
  },
})

// Feature-flag TipTap: when VITE_WO_TIPTAP is false (default), use canvas for docx/odt
// This removes TipTap from the default path by overriding editorType getter
const tiptapEnabled = import.meta.env.VITE_WO_TIPTAP
if (!tiptapEnabled) {
  const originalGetEditorType = Object.getOwnPropertyDescriptor(DocumentStore.prototype, "editorType")?.get
  if (originalGetEditorType) {
    Object.defineProperty(DocumentStore.prototype, "editorType", {
      get(): "canvas" | "monaco" | "richtext" {
        const ext = (this as DocumentStore).fileName.toLowerCase().split(".").pop() ?? ""
        // When TipTap is disabled, use canvas for docx/odt instead of richtext
        if (ext === "docx" || ext === "odt") {
          return "canvas"
        }
        return originalGetEditorType.call(this)
      },
      configurable: true,
    })
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
