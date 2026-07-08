import {
	AlignStartVertical,
	BringToFront,
	Columns,
	FileText,
	Grid3x3,
	Group,
	Heading,
	Ruler,
	SendToBack,
	Ungroup,
} from "lucide-react";
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
						title="Normal Margins"
					>
						<Ruler size={18} />
						<span>Normal</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Wide Margins"
					>
						<Ruler size={18} />
						<span>Wide</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Narrow Margins"
					>
						<Ruler size={18} />
						<span>Narrow</span>
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
						<Columns size={18} />
						<span>Portrait</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Landscape"
					>
						<Columns size={18} />
						<span>Landscape</span>
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
						<FileText size={18} />
						<span>Letter</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Legal"
					>
						<FileText size={18} />
						<span>Legal</span>
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
						<Grid3x3 size={18} />
						<span>Gridlines</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Headings"
					>
						<Heading size={18} />
						<span>Headings</span>
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
						<BringToFront size={18} />
						<span>Bring Forward</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Send Backward"
					>
						<SendToBack size={18} />
						<span>Send Backward</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Bring to Front"
					>
						<BringToFront size={18} />
						<span>Bring to Front</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Send to Back"
					>
						<SendToBack size={18} />
						<span>Send to Back</span>
					</button>
				</div>
				<div className="se-layouttab-elset">
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Align"
					>
						<AlignStartVertical size={18} />
						<span>Align</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Group"
					>
						<Group size={18} />
						<span>Group</span>
					</button>
					<button
						type="button"
						className="se-layouttab-btn"
						onClick={() => {}}
						title="Ungroup"
					>
						<Ungroup size={18} />
						<span>Ungroup</span>
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedLayoutTab as LayoutTab };
