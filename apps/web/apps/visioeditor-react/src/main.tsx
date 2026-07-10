import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles/visio.css"
import "./styles/toolbar.css"
import "./styles/statusbar.css"
import "./styles/leftmenu.css"
import "./styles/filemenu.css"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
