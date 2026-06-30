import { observer } from "mobx-react-lite";
import type { MonacoCommand } from "./MonacoCommand";

interface HomeTabProps {
	onMonacoCommand: (command: MonacoCommand) => void;
}

const ObservedHomeTab = observer(function ObservedHomeTab({
	onMonacoCommand,
}: HomeTabProps) {
	return (
		<section
			className="se-hometab-panel"
			data-tab="home"
			role="tabpanel"
			aria-labelledby="home"
		>
			{/* Clipboard */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("cut")}
						title="Cut"
					>
						Cut
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("copy")}
						title="Copy"
					>
						Copy
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("paste")}
						title="Paste"
					>
						Paste
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Format Painter (not available in code editor)"
					>
						Format Painter
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Font */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Bold (not available in code editor)"
					>
						B
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Italic (not available in code editor)"
					>
						I
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Underline (not available in code editor)"
					>
						U
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Strikethrough (not available in code editor)"
					>
						S
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Increase Font Size (not available in code editor)"
					>
						A+
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Decrease Font Size (not available in code editor)"
					>
						A-
					</button>
				</div>
				<div className="se-hometab-elset">
					<span className="se-hometab-label">Font Size</span>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Text Color (not available in code editor)"
					>
						A
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Text Highlight Color (not available in code editor)"
					>
						Ab
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Alignment */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Align Left (not available in code editor)"
					>
						Align Left
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Align Center (not available in code editor)"
					>
						Align Center
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Align Right (not available in code editor)"
					>
						Align Right
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Merge & Center (not available in code editor)"
					>
						Merge
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Wrap Text (not available in code editor)"
					>
						Wrap Text
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Number */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Currency (not available in code editor)"
					>
						$
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Percent (not available in code editor)"
					>
						%
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Decimal (not available in code editor)"
					>
						.00
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Comma (not available in code editor)"
					>
						,
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Styles */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Cell Styles (not available in code editor)"
					>
						Cell Styles
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Conditional Formatting (not available in code editor)"
					>
						Conditional Formatting
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Cells */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Insert Cells (not available in code editor)"
					>
						Insert
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Delete Cells (not available in code editor)"
					>
						Delete
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Format (not available in code editor)"
					>
						Format
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Editing */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("find")}
						title="Find"
					>
						Find
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("replace")}
						title="Replace"
					>
						Replace
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Auto Sum (not available in code editor)"
					>
						Σ
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Sort (not available in code editor)"
					>
						Sort
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Filter (not available in code editor)"
					>
						Filter
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedHomeTab as HomeTab };
