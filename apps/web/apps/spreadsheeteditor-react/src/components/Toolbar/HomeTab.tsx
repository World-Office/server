import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowUpDown,
	Bold,
	Clipboard,
	Combine,
	Copy,
	DollarSign,
	Filter,
	Italic,
	PaintBucket,
	Paintbrush,
	Palette,
	Percent,
	Replace,
	Scissors,
	Search,
	Sigma,
	SquarePlus,
	Strikethrough,
	Table,
	Trash2,
	Type,
	Underline,
	WrapText,
} from "lucide-react";
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
						<Scissors size={18} />
						<span>Cut</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("copy")}
						title="Copy"
					>
						<Copy size={18} />
						<span>Copy</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("paste")}
						title="Paste"
					>
						<Clipboard size={18} />
						<span>Paste</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Format Painter"
					>
						<Paintbrush size={18} />
						<span>Format Painter</span>
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
						title="Bold"
					>
						<Bold size={18} />
						<span>Bold</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Italic"
					>
						<Italic size={18} />
						<span>Italic</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Underline"
					>
						<Underline size={18} />
						<span>Underline</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Strikethrough"
					>
						<Strikethrough size={18} />
						<span>Strikethrough</span>
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Increase Font Size"
					>
						<Type size={18} />
						<span>Increase</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Decrease Font Size"
					>
						<Type size={18} />
						<span>Decrease</span>
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Text Color"
					>
						<Palette size={18} />
						<span>Text Color</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Fill Color"
					>
						<PaintBucket size={18} />
						<span>Fill Color</span>
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
						title="Align Left"
					>
						<AlignLeft size={18} />
						<span>Align Left</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Align Center"
					>
						<AlignCenter size={18} />
						<span>Align Center</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Align Right"
					>
						<AlignRight size={18} />
						<span>Align Right</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Merge & Center"
					>
						<Combine size={18} />
						<span>Merge</span>
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Wrap Text"
					>
						<WrapText size={18} />
						<span>Wrap Text</span>
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
						title="Currency Format"
					>
						<DollarSign size={18} />
						<span>Currency</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Percent Format"
					>
						<Percent size={18} />
						<span>Percent</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Decimal Format"
					>
						<Sigma size={18} />
						<span>Decimal</span>
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
						title="Cell Styles"
					>
						<Table size={18} />
						<span>Cell Styles</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Conditional Formatting"
					>
						<PaintBucket size={18} />
						<span>Conditional</span>
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
						title="Insert Cells"
					>
						<SquarePlus size={18} />
						<span>Insert</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Delete Cells"
					>
						<Trash2 size={18} />
						<span>Delete</span>
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Format"
					>
						<Paintbrush size={18} />
						<span>Format</span>
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
						<Search size={18} />
						<span>Find</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						onClick={() => onMonacoCommand("replace")}
						title="Replace"
					>
						<Replace size={18} />
						<span>Replace</span>
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Auto Sum"
					>
						<Sigma size={18} />
						<span>Sum</span>
					</button>
				</div>
				<div className="se-hometab-elset">
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Sort"
					>
						<ArrowUpDown size={18} />
						<span>Sort</span>
					</button>
					<button
						type="button"
						className="se-hometab-btn"
						disabled
						title="Filter"
					>
						<Filter size={18} />
						<span>Filter</span>
					</button>
				</div>
			</div>
		</section>
	);
});

export { ObservedHomeTab as HomeTab };
