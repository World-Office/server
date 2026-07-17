import { visioStore } from "../../../../stores/VisioStore";

const FLOWCHART_FORMATS = [
	{ id: "wo-flowchart", label: "WO Flowchart", description: "World-Office Diagram (JSON)" },
];

const VSDX_FORMATS = [
	{ id: "vsdx", label: "VSDX", description: "Visio Drawing" },
];

export function SaveAsPanel({ visible }: { visible: boolean }) {
	function handleClose(): void {
		visioStore.setFileMenuOpen(false);
		visioStore.setActiveFileMenuPanel(null);
	}

	function handleExport(format: string): void {
		if (format === "wo-flowchart" || format === "vsdx") {
			visioStore.exportAsDownload();
			handleClose();
			return;
		}

		alert(`Export to ${format} is not yet supported`);
	}

	return (
		<div
			className="visio-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="visio-file-menu-header">Download as</div>
			<div className="visio-file-menu-body">
				<p className="de-file-menu-instruction">
					Select a format to export the diagram.
				</p>
			</div>
			<div className="visio-file-menu-saveas-formats">
				{FLOWCHART_FORMATS.map((format) => (
					<button
						key={format.id}
						type="button"
						className="visio-file-menu-format-btn"
						onClick={() => handleExport(format.id)}
					>
						<div className="visio-file-menu-format-icon">
							<span>{format.label}</span>
						</div>
					</button>
				))}
				{VSDX_FORMATS.map((format) => (
					<button
						key={format.id}
						type="button"
						className="visio-file-menu-format-btn"
						disabled
						style={{ opacity: 0.5 }}
					>
						<div className="visio-file-menu-format-icon">
							<span>{format.label}</span>
						</div>
					</button>
				))}
				{["PDF", "PDF/A", "PNG", "JPG"].map((format) => (
					<button
						key={format}
						type="button"
						className="visio-file-menu-format-btn"
						disabled
						style={{ opacity: 0.5 }}
					>
						<div className="visio-file-menu-format-icon">
							<span>{format}</span>
						</div>
					</button>
				))}
			</div>
			<div className="visio-file-menu-footer">
				<button type="button" onClick={handleClose}>
					Cancel
				</button>
			</div>
		</div>
	);
}
