import deLocale from "@world-office/editor-common/locales/de.json";
import { createI18n } from "@world-office/i18n";
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

createI18n({
	lng: navigator.language.startsWith("de") ? "de" : "en",
	fallbackLng: "en",
	resources: {
		de: { translation: deLocale as Record<string, string> },
	},
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
