import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/presentation.css";
import "./styles/toolbar.css";
import "./styles/statusbar.css";
import "./styles/leftmenu.css";
import "./styles/rightmenu.css";
import "./styles/filemenu.css";
import "./styles/canvas.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
