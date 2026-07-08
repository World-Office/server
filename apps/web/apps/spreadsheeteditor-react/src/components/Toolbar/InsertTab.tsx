import {
	AreaChart,
	BarChart3,
	BarChartHorizontal,
	Globe,
	Grid3x3,
	Heading,
	Image,
	LineChart,
	Link,
	PieChart,
	ScatterChart,
	Shapes,
	Smile,
	Table2,
	TrendingUp,
} from "lucide-react";
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
						<Table2 size={18} />
						<span>PivotTable</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Table"
					>
						<Grid3x3 size={18} />
						<span>Table</span>
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
						title="Column Chart"
					>
						<BarChart3 size={18} />
						<span>Column</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Line Chart"
					>
						<TrendingUp size={18} />
						<span>Line</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Pie Chart"
					>
						<PieChart size={18} />
						<span>Pie</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Bar Chart"
					>
						<BarChartHorizontal size={18} />
						<span>Bar</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Area Chart"
					>
						<AreaChart size={18} />
						<span>Area</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Scatter Chart"
					>
						<ScatterChart size={18} />
						<span>Scatter</span>
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
						<Image size={18} />
						<span>Picture</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Online Pictures"
					>
						<Globe size={18} />
						<span>Online</span>
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
						<Shapes size={18} />
						<span>Shapes</span>
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
						<Link size={18} />
						<span>Link</span>
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
						<Heading size={18} />
						<span>Header</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Footer"
					>
						<Heading size={18} />
						<span>Footer</span>
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
						title="Line Sparkline"
					>
						<LineChart size={18} />
						<span>Line</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Column Sparkline"
					>
						<BarChart3 size={18} />
						<span>Column</span>
					</button>
					<button
						type="button"
						className="se-inserttab-btn"
						onClick={() => {}}
						title="Win/Loss Sparkline"
					>
						<TrendingUp size={18} />
						<span>Win/Loss</span>
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
						<Smile size={18} />
						<span>Icons</span>
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedInsertTab as InsertTab };
