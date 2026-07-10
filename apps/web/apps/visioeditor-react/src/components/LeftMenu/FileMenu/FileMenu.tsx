import type { CSSProperties } from "react";
import { visioStore } from "../../../stores/VisioStore";
import { FileMenuItems } from "./FileMenuItems";
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel";
import { HelpPanel } from "./panels/HelpPanel";
import { SaveAsPanel } from "./panels/SaveAsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";

const panelContainerStyle: CSSProperties = {
	width: "100%",
	paddingLeft: "260px",
	backgroundColor: "var(--wo-color-bg-primary, #ffffff)",
};

const contentBoxBaseStyle: CSSProperties = {
	height: "100%",
	padding: "0 20px",
	position: "relative",
	overflow: "hidden",
	display: "none",
};

export function FileMenu() {
	const activePanel = visioStore.activeFileMenuPanel;

	function handleMenuClick(action: string, hasPanel: boolean): void {
		if (hasPanel) {
			const newPanel =
				visioStore.activeFileMenuPanel === action ? null : action;
			visioStore.setActiveFileMenuPanel(newPanel);
		}
	}

	function handleBack(): void {
		visioStore.setActiveFileMenuPanel(null);
		visioStore.setFileMenuOpen(false);
	}

	return (
		<div className="visio-file-menu">
			<div
				className="visio-file-menu-list"
				role="menubar"
				aria-label="File menu"
			>
				<FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
			</div>
			<div style={panelContainerStyle}>
				<div className="visio-file-menu-panel-box" style={contentBoxBaseStyle}>
					<SaveAsPanel visible={activePanel === "saveas"} />
					<SettingsPanel visible={activePanel === "opts"} />
					<DocumentInfoPanel visible={activePanel === "info"} />
					<HelpPanel visible={activePanel === "help"} />
					<PrintPreviewPanel visible={activePanel === "printpreview"} />
				</div>
			</div>
		</div>
	);
}

function PrintPreviewPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="visio-file-menu-content-box"
			style={{
				...contentBoxBaseStyle,
				display: visible ? "block" : "none",
				padding: 0,
			}}
		>
			<div className="visio-file-menu-header">Print Preview</div>
		</div>
	);
}
