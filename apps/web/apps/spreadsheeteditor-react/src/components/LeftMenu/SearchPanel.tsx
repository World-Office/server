/**
 * SearchPanel — left-menu "Search" toggle target.
 *
 * Find & replace over every sheet of the open workbook: matches are read
 * from the Univer snapshot (see lib/cell-access.ts), a result click jumps
 * to the cell (sheet switch + activate), Replace / Replace All write the
 * new value through the Univer facade so edits mark the document modified
 * and flow through the normal save path.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useState } from "react";
import {
	activateCell,
	collectTextCells,
	setCellValue,
	type SheetCell,
} from "../../lib/cell-access";

const MAX_RESULTS = 200;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(query: string, matchCase: boolean): RegExp | null {
	if (!query) return null;
	try {
		return new RegExp(escapeRegExp(query), matchCase ? "g" : "gi");
	} catch {
		return null;
	}
}

function snippet(value: string, query: string, matchCase: boolean): string {
	const idx = matchCase
		? value.indexOf(query)
		: value.toLowerCase().indexOf(query.toLowerCase());
	if (idx === -1) return value.slice(0, 60);
	const start = Math.max(0, idx - 16);
	const end = Math.min(value.length, idx + query.length + 24);
	return `${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
}

interface SearchPanelProps {
	active: boolean;
}

function SearchPanelInner({ active }: SearchPanelProps): JSX.Element {
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [results, setResults] = useState<SheetCell[]>([]);
	const [searched, setSearched] = useState(false);
	const [status, setStatus] = useState("");
	const [activeIndex, setActiveIndex] = useState(-1);

	function runSearch(): void {
		const pattern = buildPattern(query, matchCase);
		if (!pattern) {
			setResults([]);
			setSearched(true);
			setStatus(query ? "" : "Type something to search for.");
			return;
		}
		const cells = collectTextCells();
		const hits: SheetCell[] = [];
		for (const cell of cells) {
			pattern.lastIndex = 0;
			if (pattern.test(cell.value)) hits.push(cell);
			if (hits.length >= MAX_RESULTS) break;
		}
		setResults(hits);
		setSearched(true);
		setActiveIndex(hits.length > 0 ? 0 : -1);
		setStatus(
			hits.length === 0
				? "No matches."
				: hits.length >= MAX_RESULTS
					? `Showing the first ${MAX_RESULTS} matches.`
					: "",
		);
	}

	function jumpTo(index: number): void {
		const cell = results[index];
		if (!cell) return;
		setActiveIndex(index);
		activateCell(cell);
	}

	function replaceOne(index: number): void {
		const cell = results[index];
		if (!cell || !query) return;
		const next = matchCase
			? cell.value.replace(query, replacement)
			: cell.value.replace(
					new RegExp(escapeRegExp(query), "i"),
					replacement,
				);
		if (!setCellValue(cell, next)) {
			setStatus("No active sheet — cannot replace.");
			return;
		}
		runSearch();
	}

	function replaceAll(): void {
		if (!query || results.length === 0) return;
		const pattern = buildPattern(query, matchCase);
		if (!pattern) return;
		let count = 0;
		for (const cell of results) {
			pattern.lastIndex = 0;
			const next = cell.value.replace(pattern, replacement);
			if (next !== cell.value && setCellValue(cell, next)) count++;
		}
		setStatus(count > 0 ? `Replaced in ${count} cell(s).` : "Nothing replaced.");
		runSearch();
	}

	return (
		<div
			className="se-left-panel se-search-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="search"
		>
			<div className="se-left-panel-header">
				<span>Search</span>
				{results.length > 0 && (
					<span className="se-left-panel-count">{results.length}</span>
				)}
			</div>
			<div className="se-left-panel-body">
				<input
					className="se-left-panel-input"
					type="text"
					placeholder="Find in sheet"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") runSearch();
					}}
					data-action="search-query"
				/>
				<input
					className="se-left-panel-input"
					type="text"
					placeholder="Replace with"
					value={replacement}
					onChange={(e) => setReplacement(e.target.value)}
					data-action="search-replace"
				/>
				<label className="se-left-panel-check">
					<input
						type="checkbox"
						checked={matchCase}
						onChange={(e) => setMatchCase(e.target.checked)}
					/>
					Match case
				</label>
				<div className="se-left-panel-actions">
					<button
						type="button"
						className="se-left-panel-btn se-left-panel-btn-primary"
						onClick={runSearch}
						data-action="search-run"
					>
						Search
					</button>
					<button
						type="button"
						className="se-left-panel-btn"
						onClick={() => activeIndex >= 0 && replaceOne(activeIndex)}
						data-action="search-replace-one"
					>
						Replace
					</button>
					<button
						type="button"
						className="se-left-panel-btn"
						onClick={replaceAll}
						data-action="search-replace-all"
					>
						All
					</button>
				</div>
				{status && <div className="se-left-panel-muted">{status}</div>}
				{searched && results.length === 0 && !status && (
					<div className="se-left-panel-muted">No matches.</div>
				)}
				<ul className="se-left-panel-list">
					{results.map((cell, i) => (
						<li key={`${cell.sheetId}-${cell.ref}-${i}`}>
							<button
								type="button"
								className={`se-left-panel-row${i === activeIndex ? " selected" : ""}`}
								onClick={() => jumpTo(i)}
								title={`${cell.sheetName}!${cell.ref}`}
							>
								<span className="se-left-panel-badge">
									{cell.sheetName}!{cell.ref}
								</span>
								<span className="se-left-panel-row-text">
									{snippet(cell.value, query, matchCase)}
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

export const SearchPanel = observer(SearchPanelInner);
