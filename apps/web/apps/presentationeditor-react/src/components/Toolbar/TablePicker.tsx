import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";

const ObservedTablePicker = observer(function ObservedTablePicker() {
	const [open, setOpen] = useState(false);
	const [hoverCols, setHoverCols] = useState(3);
	const [hoverRows, setHoverRows] = useState(3);
	const maxRows = 8;
	const maxCols = 8;
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	const insertTable = (rows: number, cols: number) => {
		const slideIndex = presentationStore.currentSlide;
		const slide = presentationStore.slides[slideIndex];
		if (!slide) return;
		const existing = slide.shapes?.length || 0;

		const cells = [];
		for (let ri = 0; ri < rows; ri++) {
			const row = [];
			for (let ci = 0; ci < cols; ci++) {
				row.push({ text: ri === 0 ? `Header ${ci + 1}` : `Cell ${ci + 1}` });
			}
			cells.push({ cells: row });
		}

		presentationStore.addShape(slideIndex, {
			id: `table-${Date.now()}`,
			type: "rect",
			x: 80 + existing * 30,
			y: 60 + existing * 20,
			width: 400,
			height: 200,
			zIndex: existing,
			fillColor: "#f8f9fa",
			strokeColor: "#ccc",
			strokeWidth: 1,
			rotation: 0,
			table: {
				rows,
				columns: cols,
				headerRow: true,
				cells,
			},
		});
		setOpen(false);
	};

	return (
		<div ref={ref} style={{ position: "relative", display: "inline-block" }}>
			<button
				type="button"
				className="prese-inserttab-btn"
				title="Table"
				onClick={() => setOpen(!open)}
			>
				Table
			</button>
			{open && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						left: 0,
						zIndex: 1000,
						background: "white",
						border: "1px solid #e0e0e0",
						borderRadius: "4px",
						boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
						padding: "8px",
					}}
				>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: `repeat(${maxCols}, 16px)`,
							gap: "2px",
							marginBottom: "4px",
						}}
					>
						{Array.from({ length: maxRows * maxCols }, (_, i) => {
							const col = i % maxCols;
							const row = Math.floor(i / maxCols);
							const active = col < hoverCols && row < hoverRows;
							return (
								<div
									key={i}
									style={{
										width: "16px",
										height: "16px",
										border: active ? "1px solid #4472C4" : "1px solid #ccc",
										background: active ? "#e8f0fe" : "white",
										cursor: "pointer",
									}}
									onMouseEnter={() => {
										setHoverCols(col + 1);
										setHoverRows(row + 1);
									}}
									onClick={() => insertTable(row + 1, col + 1)}
								/>
							);
						})}
					</div>
					<div style={{ fontSize: "11px", color: "#666", textAlign: "center" }}>
						{hoverRows} × {hoverCols}
					</div>
				</div>
			)}
		</div>
	);
});

export { ObservedTablePicker as TablePicker };
