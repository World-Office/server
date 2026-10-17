/**
 * SearchPanel — left-menu "Search" toggle target (slide editor).
 *
 * Find & replace over the whole deck: slide titles, shape text, table cells
 * and speaker notes (see lib/slide-text.ts). Clicking a result jumps to the
 * slide and selects the shape that carries the text; Replace / Replace All
 * write through PresentationStore.applySlideText so the edit lands on the
 * normal undo/collaboration/save path instead of a parallel one.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useState } from "react";
import {
	describeSlideTextHit,
	findSlideMatches,
	replaceInText,
	snippet,
	type SlideTextHit,
} from "../../lib/slide-text";
import { presentationStore } from "../../stores/PresentationStore";

function SearchPanelInner({ active }: { active: boolean }): JSX.Element {
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [includeNotes, setIncludeNotes] = useState(true);
	const [results, setResults] = useState<SlideTextHit[]>([]);
	const [searched, setSearched] = useState(false);
	const [status, setStatus] = useState("");
	const [activeIndex, setActiveIndex] = useState(-1);

	function options() {
		return { matchCase, includeNotes };
	}

	function runSearch(): void {
		if (!query) {
			setResults([]);
			setSearched(true);
			setStatus("Type something to search for.");
			return;
		}
		const hits = findSlideMatches(presentationStore.slides, query, options());
		setResults(hits);
		setSearched(true);
		setActiveIndex(hits.length > 0 ? 0 : -1);
		setStatus(hits.length === 0 ? "No matches." : "");
	}

	function jumpTo(index: number): void {
		const hit = results[index];
		if (!hit) return;
		setActiveIndex(index);
		presentationStore.setCurrentSlide(hit.slideIndex);
		if (hit.shapeId) {
			presentationStore.selectShape(hit.shapeId);
		} else {
			presentationStore.deselectShape();
		}
	}

	function replaceOne(index: number): void {
		const hit = results[index];
		if (!hit || !query) return;
		const next = replaceInText(hit.text, query, replacement, matchCase, false);
		if (next === hit.text) {
			setStatus("Nothing to replace here.");
			return;
		}
		if (!presentationStore.applySlideText(hit, next)) {
			setStatus("That slide no longer exists.");
			return;
		}
		runSearch();
	}

	function replaceAll(): void {
		if (!query || results.length === 0) return;
		let count = 0;
		// Snapshot the hits: each write re-reads the deck, so walk a copy.
		for (const hit of [...results]) {
			const next = replaceInText(hit.text, query, replacement, matchCase, true);
			if (next !== hit.text && presentationStore.applySlideText(hit, next)) {
				count++;
			}
		}
		setStatus(count > 0 ? `Replaced in ${count} place(s).` : "Nothing replaced.");
		runSearch();
	}

	return (
		<div
			className="prese-left-panel prese-search-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="search"
		>
			<div className="prese-left-panel-header">
				<span>Search</span>
				{results.length > 0 && (
					<span className="prese-left-panel-count">{results.length}</span>
				)}
			</div>
			<div className="prese-left-panel-body">
				<input
					className="prese-left-panel-input"
					type="text"
					placeholder="Find in presentation"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") runSearch();
					}}
					data-action="search-query"
				/>
				<input
					className="prese-left-panel-input"
					type="text"
					placeholder="Replace with"
					value={replacement}
					onChange={(e) => setReplacement(e.target.value)}
					data-action="search-replace"
				/>
				<label className="prese-left-panel-check">
					<input
						type="checkbox"
						checked={matchCase}
						onChange={(e) => setMatchCase(e.target.checked)}
					/>
					Match case
				</label>
				<label className="prese-left-panel-check">
					<input
						type="checkbox"
						checked={includeNotes}
						onChange={(e) => setIncludeNotes(e.target.checked)}
					/>
					Search speaker notes
				</label>
				<div className="prese-left-panel-actions">
					<button
						type="button"
						className="prese-left-panel-btn prese-left-panel-btn-primary"
						onClick={runSearch}
						data-action="search-run"
					>
						Search
					</button>
					<button
						type="button"
						className="prese-left-panel-btn"
						onClick={() => activeIndex >= 0 && replaceOne(activeIndex)}
						data-action="search-replace-one"
					>
						Replace
					</button>
					<button
						type="button"
						className="prese-left-panel-btn"
						onClick={replaceAll}
						data-action="search-replace-all"
					>
						All
					</button>
				</div>
				{status && <div className="prese-left-panel-muted">{status}</div>}
				{searched && results.length === 0 && !status && (
					<div className="prese-left-panel-muted">No matches.</div>
				)}
				<ul className="prese-left-panel-list">
					{results.map((hit, i) => (
						<li key={`${hit.slideIndex}-${hit.shapeId}-${hit.kind}-${i}`}>
							<button
								type="button"
								className={`prese-left-panel-row${i === activeIndex ? " selected" : ""}`}
								onClick={() => jumpTo(i)}
								title={`Slide ${hit.slideIndex + 1} — ${describeSlideTextHit(hit)}`}
							>
								<span className="prese-left-panel-badge">
									Slide {hit.slideIndex + 1} · {describeSlideTextHit(hit)}
								</span>
								<span className="prese-left-panel-row-text">
									{snippet(hit.text, query, matchCase)}
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
