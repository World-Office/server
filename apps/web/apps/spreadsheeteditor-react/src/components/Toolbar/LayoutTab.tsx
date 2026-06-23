import { observer } from "mobx-react-lite";

const ObservedLayoutTab = observer(function ObservedLayoutTab() {
	return (
		<section
			className="se-layouttab-panel"
			data-tab="layout"
			role="tabpanel"
			aria-labelledby="layout"
		>
			{/* Page Setup */}
			<div className="se-layouttab-group">
				<div className="se-layouttab-elset">
					<span className="se-layouttab-label">Margins</span>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Normal"
					>
						Normal
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Wide"
					>
						Wide
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Narrow"
					>
						Narrow
					</button>
				</div>
				<div className="se-layouttab-elset">
					<span className="se-layouttab-label">Orientation</span>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Portrait"
					>
						Portrait
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Landscape"
					>
						Landscape
					</button>
				</div>
				<div className="se-layouttab-elset">
					<span className="se-layouttab-label">Size</span>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Letter"
					>
						Letter
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Legal"
					>
						Legal
					</button>
				</div>
			</div>

			<div className="se-layouttab-separator" />

			{/* Sheet Options */}
			<div className="se-layouttab-group">
				<div className="se-layouttab-elset">
					<span className="se-layouttab-label">Sheet Options</span>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Gridlines"
					>
						Gridlines
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Headings"
					>
						Headings
					</button>
				</div>
			</div>

			<div className="se-layouttab-separator" />

			{/* Arrange */}
			<div className="se-layouttab-group">
				<div className="se-layouttab-elset">
					<span className="se-layouttab-label">Arrange</span>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Bring Forward"
					>
						Bring Forward
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Send Backward"
					>
						Send Backward
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Bring to Front"
					>
						Bring to Front
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Send to Back"
					>
						Send to Back
					</button>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Align"
					>
						Align
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Group"
					>
						Group
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Ungroup"
					>
						Ungroup
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedLayoutTab as LayoutTab };
