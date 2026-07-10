export function SettingsPanel({ visible }: { visible: boolean }) {
	return (
		<div
			className="visio-file-menu-content-box"
			style={{
				display: visible ? "block" : "none",
				padding: 0,
				flexDirection: "column",
			}}
		>
			<div className="visio-file-menu-header">Advanced Settings</div>
			<table className="visio-file-menu-settings-table">
				<tbody>
					<tr className="visio-file-menu-settings-group">
						<td className="visio-file-menu-settings-label" colSpan={2}>
							Theme
						</td>
					</tr>
					<tr>
						<td className="visio-file-menu-settings-left">
							<span>Interface theme</span>
						</td>
						<td className="visio-file-menu-settings-right">
							<select className="visio-file-menu-select" defaultValue="default">
								<option value="default">Default</option>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
								<option value="dark-contrast">Dark Contrast</option>
							</select>
						</td>
					</tr>
					<tr className="visio-file-menu-settings-divider" />
					<tr className="visio-file-menu-settings-group">
						<td className="visio-file-menu-settings-label" colSpan={2}>
							Font Rendering
						</td>
					</tr>
					<tr>
						<td className="visio-file-menu-settings-left">
							<span>Spell Checking</span>
						</td>
						<td className="visio-file-menu-settings-right">
							<input type="checkbox" defaultChecked />
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
