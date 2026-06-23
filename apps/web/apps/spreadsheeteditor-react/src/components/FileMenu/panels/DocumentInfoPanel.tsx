import { spreadsheetStore } from "../../../stores/SpreadsheetStore";

export function DocumentInfoPanel({ visible }: { visible: boolean }) {
	const doc = spreadsheetStore.document;

	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Document Info</div>
			<table className="se-file-menu-info-table">
				<tbody>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Title:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{doc?.title ?? "Untitled"}
							</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Author:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{doc?.info?.author ?? "—"}
							</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Created:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{doc?.info?.created ?? "—"}
							</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Modified:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{doc?.info?.modified ?? "—"}
							</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Type:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">{doc?.fileType ?? "—"}</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Size:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{doc?.info?.sheetCount ?? "—"}
							</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Sheets:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{doc?.info?.sheetCount ?? "—"}
							</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Format:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">{doc?.fileType ?? "—"}</span>
						</td>
					</tr>
					<tr className="se-file-menu-info-row">
						<td className="se-file-menu-info-left">
							<span className="se-file-menu-label">Language:</span>
						</td>
						<td className="se-file-menu-info-right">
							<span className="se-file-menu-value">
								{spreadsheetStore.languageCode ?? "en-US"}
							</span>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
