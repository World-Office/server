import {
	ArrowDownCircle,
	ArrowUpCircle,
	Equal,
	Hash,
	Minus,
	Play,
	Plus,
	Search,
	Sigma,
	Square,
} from "lucide-react";
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
						title="Auto Sum"
					>
						<Sigma size={18} />
						<span>Sum</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Average"
					>
						<Equal size={18} />
						<span>Average</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Count"
					>
						<Hash size={18} />
						<span>Count</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Min"
					>
						<Minus size={18} />
						<span>Min</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Max"
					>
						<Plus size={18} />
						<span>Max</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="IF Function"
					>
						<Equal size={18} />
						<span>If</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="VLOOKUP"
					>
						<Search size={18} />
						<span>VLOOKUP</span>
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
						<Sigma size={18} />
						<span>Name Manager</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Create from Selection"
					>
						<Plus size={18} />
						<span>Create from Selection</span>
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
						<ArrowUpCircle size={18} />
						<span>Trace Precedents</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Trace Dependents"
					>
						<ArrowDownCircle size={18} />
						<span>Trace Dependents</span>
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
						title="Automatic Calculation"
					>
						<Play size={18} />
						<span>Automatic</span>
					</button>
					<button
						type="button"
						className="se-formulatab-btn"
						onClick={() => {}}
						title="Manual Calculation"
					>
						<Square size={18} />
						<span>Manual</span>
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedFormulaTab as FormulaTab };
