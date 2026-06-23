export function SaveAsPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Download as</div>
			<div className="se-file-menu-formats">
				{[
					"XLSX",
					"ODS",
					"CSV",
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
						onClick={() => {}}
					>
						{format}
					</button>
				))}
			</div>
		</div>
	);
}
