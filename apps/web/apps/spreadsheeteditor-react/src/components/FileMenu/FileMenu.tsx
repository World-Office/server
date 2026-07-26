import { type ExportFormat, ExportWizard } from "@world-office/editor-common";
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
		},
		{
			id: "ods",
			label: "ODS",
			description: "OpenDocument Spreadsheet",
			extension: ".ods",
		},
		{
			id: "pdf",
			label: "PDF",
			description: "Portable Document Format",
			extension: ".pdf",
		},
		{
			id: "csv",
			label: "CSV",
			description: "Comma-Separated Values",
			extension: ".csv",
		},
	];

	const SPREADSHEET_MIME: Record<string, string> = {
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		ods: "application/vnd.oasis.opendocument.spreadsheet",
		pdf: "application/pdf",
		csv: "text/csv",
	};

	const handleExport = useCallback(
		async (format: ExportFormat): Promise<boolean> => {
			try {
				// For XLSX, use the existing export flow via the store
				if (format.id === "xlsx") {
					await spreadsheetStore.exportAsDownload();
					return true;
				}

				const snapshot = getUniverSnapshot();
				if (!snapshot) return false;
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
						target_format: format.id,
						data: btoa(json),
					}),
				});
				if (!res.ok) return false;
				const result = await res.json();
				if (!result.data) return false;
				const bin = atob(result.data);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				const blob = new Blob([bytes], {
					type: SPREADSHEET_MIME[format.id] ?? "application/octet-stream",
				});
				const fileName = `spreadsheet${format.extension}`;
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = fileName;
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
					onClose={() => spreadsheetStore.setActiveFileMenuPanel(null)}
				/>
			)}
		</div>
	);
}
