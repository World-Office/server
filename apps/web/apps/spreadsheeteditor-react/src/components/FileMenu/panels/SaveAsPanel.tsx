import { convertWoSpreadsheetToCsv } from "../../../lib/conversion";
import { getUniverSnapshot } from "../../../lib/univer-command";
import { spreadsheetStore } from "../../../stores/SpreadsheetStore";

const EXPORT_FORMATS = [
	{ id: "xlsx", label: "XLSX", description: "Excel Workbook" },
	{ id: "csv", label: "CSV", description: "Comma-Separated Values" },
];

export function SaveAsPanel({ visible }: { visible: boolean }) {
	async function handleExport(formatId: string): Promise<void> {
		if (formatId === "xlsx") {
			spreadsheetStore.exportAsDownload();
			spreadsheetStore.setFileMenuOpen(false);
			spreadsheetStore.setActiveFileMenuPanel(null);
			return;
		}

		if (formatId === "csv") {
			try {
				const snapshot = getUniverSnapshot();
				const json = snapshot ? JSON.stringify(snapshot) : "{}";
				const csv = convertWoSpreadsheetToCsv(json);
				const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				const baseName = spreadsheetStore.document?.title?.replace(
					/\.[^.]+$/,
					"",
				);
				a.download = baseName ? `${baseName}.csv` : "spreadsheet.csv";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			} catch (err) {
				console.error("CSV export failed:", err);
				alert("CSV export failed. Please try XLSX export instead.");
			}
			spreadsheetStore.setFileMenuOpen(false);
			spreadsheetStore.setActiveFileMenuPanel(null);
			return;
		}

		alert(`Export to ${formatId.toUpperCase()} is not yet supported`);
	}

	function handleClose(): void {
		spreadsheetStore.setActiveFileMenuPanel(null);
		spreadsheetStore.setFileMenuOpen(false);
	}

	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Download as</div>
			<div className="se-file-menu-body">
				<p className="de-file-menu-instruction">
					Select a format to export the spreadsheet.
				</p>
			</div>
			<div className="se-file-menu-formats">
				{EXPORT_FORMATS.map((format) => (
					<button
						key={format.id}
						type="button"
						className="se-file-menu-format-btn"
						onClick={() => handleExport(format.id)}
					>
						{format.label}
					</button>
				))}
				{[
					"ODS",
					"PDF",
					"XLTX",
					"OTS",
					"XLSB",
					"XLSM",
					"PDFA",
					"JPG",
					"PNG",
				].map((format) => (
					<button
						key={format}
						type="button"
						className="se-file-menu-format-btn"
						disabled
						style={{ opacity: 0.5 }}
						onClick={() => {}}
					>
						{format}
					</button>
				))}
			</div>
			<div className="se-file-menu-footer">
				<button type="button" onClick={handleClose}>
					Cancel
				</button>
			</div>
		</div>
	);
}
