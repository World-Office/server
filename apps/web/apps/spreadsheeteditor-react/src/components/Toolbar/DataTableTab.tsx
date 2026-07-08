import { Grid3x3, Moon, Sun, Table, ToggleLeft } from "lucide-react";
import { observer } from "mobx-react-lite";

const ObservedDataTableTab = observer(function ObservedDataTableTab() {
	return (
		<section
			className="se-datatab-panel"
			data-tab="table"
			role="tabpanel"
			aria-labelledby="table"
		>
			{/* Table Style Options */}
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
						<ToggleLeft size={18} />
						<span>Header Row</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Total Row"
					>
						<ToggleLeft size={18} />
						<span>Total Row</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="First Column"
					>
						<ToggleLeft size={18} />
						<span>First Column</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Last Column"
					>
						<ToggleLeft size={18} />
						<span>Last Column</span>
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
						title="Light Style"
					>
						<Sun size={18} />
						<span>Light</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Medium Style"
					>
						<Sun size={18} />
						<span>Medium</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Dark Style"
					>
						<Moon size={18} />
						<span>Dark</span>
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
						<Grid3x3 size={18} />
						<span>Banded Rows</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Banded Columns"
					>
						<Grid3x3 size={18} />
						<span>Banded Columns</span>
					</button>
				</div>
			</div>

			<div className="se-datatab-separator" />

			{/* First/Last Columns */}
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
						<Table size={18} />
						<span>First Column</span>
					</button>
					<button
						type="button"
						className="se-datatab-btn"
						onClick={() => {}}
						title="Last Column"
					>
						<Table size={18} />
						<span>Last Column</span>
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedDataTableTab as DataTableTab };
