/**
 * slide-text — text collection for the slide editor's left-menu Search panel.
 *
 * The presentation canvas keeps its text in three places (slide title, shape
 * text + table cells, speaker notes). Search needs one flat, ordered list of
 * editable targets so the panel can list hits and — for Replace — write the
 * new text back through the store's normal mutation path.
 */
import type { SlideData } from "../stores/PresentationStore";

export type SlideTextKind = "title" | "shape" | "table" | "notes";

export interface SlideTextHit {
	/** 0-based slide index. */
	slideIndex: number;
	slideId: string;
	/** Shape carrying the text (null for slide title / speaker notes). */
	shapeId: string | null;
	kind: SlideTextKind;
	text: string;
	/** Table cell coordinates when kind === "table". */
	row?: number;
	column?: number;
}

export interface SlideTextFindOptions {
	matchCase?: boolean;
	/** Speaker notes are searched by default. */
	includeNotes?: boolean;
}

export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Flatten every editable text target in deck order: slide title first, then
 * the slide's shapes (shape text, then table cells left-to-right), then the
 * speaker notes.
 */
export function collectSlideText(
	slides: SlideData[],
	options?: SlideTextFindOptions,
): SlideTextHit[] {
	const includeNotes = options?.includeNotes ?? true;
	const hits: SlideTextHit[] = [];

	slides.forEach((slide, slideIndex) => {
		if (slide.title) {
			hits.push({
				slideIndex,
				slideId: slide.id,
				shapeId: null,
				kind: "title",
				text: slide.title,
			});
		}

		for (const shape of slide.shapes ?? []) {
			if (shape.text) {
				hits.push({
					slideIndex,
					slideId: slide.id,
					shapeId: shape.id,
					kind: "shape",
					text: shape.text,
				});
			}
			const table = shape.table;
			if (table) {
				table.cells.forEach((row, rowIdx) => {
					row.cells.forEach((cell, columnIdx) => {
						if (cell.text) {
							hits.push({
								slideIndex,
								slideId: slide.id,
								shapeId: shape.id,
								kind: "table",
								text: cell.text,
								row: rowIdx,
								column: columnIdx,
							});
						}
					});
				});
			}
		}

		if (includeNotes && slide.notes) {
			hits.push({
				slideIndex,
				slideId: slide.id,
				shapeId: null,
				kind: "notes",
				text: slide.notes,
			});
		}
	});

	return hits;
}

function contains(text: string, query: string, matchCase: boolean): boolean {
	if (!query) return false;
	if (matchCase) return text.includes(query);
	return text.toLowerCase().includes(query.toLowerCase());
}

/** Every text target whose text contains the query (deck order preserved). */
export function findSlideMatches(
	slides: SlideData[],
	query: string,
	options?: SlideTextFindOptions,
): SlideTextHit[] {
	if (!query) return [];
	return collectSlideText(slides, options).filter((hit) =>
		contains(hit.text, query, options?.matchCase ?? false),
	);
}

/** Replace the first (or every) occurrence of the query inside one target. */
export function replaceInText(
	text: string,
	query: string,
	replacement: string,
	matchCase: boolean,
	all = false,
): string {
	if (!query) return text;
	const flags = `${matchCase ? "" : "i"}${all ? "g" : ""}`;
	return text.replace(new RegExp(escapeRegExp(query), flags), replacement);
}

/** Short preview around the first match so the result rows stay readable. */
export function snippet(text: string, query: string, matchCase: boolean): string {
	const idx = matchCase
		? text.indexOf(query)
		: text.toLowerCase().indexOf(query.toLowerCase());
	if (idx === -1) return text.slice(0, 60);
	const start = Math.max(0, idx - 16);
	const end = Math.min(text.length, idx + query.length + 24);
	return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Human label for a hit's origin ("Slide 3 · Table cell", …). */
export function describeSlideTextHit(hit: SlideTextHit): string {
	switch (hit.kind) {
		case "title":
			return "Slide title";
		case "shape":
			return "Shape text";
		case "table":
			return "Table cell";
		case "notes":
			return "Speaker notes";
	}
}
