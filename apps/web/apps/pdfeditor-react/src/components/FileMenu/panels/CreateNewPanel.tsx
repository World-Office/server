import { pdfStore } from "../../../stores/PdfStore"

interface TemplateInfo {
  id: string
  name: string
  description: string
  icon: string
}

const TEMPLATES: TemplateInfo[] = [
  { id: "blank", name: "Blank PDF", description: "Empty PDF document", icon: "📄" },
  { id: "form", name: "Form", description: "Fillable form template", icon: "📋" },
  { id: "report", name: "Report", description: "Business report template", icon: "📊" },
]

export function CreateNewPanel({ visible }: { visible: boolean }) {
  function handleUseTemplate(_id: string): void {
    pdfStore.setFileMenuOpen(false)
    pdfStore.setActiveFileMenuPanel(null)
  }

  return (
    <div
      className="pdf-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0", flexDirection: "column" }}
    >
      <div className="pdf-file-menu-header">Create New</div>
      <div className="pdf-file-menu-formats">
        {TEMPLATES.map((tpl) => (
          <button
            type="button"
            key={tpl.id}
            className="pdf-template-card"
            onClick={() => handleUseTemplate(tpl.id)}
          >
            <div className="pdf-template-icon">{tpl.icon}</div>
            <div className="pdf-template-info">
              <div className="pdf-template-name">{tpl.name}</div>
              <div className="pdf-template-desc">{tpl.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
