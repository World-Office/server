export function SettingsPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">Advanced Settings</div>
			<table className="se-file-menu-settings-table">
				<tbody>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">Macros</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="enabled">Enabled</option>
								<option value="disabled">Disabled</option>
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">Show Formula Bar</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="show">Show</option>
								<option value="hide">Hide</option>
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">Show Headings</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="show">Show</option>
								<option value="hide">Hide</option>
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">Show Gridlines</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="show">Show</option>
								<option value="hide">Hide</option>
							</select>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
