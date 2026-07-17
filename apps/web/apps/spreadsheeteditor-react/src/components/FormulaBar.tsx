import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import {
	getActiveUniverAPI,
	onUniverChange,
} from "../lib/univer-command";

export const FormulaBar = observer(function FormulaBar() {
	const [cellRef, setCellRef] = useState("A1");
	const [formulaText, setFormulaText] = useState("");
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const unsub = onUniverChange(() => {
			if (isEditing) return;
			try {
				const api = getActiveUniverAPI();
				if (!api) return;
				const workbook = api.getActiveWorkbook();
				if (!workbook) return;
				const worksheet = workbook.getActiveSheet();
				if (!worksheet) return;
				const range = worksheet.getSelection().getActiveRange();
				if (!range) return;

				const ref = safeCall(() => range.getCellRef(), "");
				const formula = safeCall(() => range.getFormula(), null);
				const value = safeCall(() => range.getValue(), null);

				if (ref) setCellRef(ref);
				setFormulaText(formula ?? (value != null ? String(value) : ""));
			} catch {
				/* read errors are safe to ignore */
			}
		});
		return unsub;
	}, [isEditing]);

	function commitFormula() {
		const api = getActiveUniverAPI();
		if (!api) return;
		const workbook = api.getActiveWorkbook();
		if (!workbook) return;
		const worksheet = workbook.getActiveSheet();
		if (!worksheet) return;
		const range = worksheet.getSelection().getActiveRange();
		if (!range) return;

		const text = formulaText.trim();
		if (text.startsWith("=")) {
			console.warn("[FormulaBar] Formula commit not yet wired to Univer API");
		} else if (text) {
			try {
				range.setFontWeight("normal");
			} catch {
				/* intentionally empty */
			}
		}
		setIsEditing(false);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			commitFormula();
			const api = getActiveUniverAPI();
			if (api) {
				try {
					const workbook = api.getActiveWorkbook();
					if (workbook) {
						const worksheet = workbook.getActiveSheet();
						if (worksheet) {
							const range = worksheet.getSelection().getActiveRange();
							if (range) {
								const row = safeCall(() => range.getRow(), 0);
								const col = safeCall(() => range.getColumn(), 0);
								sheetNavigate(row + 1, col);
							}
						}
					}
				} catch {
					/* safely ignored */
				}
			}
		} else if (e.key === "Tab") {
			e.preventDefault();
			commitFormula();
			const api = getActiveUniverAPI();
			if (api) {
				try {
					const workbook = api.getActiveWorkbook();
					if (workbook) {
						const worksheet = workbook.getActiveSheet();
						if (worksheet) {
							const range = worksheet.getSelection().getActiveRange();
							if (range) {
								const row = safeCall(() => range.getRow(), 0);
								const col = safeCall(() => range.getColumn(), 0);
								sheetNavigate(row, col + 1);
							}
						}
					}
				} catch {
					/* safely ignored */
				}
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			setIsEditing(false);
		}
	}

	function sheetNavigate(_row: number, _col: number) {
		// TODO: Use Univer selection API to navigate to cell (row, col)
		// when the facade exposes selection.setActiveRange(row, col)
	}

	function handleFocus() {
		setIsEditing(true);
		if (inputRef.current) {
			inputRef.current.select();
		}
	}

	const formulaBarStyle: Record<string, string | number> = {
		display: "flex",
		alignItems: "center",
		height: "var(--wo-se-formulabar-height, 28px)",
		padding: "0 4px",
		backgroundColor: "var(--wo-color-bg-secondary, #f5f5f5)",
		borderBottom: "1px solid var(--wo-color-border, #d1d1d1)",
		fontSize: "12px",
		fontFamily: "var(--wo-font-mono, 'Menlo', 'Consolas', monospace)",
	};

	const cellRefStyle: Record<string, string | number> = {
		minWidth: "60px",
		padding: "0 8px",
		fontWeight: 600,
		color: "var(--wo-color-text-primary, #333)",
		borderRight: "1px solid var(--wo-color-border, #d1d1d1)",
		textAlign: "center",
		userSelect: "none",
	};

	const inputStyle: Record<string, string | number> = {
		flex: 1,
		border: "none",
		outline: "none",
		padding: "0 8px",
		backgroundColor: "transparent",
		fontSize: "12px",
		fontFamily: "inherit",
		color: "var(--wo-color-text-primary, #333)",
		caretColor: "var(--wo-color-accent, #1a73e8)",
	};

	return (
		<div style={formulaBarStyle}>
			<div style={cellRefStyle}>{cellRef}</div>
			<input
				ref={inputRef}
				style={inputStyle}
				type="text"
				value={isEditing ? formulaText : formulaText}
				onChange={(e) => {
					setFormulaText(e.target.value);
					if (!isEditing) setIsEditing(true);
				}}
				onFocus={handleFocus}
				onBlur={() => setIsEditing(false)}
				onKeyDown={handleKeyDown}
				placeholder="Enter value or formula"
				aria-label="Formula bar"
			/>
		</div>
	);
});

function safeCall<T>(fn: () => T, fallback: T): T {
	try {
		const result = fn();
		return result ?? fallback;
	} catch {
		return fallback;
	}
}
