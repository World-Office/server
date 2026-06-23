import { observer } from "mobx-react-lite";

const ObservedHomeTab = observer(function ObservedHomeTab() {
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
					<button type="button" className="se-hometab-btn" title="Cut">
						Cut
					</button>
					<button type="button" className="se-hometab-btn" title="Copy">
						Copy
					</button>
					<button type="button" className="se-hometab-btn" title="Paste">
						Paste
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						title="Format Painter"
					>
						Format Painter
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Font */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Bold">
						B
					</button>
					<button type="button" className="se-hometab-btn" title="Italic">
						I
					</button>
					<button type="button" className="se-hometab-btn" title="Underline">
						U
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						title="Strikethrough"
					>
						S
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						title="Increase Font Size"
					>
						A+
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						title="Decrease Font Size"
					>
						A-
					</button>
				</div>
				<div className="se-hometab-elset">
					<span className="se-hometab-label">Font Size</span>
				</div>
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Text Color">
						A
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						title="Text Highlight Color"
					>
						Ab
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Alignment */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Align Left">
						Align Left
					</button>
					<button type="button" className="se-hometab-btn" title="Align Center">
						Align Center
					</button>
					<button type="button" className="se-hometab-btn" title="Align Right">
						Align Right
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						title="Merge & Center"
					>
						Merge
					</button>
				</div>
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Wrap Text">
						Wrap Text
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Number */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Currency">
						$
					</button>
					<button type="button" className="se-hometab-btn" title="Percent">
						%
					</button>
					<button type="button" className="se-hometab-btn" title="Decimal">
						.00
					</button>
					<button type="button" className="se-hometab-btn" title="Comma">
						,
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Styles */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Cell Styles">
						Cell Styles
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						title="Conditional Formatting"
					>
						Conditional Formatting
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Cells */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Insert Cells">
						Insert
					</button>
					<button type="button" className="se-hometab-btn" title="Delete Cells">
						Delete
					</button>
				</div>
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Format">
						Format
					</button>
				</div>
			</div>

			<div className="se-hometab-separator" />

			{/* Editing */}
			<div className="se-hometab-group">
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Find">
						Find
					</button>
					<button type="button" className="se-hometab-btn" title="Replace">
						Replace
					</button>
				</div>
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Auto Sum">
						Σ
					</button>
				</div>
				<div className="se-hometab-elset">
					<button type="button" className="se-hometab-btn" title="Sort">
						Sort
					</button>
					<button type="button" className="se-hometab-btn" title="Filter">
						Filter
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedHomeTab as HomeTab };
