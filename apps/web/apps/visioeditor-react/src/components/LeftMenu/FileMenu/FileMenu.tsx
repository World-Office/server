import { type ExportFormat, ExportWizard } from "@world-office/editor-common";
import { useCallback } from "react";
import type { CSSProperties } from "react";
import { visioStore } from "../../../stores/VisioStore";
import { FileMenuItems } from "./FileMenuItems";
import { CreateNewPanel } from "./panels/CreateNewPanel";
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

	const VISIO_FORMATS: ExportFormat[] = [
		{
			id: "wo-flowchart",
			label: "WO Flowchart",
			description: "World-Office Diagram",
			extension: ".wo-flowchart",
		},
		{
			id: "vsdx",
			label: "VSDX",
			description: "Visio Drawing",
			extension: ".vsdx",
		},
		{
			id: "pdf",
			label: "PDF",
			description: "Portable Document Format",
			extension: ".pdf",
		},
	];

	const handleExport = useCallback(
		async (format: ExportFormat): Promise<boolean> => {
			try {
				if (format.id === "wo-flowchart") {
					visioStore.exportAsDownload();
					return true;
				}
				// For VSDX/PDF, use conversion service if available
				const visioBlob = visioStore.buildDocumentBlob();
				const json = await visioBlob.text();
				const res = await fetch(
					import.meta.env?.VITE_CONVERSION_API_URL ??
						"http://localhost:8003/convert",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							input_format: "wo-visio-diagram",
							output_format: format.id,
							data: btoa(json),
						}),
					},
				);
				if (!res.ok) return false;
				const result = await res.json();
				const outputB64: string | undefined =
					result?.data ?? result?.job?.output_data;
				if (!outputB64) return false;
				const bin = atob(outputB64);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				const mime =
					format.id === "pdf"
						? "application/pdf"
						: "application/vnd.ms-visio.drawing";
				const blob = new Blob([bytes], { type: mime });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `diagram${format.extension}`;
				a.click();
				URL.revokeObjectURL(url);
				return true;
			} catch {
				return false;
			}
		},
		[],
	);

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
					<CreateNewPanel visible={activePanel === "new"} />
					<SaveAsPanel visible={activePanel === "saveas"} />
					<SettingsPanel visible={activePanel === "opts"} />
					<DocumentInfoPanel visible={activePanel === "info"} />
					<HelpPanel visible={activePanel === "help"} />
					<PrintPreviewPanel visible={activePanel === "printpreview"} />
				</div>
			</div>

			{activePanel === "export" && (
				<ExportWizard
					visible
					groups={[{ heading: "Diagram", formats: VISIO_FORMATS }]}
					onExport={handleExport}
					onClose={() => visioStore.setActiveFileMenuPanel(null)}
				/>
			)}
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
