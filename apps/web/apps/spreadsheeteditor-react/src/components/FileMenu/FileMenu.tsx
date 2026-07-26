import {
	type EmailConfig,
	type ExportFormat,
	ExportWizard,
} from "@world-office/editor-common";
import { useCallback } from "react";
import type { CSSProperties } from "react";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import { FileMenuItems } from "./FileMenuItems";
import { CreateNewPanel } from "./panels/CreateNewPanel";
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel";
import { DocumentRightsPanel } from "./panels/DocumentRightsPanel";
import { HelpPanel } from "./panels/HelpPanel";
import { PrintPreviewPanel } from "./panels/PrintPreviewPanel";
import { ProtectPanel } from "./panels/ProtectPanel";
import { RecentFilesPanel } from "./panels/RecentFilesPanel";
import { SaveAsPanel } from "./panels/SaveAsPanel";
import { SaveCopyPanel } from "./panels/SaveCopyPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { SuggestPanel } from "./panels/SuggestPanel";

import { getUniverSnapshot } from "../../lib/univer-command";

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
	const activePanel = spreadsheetStore.activeFileMenuPanel;

	function handleMenuClick(action: string, hasPanel: boolean): void {
		if (hasPanel) {
			const newPanel =
				spreadsheetStore.activeFileMenuPanel === action ? null : action;
			spreadsheetStore.setActiveFileMenuPanel(newPanel);
		} else {
			spreadsheetStore.setFileMenuOpen(false);
		}
	}

	function handleBack(): void {
		spreadsheetStore.setActiveFileMenuPanel(null);
		spreadsheetStore.setFileMenuOpen(false);
	}

	const SPREADSHEET_FORMATS: ExportFormat[] = [
		{
			id: "xlsx",
			label: "XLSX",
			description: "Excel Workbook",
			extension: ".xlsx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		},
		{
			id: "ods",
			label: "ODS",
			description: "OpenDocument Spreadsheet",
			extension: ".ods",
			mimeType: "application/vnd.oasis.opendocument.spreadsheet",
		},
		{
			id: "pdf",
			label: "PDF",
			description: "Portable Document Format",
			extension: ".pdf",
			mimeType: "application/pdf",
		},
		{
			id: "csv",
			label: "CSV",
			description: "Comma-Separated Values",
			extension: ".csv",
			mimeType: "text/csv",
		},
	];

	// Shared helper to produce an export blob for a given format
	const produceSpreadsheetBlob = useCallback(
		async (
			formatId: string,
		): Promise<{ blob: Blob; fileName: string; mimeType: string } | null> => {
			try {
				// XLSX goes through the store's built-in export
				if (formatId === "xlsx") {
					const blob = await spreadsheetStore.buildDocumentBlob();
					if (!blob || blob.size === 0) return null;
					const fileName = spreadsheetStore.document?.title
						? `${spreadsheetStore.document.title.replace(/\.[^.]+$/, "")}.xlsx`
						: "spreadsheet.xlsx";
					return {
						blob,
						fileName,
						mimeType:
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
					};
				}

				const snapshot = getUniverSnapshot();
				if (!snapshot) return null;
				const json = JSON.stringify(snapshot);

				const CONVERSION_URL =
					(typeof window !== "undefined" &&
						(window as unknown as Record<string, string | undefined>)
							.__CONVERSION_API_URL) ||
					"/api/conversion/convert";

				const res = await fetch(CONVERSION_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						source_format: "wo-spreadsheet",
						target_format: formatId,
						data: btoa(json),
					}),
				});
				if (!res.ok) return null;
				const result = await res.json();
				if (!result.data) return null;
				const bin = atob(result.data);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				const fmt = SPREADSHEET_FORMATS.find((f) => f.id === formatId);
				const mime = fmt?.mimeType ?? "application/octet-stream";
				const blob = new Blob([bytes], { type: mime });
				return {
					blob,
					fileName: `spreadsheet${fmt?.extension ?? `.${formatId}`}`,
					mimeType: mime,
				};
			} catch {
				return null;
			}
		},
		[],
	);

	const handleExport = useCallback(
		async (format: ExportFormat): Promise<boolean> => {
			const result = await produceSpreadsheetBlob(format.id);
			if (!result) return false;
			const url = URL.createObjectURL(result.blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = result.fileName;
			a.click();
			URL.revokeObjectURL(url);
			return true;
		},
		[produceSpreadsheetBlob],
	);

	const emailConfig: EmailConfig = {
		endpoint: "/api/send-email-attachment",
		produceAttachment: produceSpreadsheetBlob,
		defaultSubject: "Spreadsheet: {{fileName}}",
	};

	return (
		<div className="se-file-menu">
			<div className="se-file-menu-list" role="menubar" aria-label="File menu">
				<FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
			</div>
			<div style={panelContainerStyle}>
				<div className="se-file-menu-panel-box" style={contentBoxBaseStyle}>
					<SaveAsPanel visible={activePanel === "saveas"} />
					<SaveCopyPanel visible={activePanel === "save-copy"} />
					<RecentFilesPanel visible={activePanel === "recent"} />
					<CreateNewPanel visible={activePanel === "create-new"} />
					<DocumentInfoPanel visible={activePanel === "info"} />
					<DocumentRightsPanel visible={activePanel === "rights"} />
					<SettingsPanel visible={activePanel === "opts"} />
					<HelpPanel visible={activePanel === "help"} />
					<ProtectPanel visible={activePanel === "protect"} />
					<PrintPreviewPanel visible={activePanel === "printpreview"} />
					<SuggestPanel visible={activePanel === "suggest"} />
				</div>
			</div>

			{activePanel === "export" && (
				<ExportWizard
					visible
					groups={[{ heading: "Spreadsheet", formats: SPREADSHEET_FORMATS }]}
					onExport={handleExport}
					emailConfig={emailConfig}
					onClose={() => spreadsheetStore.setActiveFileMenuPanel(null)}
				/>
			)}
		</div>
	);
}
