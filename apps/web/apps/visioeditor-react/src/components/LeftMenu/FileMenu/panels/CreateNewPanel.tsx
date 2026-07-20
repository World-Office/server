import { flowchartStore } from "../../../../stores/FlowchartStore"
import { visioStore } from "../../../../stores/VisioStore"

interface TemplateInfo {
  id: string
  name: string
  description: string
  icon: string
}

const TEMPLATES: TemplateInfo[] = [
  { id: "blank", name: "Blank Diagram", description: "Empty diagram canvas", icon: "📄" },
  { id: "flowchart", name: "Flowchart", description: "Process flow diagram", icon: "🔀" },
  { id: "org-chart", name: "Org Chart", description: "Organizational hierarchy", icon: "🏢" },
  { id: "network", name: "Network Diagram", description: "Network topology map", icon: "🌐" },
]

export function CreateNewPanel({ visible }: { visible: boolean }) {
  function handleUseTemplate(id: string): void {
    if (id === "blank") {
      flowchartStore.clear()
      flowchartStore.history = []
      flowchartStore.future = []
    } else if (id === "flowchart") {
      flowchartStore.clear()
      flowchartStore.history = []
      flowchartStore.future = []
    } else if (id === "org-chart") {
      flowchartStore.clear()
      flowchartStore.history = []
      flowchartStore.future = []
    } else if (id === "network") {
      flowchartStore.clear()
      flowchartStore.history = []
      flowchartStore.future = []
    }
    visioStore.setFileMenuOpen(false)
    visioStore.setActiveFileMenuPanel(null)
  }

  return (
    <div
      className="visio-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0", flexDirection: "column" }}
    >
      <div className="visio-file-menu-header">Create New</div>
      <div className="visio-file-menu-formats">
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="visio-template-card"
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
            <div className="visio-template-icon">{tpl.icon}</div>
            <div className="visio-template-info">
              <div className="visio-template-name">{tpl.name}</div>
              <div className="visio-template-desc">{tpl.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
