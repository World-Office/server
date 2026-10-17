import { describe, expect, it } from "vitest";
import {
	collectSlideText,
	describeSlideTextHit,
	findSlideMatches,
	replaceInText,
	snippet,
	type SlideTextHit,
} from "../lib/slide-text";
import { PresentationStore, type SlideData } from "../stores/PresentationStore";

function slide(overrides: Partial<SlideData>): SlideData {
	return {
		id: `s-${Math.random().toString(36).slice(2, 8)}`,
		title: "Untitled",
		layout: "blank",
		notes: "",
		shapes: [],
		...overrides,
	};
}

const DECK: SlideData[] = [
	slide({
		title: "Quarterly Review",
		notes: "talk about revenue",
		shapes: [
			{
				id: "sh1",
				type: "textbox",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				rotation: 0,
				zIndex: 0,
				text: "Revenue is up",
			},
			{
				id: "sh2",
				type: "table",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				rotation: 0,
				zIndex: 1,
				table: {
					rows: 1,
					columns: 2,
					headerRow: false,
					cells: [{ cells: [{ text: "Revenue" }, { text: "" }] }],
				},
			},
		],
	}),
	slide({ title: "Next steps", notes: "revenue follow-up" }),
];

describe("slide-text", () => {
	it("collects title, shape, table cell and note targets in deck order", () => {
		const hits = collectSlideText(DECK);
		expect(hits.map((h) => h.kind)).toEqual([
			"title",
			"shape",
			"table",
			"notes",
			"title",
			"notes",
		]);
		expect(hits[0]).toMatchObject({ slideIndex: 0, kind: "title", text: "Quarterly Review" });
		expect(hits[2]).toMatchObject({
			kind: "table",
			shapeId: "sh2",
			row: 0,
			column: 0,
		});
		// empty table cells are skipped
		expect(hits.filter((h) => h.text === "")).toEqual([]);
	});

	it("can leave the speaker notes out of the index", () => {
		const hits = collectSlideText(DECK, { includeNotes: false });
		expect(hits.some((h) => h.kind === "notes")).toBe(false);
	});

	it("finds matches across the deck and honours match case", () => {
		const hits = findSlideMatches(DECK, "revenue");
		expect(hits).toHaveLength(4);
		expect(hits.map((h) => h.kind)).toEqual(["shape", "table", "notes", "notes"]);

		const cased = findSlideMatches(DECK, "Revenue", { matchCase: true });
		expect(cased).toHaveLength(2);
		expect(findSlideMatches(DECK, "")).toEqual([]);
	});

	it("replaces the first or every occurrence and previews a snippet", () => {
		expect(replaceInText("Revenue, revenue", "revenue", "sales", true, false)).toBe(
			"Revenue, sales",
		);
		expect(replaceInText("Revenue, revenue", "revenue", "sales", false, true)).toBe(
			"sales, sales",
		);
		// regex metacharacters are treated literally
		expect(replaceInText("1.5x", ".", ",", false, true)).toBe("1,5x");
		// no match → the text is handed back untouched
		expect(snippet("Revenue", "revenue", true)).toBe("Revenue");
		const long = `${"a".repeat(40)}revenue${"b".repeat(40)}`;
		expect(snippet(long, "revenue", false)).toBe(
			`…${"a".repeat(16)}revenue${"b".repeat(24)}…`,
		);
	});

	it("labels the origin of a hit", () => {
		const kinds: SlideTextHit["kind"][] = ["title", "shape", "table", "notes"];
		const labels = kinds.map((kind) =>
			describeSlideTextHit({ slideIndex: 0, slideId: "s", shapeId: null, kind, text: "" }),
		);
		expect(labels).toEqual([
			"Slide title",
			"Shape text",
			"Table cell",
			"Speaker notes",
		]);
	});
});

describe("PresentationStore left-menu panels", () => {
	it("anchors, resolves, replies and deletes slide comment threads", () => {
		const store = new PresentationStore();
		const thread = store.addSlideComment(1, " tighten this ");
		expect(thread).not.toBeNull();
		expect(thread?.slideIndex).toBe(1);
		expect(thread?.text).toBe("tighten this");
		expect(store.slideComments).toHaveLength(1);
		expect(store.addSlideComment(0, "   ")).toBeNull();

		expect(store.addSlideReply(thread!.id, " done")).not.toBeNull();
		expect(store.slideComments[0].replies).toHaveLength(1);

		store.setSlideCommentResolved(thread!.id, true);
		expect(store.slideComments[0].resolved).toBe(true);

		store.deleteSlideComment(thread!.id);
		expect(store.slideComments).toHaveLength(0);
	});

	it("keeps comment anchors valid when slides are deleted, cloned or moved", () => {
		const store = new PresentationStore();
		store.addSlideComment(0, "first");
		store.addSlideComment(1, "second");
		store.addSlideComment(2, "third");

		store.deleteSlide(1);
		expect(store.slideComments.map((t) => t.slideIndex).sort()).toEqual([0, 1]);

		store.duplicateSlide(0);
		// the copy lands at index 1, so the comment on old index 1 moves to 2
		expect(store.slideComments.map((t) => t.slideIndex).sort()).toEqual([0, 2]);

		store.reorderSlides(0, store.slides.length - 1);
		const anchored = store.slideComments.map((t) => t.slideIndex);
		expect(anchored.every((i) => i >= 0 && i < store.slides.length)).toBe(true);
		expect(store.slideComments).toHaveLength(2);
	});

	it("drops comments that outlive their slides", () => {
		const store = new PresentationStore();
		store.addSlideComment(2, "orphan");
		store.setSlides(store.slides.slice(0, 1));
		expect(store.slideComments).toHaveLength(0);
	});

	it("keeps chat messages in order and clears them", () => {
		const store = new PresentationStore();
		expect(store.addChatMessage("  ")).toBeNull();
		const first = store.addChatMessage("hello");
		const second = store.addChatMessage("world");
		expect([first?.text, second?.text]).toEqual(["hello", "world"]);
		expect(store.chatMessages.map((m) => m.self)).toEqual([true, true]);
		store.clearChatMessages();
		expect(store.chatMessages).toHaveLength(0);
	});

	it("writes search hits back through the editing path", () => {
		const store = new PresentationStore();
		store.setSlides(DECK.map((s) => ({ ...s, shapes: s.shapes.map((x) => ({ ...x })) })));
		store.clearModified();

		const [title, shape, table, notes] = collectSlideText(store.slides);
		expect(store.applySlideText(title, "Annual Review")).toBe(true);
		expect(store.slides[0].title).toBe("Annual Review");

		expect(store.applySlideText(shape, "Revenue is way up")).toBe(true);
		expect(store.slides[0].shapes[0].text).toBe("Revenue is way up");

		expect(store.applySlideText(table, "Turnover")).toBe(true);
		expect(store.slides[0].shapes[1].table?.cells[0].cells[0].text).toBe("Turnover");

		expect(store.applySlideText(notes, "talk about turnover")).toBe(true);
		expect(store.slides[0].notes).toBe("talk about turnover");

		// every write marks the deck modified so autosave/save picks it up
		expect(store.isModified).toBe(true);

		// unknown slide → refused instead of silently dropping the edit
		expect(
			store.applySlideText({ ...title, slideIndex: 99 }, "nope"),
		).toBe(false);
	});
});
