import { observer } from "mobx-react-lite";

const ObservedInsertTab = observer(function ObservedInsertTab() {
	return (
		<section
			className="se-inserttab-panel"
			data-tab="insert"
			role="tabpanel"
			aria-labelledby="insert"
		>
			{/* Tables */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="PivotTable"
					>
						PivotTable
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Table"
					>
						Table
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Charts */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Column"
					>
						Column
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Line"
					>
						Line
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Pie"
					>
						Pie
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Bar"
					>
						Bar
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Area"
					>
						Area
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Scatter"
					>
						Scatter
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Images */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Picture"
					>
						Picture
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Online Pictures"
					>
						Online Pictures
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Shapes */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Shapes"
					>
						Shapes
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Links */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Link"
					>
						Link
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Text */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Header"
					>
						Header
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Footer"
					>
						Footer
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Sparklines */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Line"
					>
						Line
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Column"
					>
						Column
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Win/Loss"
					>
						Win/Loss
					</button>
				</div>
			</div>

			<div className="se-inserttab-separator" />

			{/* Icons */}
			<div className="se-inserttab-group">
				<div className="se-inserttab-elset">
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Icons"
					>
						Icons
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedInsertTab as InsertTab };
