import { observer } from "mobx-react-lite";

const ObservedFormulaTab = observer(function ObservedFormulaTab() {
	return (
		<section
			className="se-formulatab-panel"
			data-tab="formula"
			role="tabpanel"
			aria-labelledby="formula"
		>
			{/* Function Library */}
			<div className="se-formulatab-group">
				<div className="se-formulatab-elset">
					<span className="se-formulatab-label">Function Library</span>
				</div>
				<div className="se-formulatab-elset">
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Sum"
					>
						Sum
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Average"
					>
						Average
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Count"
					>
						Count
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Min"
					>
						Min
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Max"
					>
						Max
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="If"
					>
						If
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="VLookup"
					>
						VLOOKUP
					</button>
				</div>
			</div>

			<div className="se-formulatab-separator" />

			{/* Defined Names */}
			<div className="se-formulatab-group">
				<div className="se-formulatab-elset">
					<span className="se-formulatab-label">Defined Names</span>
				</div>
				<div className="se-formulatab-elset">
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Name Manager"
					>
						Name Manager
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Create from Selection"
					>
						Create from Selection
					</button>
				</div>
			</div>

			<div className="se-formulatab-separator" />

			{/* Formula Auditing */}
			<div className="se-formulatab-group">
				<div className="se-formulatab-elset">
					<span className="se-formulatab-label">Formula Auditing</span>
				</div>
				<div className="se-formulatab-elset">
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Trace Precedents"
					>
						Trace Precedents
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Trace Dependents"
					>
						Trace Dependents
					</button>
				</div>
			</div>

			<div className="se-formulatab-separator" />

			{/* Calculation */}
			<div className="se-formulatab-group">
				<div className="se-formulatab-elset">
					<span className="se-formulatab-label">Calculation</span>
				</div>
				<div className="se-formulatab-elset">
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Automatic"
					>
						Automatic
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Manual"
					>
						Manual
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedFormulaTab as FormulaTab };
