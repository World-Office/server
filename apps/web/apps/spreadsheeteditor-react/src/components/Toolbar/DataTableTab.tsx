import { observer } from "mobx-react-lite";

const ObservedDataTableTab = observer(function ObservedDataTableTab() {
	return (
		<section
			className="se-datatab-panel"
			data-tab="table"
			role="tabpanel"
			aria-labelledby="table"
		>
			{/* Table Design Options */}
			<div className="se-datatab-group">
				<div className="se-datatab-elset">
					<span className="se-datatab-label">Table Style Options</span>
				</div>
				<div className="se-datatab-elset">
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Header Row"
					>
						Header Row
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Total Row"
					>
						Total Row
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="First Column"
					>
						First Column
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Last Column"
					>
						Last Column
					</button>
				</div>
			</div>

			<div className="se-datatab-separator" />

			{/* Table Style */}
			<div className="se-datatab-group">
				<div className="se-datatab-elset">
					<span className="se-datatab-label">Table Styles</span>
				</div>
				<div className="se-datatab-elset">
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Light"
					>
						Light
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Medium"
					>
						Medium
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Dark"
					>
						Dark
					</button>
				</div>
			</div>

			<div className="se-datatab-separator" />

			{/* Banded Rows */}
			<div className="se-datatab-group">
				<div className="se-datatab-elset">
					<span className="se-datatab-label">Banded Rows</span>
				</div>
				<div className="se-datatab-elset">
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Banded Rows"
					>
						Banded Rows
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Banded Columns"
					>
						Banded Columns
					</button>
				</div>
			</div>

			<div className="se-datatab-separator" />

			{/* Banded Columns */}
			<div className="se-datatab-group">
				<div className="se-datatab-elset">
					<span className="se-datatab-label">First/Last Columns</span>
				</div>
				<div className="se-datatab-elset">
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="First Column"
					>
						First Column
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Last Column"
					>
						Last Column
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedDataTableTab as DataTableTab };
