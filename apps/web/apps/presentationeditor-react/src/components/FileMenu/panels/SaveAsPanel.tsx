import type { JSX } from "react";
import { exportToFormat } from "../../../lib/export-service";
import { presentationStore } from "../../../stores/PresentationStore";

const ACTIVE_FORMATS = [
	{ id: "pptx", label: "PPTX", description: "PowerPoint Presentation" },
	{ id: "odp", label: "ODP", description: "OpenDocument Presentation" },
];

const COMING_SOON_FORMATS = [
	"PPSX",
	"PDF",
	"POTX",
	"PPTM",
	"PDFA",
	"PDF/A",
	"OTP",
	"JPG",
	"PNG",
];

function downloadJSON(): void {
	const json = presentationStore.toJSON();
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "presentation.json";
	a.click();
	URL.revokeObjectURL(url);
}

export function SaveAsPanel({ visible }: { visible: boolean }): JSX.Element {
	return (
		<div
			className="prese-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="prese-file-menu-header">Download as</div>
			<div className="prese-file-menu-body">
				<p className="de-file-menu-instruction">
					Select a format to export the presentation.
				</p>
			</div>
			<div className="prese-file-menu-formats">
				{ACTIVE_FORMATS.map((format) => (
					<button
						key={format.id}
						type="button"
						className="prese-file-menu-format-btn"
						onClick={() => exportToFormat(format.id)}
					>
						{format.label}
					</button>
				))}
				{COMING_SOON_FORMATS.map((format) => (
					<button
						key={format}
						type="button"
						className="prese-file-menu-format-btn"
						disabled
						style={{ opacity: 0.5 }}
					>
						{format}
					</button>
				))}
			</div>

			<div className="prese-file-menu-header" style={{ marginTop: "16px" }}>
				Save as JSON
			</div>
			<div className="prese-file-menu-formats">
				<button
					type="button"
					className="prese-file-menu-format-btn"
					onClick={downloadJSON}
				>
					JSON
				</button>
			</div>
		</div>
	);
}
