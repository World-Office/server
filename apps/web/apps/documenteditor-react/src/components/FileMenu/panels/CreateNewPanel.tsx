import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { documentStore } from "../../../stores/DocumentStore"

interface TemplateInfo {
  id: string
  name: string
  description: string
  icon: string
}

const TEMPLATES: TemplateInfo[] = [
  { id: "blank", name: "Blank", description: "Empty document", icon: "📄" },
  { id: "resume", name: "Resume", description: "Professional CV template", icon: "👤" },
  { id: "letter", name: "Formal Letter", description: "Business correspondence", icon: "✉" },
  { id: "invoice", name: "Invoice", description: "Billing template with table", icon: "💰" },
  { id: "report", name: "Report", description: "Structured report with sections", icon: "📊" },
]

export function CreateNewPanel({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState("")

  useEffect(() => {
    if (preview) {
      fetch(`/templates/${preview}.html`)
        .then((r) => r.text())
        .then(setPreviewHtml)
        .catch(() => setPreviewHtml(""))
    }
  }, [preview])

  function handleUseTemplate(id: string): void {
    if (id === "blank") {
      documentStore.updateRichText("")
    } else {
      fetch(`/templates/${id}.html`)
        .then((r) => r.text())
        .then((html) => {
          documentStore.updateRichText(html)
        })
        .catch(() => {
          documentStore.updateRichText("")
        })
    }
    documentStore.setFilePath(null)
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
    documentStore.setCurrentPage(0)
    documentStore.setTotalPages(1)
    documentStore.setZoomLevel(100)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0", flexDirection: "column" }}
    >
      <div className="de-file-menu-header">{t("Create New")}</div>
      <div className="de-file-menu-formats">
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="de-template-card"
            onMouseEnter={() => setPreview(tpl.id)}
            onMouseLeave={() => setPreview(null)}
            onClick={() => handleUseTemplate(tpl.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleUseTemplate(tpl.id)
              }
            }}
          >
            <div className="de-template-icon">{tpl.icon}</div>
            <div className="de-template-info">
              <div className="de-template-name">{tpl.name}</div>
              <div className="de-template-desc">{t(tpl.description)}</div>
            </div>
          </div>
        ))}
      </div>
      {preview && previewHtml && (
        <div className="de-template-preview">
          <div className="de-template-preview-header">Preview</div>
          <div
            className="de-template-preview-body"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}
    </div>
  )
}
