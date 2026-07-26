import {
	type EmailConfig,
	type ExportFormat,
	ExportWizard,
} from "@world-office/editor-common";
import { useCallback } from "react";
import type { CSSProperties } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import { FileMenuItems } from "./FileMenuItems";
import { CreateNewPanel } from "./panels/CreateNewPanel";
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel";
import { HelpPanel } from "./panels/HelpPanel";
import { PrintPreviewPanel } from "./panels/PrintPreviewPanel";
import { ProtectPanel } from "./panels/ProtectPanel";
import { RecentFilesPanel } from "./panels/RecentFilesPanel";
import { RightsPanel } from "./panels/RightsPanel";
import { SaveAsPanel } from "./panels/SaveAsPanel";
import { SaveCopyPanel } from "./panels/SaveCopyPanel";
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
	const activePanel = presentationStore.activeFileMenuPanel;

	function handleMenuClick(action: string, hasPanel: boolean): void {
		if (hasPanel) {
			const newPanel =
				presentationStore.activeFileMenuPanel === action ? null : action;
			presentationStore.setActiveFileMenuPanel(newPanel);
		} else {
			presentationStore.setFileMenuOpen(false);
		}
	}

	function handleBack(): void {
		presentationStore.setActiveFileMenuPanel(null);
		presentationStore.setFileMenuOpen(false);
	}

	const PRESENTATION_FORMATS: ExportFormat[] = [
		{
			id: "pptx",
			label: "PPTX",
			description: "PowerPoint Presentation",
			extension: ".pptx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		},
		{
			id: "odp",
			label: "ODP",
			description: "OpenDocument Presentation",
			extension: ".odp",
			mimeType: "application/vnd.oasis.opendocument.presentation",
		},
		{
			id: "pdf",
			label: "PDF",
			description: "Portable Document Format",
			extension: ".pdf",
			mimeType: "application/pdf",
		},
	];

	const handleExport = useCallback(
		async (format: ExportFormat): Promise<boolean> => {
			try {
				const json = presentationStore.toJSON();
				const b64 = btoa(json);
				// Get conversion API URL from the export-service module
				const { CONVERSION_API_URL, downloadBlob: dlBlob } = await import(
					"../../lib/export-service"
				);
				const convUrl = CONVERSION_API_URL;

				const res = await fetch(`${convUrl}/convert`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						input_format: "wo-presentation",
						output_format: format.id,
						data: b64,
					}),
				});
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
						: "application/vnd.openxmlformats-officedocument.presentationml.presentation";
				const blob = new Blob([bytes], { type: mime });
				dlBlob(blob, `presentation${format.extension}`);
				return true;
			} catch {
				return false;
			}
		},
		[],
	);

	const emailConfig: EmailConfig = {
		endpoint: "/api/send-email-attachment",
		async produceAttachment(formatId: string) {
			try {
				const json = presentationStore.toJSON();
				const b64 = btoa(json);
				const { CONVERSION_API_URL } = await import("../../lib/export-service");
				const convUrl = CONVERSION_API_URL;

				const res = await fetch(`${convUrl}/convert`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						input_format: "wo-presentation",
						output_format: formatId,
						data: b64,
					}),
				});
				if (!res.ok) return null;
				const result = await res.json();
				const outputB64: string | undefined =
					result?.data ?? result?.job?.output_data;
				if (!outputB64) return null;
				const bin = atob(outputB64);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				const fmt = PRESENTATION_FORMATS.find((f) => f.id === formatId);
				const mime = fmt?.mimeType ?? "application/octet-stream";
				const blob = new Blob([bytes], { type: mime });
				return {
					blob,
					fileName: `presentation${fmt?.extension ?? `.${formatId}`}`,
					mimeType: mime,
				};
			} catch {
				return null;
			}
		},
		defaultSubject: "Presentation: {{fileName}}",
	};

	return (
		<div className="prese-file-menu">
			<div
				className="prese-file-menu-list"
				role="menubar"
				aria-label="File menu"
			>
				<FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
			</div>
			<div style={panelContainerStyle}>
				<div className="prese-file-menu-panel-box" style={contentBoxBaseStyle}>
					<SaveAsPanel visible={activePanel === "saveas"} />
					<SaveCopyPanel visible={activePanel === "save-copy"} />
					<RecentFilesPanel visible={activePanel === "recent"} />
					<CreateNewPanel visible={activePanel === "create-new"} />
					<DocumentInfoPanel visible={activePanel === "info"} />
					<RightsPanel visible={activePanel === "rights"} />
					<SettingsPanel visible={activePanel === "opts"} />
					<HelpPanel visible={activePanel === "help"} />
					<ProtectPanel visible={activePanel === "protect"} />
					<PrintPreviewPanel visible={activePanel === "printpreview"} />
				</div>
			</div>

			{activePanel === "export" && (
				<ExportWizard
					visible
					groups={[{ heading: "Presentation", formats: PRESENTATION_FORMATS }]}
					onExport={handleExport}
					emailConfig={emailConfig}
					onClose={() => presentationStore.setActiveFileMenuPanel(null)}
				/>
			)}
		</div>
	);
}
