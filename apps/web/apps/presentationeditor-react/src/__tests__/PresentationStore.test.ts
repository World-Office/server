import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresentationStore } from "../stores/PresentationStore";
import type { AnimationData, ShapeData } from "../types/presentation";
import type { PresentationMode, Theme } from "../types/presentation";

// Helper to create a test shape
function makeShape(id: string, overrides: Partial<ShapeData> = {}): ShapeData {
	return {
		id,
		type: "rect",
		x: 100,
		y: 100,
		width: 100,
		height: 50,
		rotation: 0,
		zIndex: 0,
		fillColor: "#4A90D9",
		...overrides,
	};
}

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
	randomUUID: () => `mock-uuid-${Math.random().toString(36).slice(2, 8)}`,
});

describe("PresentationStore", () => {
	let store: PresentationStore;

	beforeEach(() => {
		store = new PresentationStore();
	});

	// ── Initial State ──

	it("initializes with default state", () => {
		expect(store.mode).toBeNull();
		expect(store.document).toBeNull();
		expect(store.isDocReady).toBe(false);
		expect(store.isLoading).toBe(false);
		expect(store.isSaving).toBe(false);
		expect(store.isModified).toBe(false);
		expect(store.isLoadingError).toBeNull();
		expect(store.zoomLevel).toBe(100);
		expect(store.currentSlide).toBe(0);
		expect(store.toolbarVisible).toBe(true);
		expect(store.leftMenuVisible).toBe(true);
		expect(store.rightMenuVisible).toBe(false);
		expect(store.slides).toHaveLength(3);
		expect(store.totalSlides).toBe(3);
		expect(store.slides[0].title).toBe("Title Slide");
		expect(store.slides[1].title).toBe("Overview");
		expect(store.slides[2].title).toBe("Key Points");
	});

	it("initializes with default transition/animation settings", () => {
		expect(store.transitionEffect).toBe("none");
		expect(store.transitionDuration).toBe(0.5);
		expect(store.advanceMode).toBe("click");
		expect(store.animationEffect).toBe("none");
		expect(store.animationCategory).toBe("none");
		expect(store.animationStart).toBe("onClick");
		expect(store.animationDuration).toBe(1);
		expect(store.animationDelay).toBe(0);
	});

	it("initializes with default slide size and theme", () => {
		expect(store.slideSize).toBe("standard");
		expect(store.themeType).toBe("builtin");
		expect(store.theme).toBeDefined();
	});

	// ── Zoom ──

	it("handles zoom", () => {
		store.setZoomLevel(150);
		expect(store.zoomLevel).toBe(150);
		store.zoomIn();
		expect(store.zoomLevel).toBeGreaterThan(150);
		store.zoomOut();
		expect(store.zoomLevel).toBe(150);
	});

	it("clamps zoom to min/max", () => {
		store.setZoomLevel(10);
		expect(store.zoomLevel).toBe(50);
		store.setZoomLevel(999);
		expect(store.zoomLevel).toBe(500);
	});

	it("disables fit flags when zoom is set", () => {
		store.setFitToPage(true);
		store.setZoomLevel(100);
		expect(store.fitToPage).toBe(false);
		expect(store.fitToWidth).toBe(false);
	});

	it("fit toggles are mutually exclusive", () => {
		store.setFitToPage(true);
		expect(store.fitToPage).toBe(true);
		expect(store.fitToWidth).toBe(false);
		store.setFitToWidth(true);
		expect(store.fitToWidth).toBe(true);
		expect(store.fitToPage).toBe(false);
	});

	// ── UI Toggles ──

	it("toggles UI panels", () => {
		store.setLeftMenuVisible(false);
		expect(store.leftMenuVisible).toBe(false);
		store.setRightMenuVisible(true);
		expect(store.rightMenuVisible).toBe(true);
	});

	it("handles modification state", () => {
		expect(store.isModified).toBe(false);
		store.markModified();
		expect(store.isModified).toBe(true);
		store.clearModified();
		expect(store.isModified).toBe(false);
	});

	// ── Tab / FileMenu ──

	it("sets tabs", () => {
		store.setActiveTab("home");
		expect(store.activeTab).toBe("home");
	});

	it("file tab opens file menu", () => {
		store.setActiveTab("file");
		expect(store.activeTab).toBe("file");
		expect(store.isFileMenuOpen).toBe(true);
	});

	it("closing file menu clears active tab", () => {
		store.setActiveTab("file");
		store.setFileMenuOpen(false);
		expect(store.isFileMenuOpen).toBe(false);
		expect(store.activeTab).toBeNull();
	});

	it("toggles file menu", () => {
		store.setFileMenuOpen(true);
		expect(store.isFileMenuOpen).toBe(true);
		store.setFileMenuOpen(false);
		expect(store.isFileMenuOpen).toBe(false);
	});

	// ── Left/Right Panel ──

	it("toggles left panel", () => {
		store.setActiveLeftPanel("slides");
		expect(store.activeLeftPanel).toBe("slides");
		store.toggleLeftPanel("slides");
		expect(store.activeLeftPanel).toBeNull();
	});

	it("opening left panel closes file menu and tab", () => {
		store.setFileMenuOpen(true);
		store.setActiveTab("home");
		store.setActiveLeftPanel("slides");
		expect(store.isFileMenuOpen).toBe(false);
		expect(store.activeTab).toBeNull();
	});

	it("toggles right panel", () => {
		store.toggleRightPanel("shape");
		expect(store.activeRightPanel).toBe("shape");
		store.toggleRightPanel("shape");
		expect(store.activeRightPanel).toBeNull();
	});

	it("switches between right panels", () => {
		store.toggleRightPanel("shape");
		store.toggleRightPanel("animation");
		expect(store.activeRightPanel).toBe("animation");
	});

	// ── File Menu Panel ──

	it("sets active file menu panel", () => {
		store.setActiveFileMenuPanel("saveas");
		expect(store.activeFileMenuPanel).toBe("saveas");
		store.setActiveFileMenuPanel(null);
		expect(store.activeFileMenuPanel).toBeNull();
	});

	// ── Slide Navigation ──

	it("sets current slide", () => {
		store.setCurrentSlide(1);
		expect(store.currentSlide).toBe(1);
	});

	it("sets total slides", () => {
		store.setTotalSlides(5);
		expect(store.totalSlides).toBe(5);
	});

	it("setSlides updates slides and totalSlides", () => {
		store.setSlides([
			{ id: "s1", title: "A", layout: "blank", notes: "", shapes: [] },
			{ id: "s2", title: "B", layout: "blank", notes: "", shapes: [] },
		]);
		expect(store.slides).toHaveLength(2);
		expect(store.totalSlides).toBe(2);
	});

	// ── Slide CRUD ──

	it("adds a slide after the current slide", () => {
		store.setCurrentSlide(0);
		store.addSlide();
		expect(store.slides).toHaveLength(4);
		expect(store.currentSlide).toBe(1);
		expect(store.slides[1].title).toBe("Slide 4");
	});

	it("deletes a slide", () => {
		store.deleteSlide(0);
		expect(store.slides).toHaveLength(2);
		expect(store.totalSlides).toBe(2);
	});

	it("refuses to delete the last slide", () => {
		store.setSlides([
			{ id: "s1", title: "Only", layout: "blank", notes: "", shapes: [] },
		]);
		store.deleteSlide(0);
		expect(store.slides).toHaveLength(1);
	});

	it("adjusts currentSlide after deleting the last slide", () => {
		store.setSlides([
			{ id: "s1", title: "A", layout: "blank", notes: "", shapes: [] },
			{ id: "s2", title: "B", layout: "blank", notes: "", shapes: [] },
		]);
		store.setCurrentSlide(1);
		store.deleteSlide(1);
		expect(store.currentSlide).toBe(0);
	});

	it("duplicates a slide", () => {
		store.slides[0].shapes = [makeShape("shape-1")];
		store.duplicateSlide(0);
		expect(store.slides).toHaveLength(4);
		expect(store.slides[1].title).toBe("Title Slide (copy)");
		expect(store.slides[1].shapes).toHaveLength(1);
		expect(store.slides[1].shapes[0].id).not.toBe("shape-1");
		expect(store.currentSlide).toBe(1);
	});

	it("reorders slides", () => {
		store.reorderSlides(0, 2);
		expect(store.slides[2].title).toBe("Title Slide");
		expect(store.currentSlide).toBe(2);
	});

	// ── Slide Properties ──

	it("sets slide title", () => {
		store.setSlideTitle(0, "New Title");
		expect(store.slides[0].title).toBe("New Title");
	});

	it("sets slide layout", () => {
		store.setSlideLayout(0, "section");
		expect(store.slides[0].layout).toBe("section");
	});

	it("sets slide notes", () => {
		store.setSlideNotes(0, "These are notes");
		expect(store.slides[0].notes).toBe("These are notes");
	});

	it("sets slide background", () => {
		store.setSlideBackground(0, { fillColor: "#F00" });
		expect(store.slides[0].background?.fillColor).toBe("#F00");
		store.setSlideBackground(0, undefined);
		expect(store.slides[0].background).toBeUndefined();
	});

	// ── Shape Operations ──

	it("adds a shape to a slide", () => {
		const shape = makeShape("s1");
		store.addShape(0, shape);
		expect(store.slides[0].shapes).toHaveLength(1);
		expect(store.selectedShapeIds).toEqual(["s1"]);
	});

	it("updates a shape", () => {
		store.addShape(0, makeShape("s1"));
		store.updateShape(0, "s1", { x: 200, y: 300 });
		expect(store.slides[0].shapes[0].x).toBe(200);
		expect(store.slides[0].shapes[0].y).toBe(300);
	});

	it("removes a shape", () => {
		store.addShape(0, makeShape("s1"));
		store.removeShape(0, "s1");
		expect(store.slides[0].shapes).toHaveLength(0);
	});

	it("moves a shape", () => {
		store.addShape(0, makeShape("s1"));
		store.moveShape(0, "s1", 500, 600);
		expect(store.slides[0].shapes[0].x).toBe(500);
		expect(store.slides[0].shapes[0].y).toBe(600);
	});

	it("moveShapes translates shapes by delta", () => {
		store.addShape(0, makeShape("s1"));
		store.moveShapes(0, ["s1"], 50, 30);
		expect(store.slides[0].shapes[0].x).toBe(150);
		expect(store.slides[0].shapes[0].y).toBe(130);
	});

	it("removes selected shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectShape("a");
		store.removeSelectedShapes();
		expect(store.slides[0].shapes).toHaveLength(1);
		expect(store.slides[0].shapes[0].id).toBe("b");
	});

	// ── Shape Selection ──

	it("selects a single shape", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectShape("a");
		expect(store.selectedShapeIds).toEqual(["a"]);
		expect(store.selectedShapeId).toBe("a");
	});

	it("deselects all shapes", () => {
		store.addShape(0, makeShape("a"));
		store.selectShape("a");
		store.deselectShape();
		expect(store.selectedShapeIds).toEqual([]);
		expect(store.selectedShapeId).toBeNull();
	});

	it("toggles shape selection", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectShape("a");
		store.toggleShapeSelection("b");
		expect(store.selectedShapeIds).toContain("a");
		expect(store.selectedShapeIds).toContain("b");
		store.toggleShapeSelection("a");
		expect(store.selectedShapeIds).not.toContain("a");
		expect(store.selectedShapeIds).toContain("b");
	});

	it("selects all shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.addShape(0, makeShape("c"));
		store.selectAllShapes();
		expect(store.selectedShapeIds).toHaveLength(3);
	});

	it("deselects all shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectAllShapes();
		store.deselectAllShapes();
		expect(store.selectedShapeIds).toEqual([]);
	});

	it("isSelected returns true for selected shape", () => {
		store.addShape(0, makeShape("a"));
		store.selectShape("a");
		expect(store.isSelected("a")).toBe(true);
		expect(store.isSelected("b")).toBe(false);
	});

	// ── Z-Order ──

	it("bringForward swaps z-index with next shape", () => {
		store.addShape(0, makeShape("a", { zIndex: 0 }));
		store.addShape(0, makeShape("b", { zIndex: 1 }));
		store.bringForward(0, "a");
		expect(store.slides[0].shapes[0].id).toBe("b");
		expect(store.slides[0].shapes[1].id).toBe("a");
	});

	it("sendBackward swaps z-index with previous shape", () => {
		store.addShape(0, makeShape("a", { zIndex: 0 }));
		store.addShape(0, makeShape("b", { zIndex: 1 }));
		store.sendBackward(0, "b");
		expect(store.slides[0].shapes[0].id).toBe("b");
		expect(store.slides[0].shapes[1].id).toBe("a");
	});

	it("bringToFront moves shape to end of array", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.addShape(0, makeShape("c"));
		store.bringToFront(0, "a");
		expect(store.slides[0].shapes[2].id).toBe("a");
	});

	it("bringToFront focuses the selected shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectShape("a");
		store.bringToFrontSelected();
		expect(store.slides[0].shapes[1].id).toBe("a");
	});

	it("sendToBack moves shape to start of array", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.addShape(0, makeShape("c"));
		store.sendToBack(0, "c");
		expect(store.slides[0].shapes[0].id).toBe("c");
	});

	it("sendToBackSelected sends selected shapes to back", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.addShape(0, makeShape("c"));
		store.selectShape("c");
		store.sendToBackSelected();
		expect(store.slides[0].shapes[0].id).toBe("c");
	});

	// ── Shape Alignment ──

	it("aligns single shape left", () => {
		store.addShape(0, makeShape("a", { x: 100 }));
		store.selectShape("a");
		store.alignLeft();
		expect(store.slides[0].shapes[0].x).toBe(0);
	});

	it("aligns multiple shapes left", () => {
		store.addShape(0, makeShape("a", { x: 100 }));
		store.addShape(0, makeShape("b", { x: 200 }));
		store.selectShape("a");
		store.toggleShapeSelection("b");
		store.alignLeft();
		expect(store.slides[0].shapes[0].x).toBe(100);
		expect(store.slides[0].shapes[1].x).toBe(100);
	});

	it("aligns shape to center of slide", () => {
		store.addShape(0, makeShape("a", { x: 0, width: 200 }));
		store.selectShape("a");
		store.alignCenter();
		// standard slide width=800, center=(800-200)/2=300
		expect(store.slides[0].shapes[0].x).toBe(300);
	});

	it("aligns shape right", () => {
		store.addShape(0, makeShape("a", { x: 0, width: 100 }));
		store.selectShape("a");
		store.alignRight();
		expect(store.slides[0].shapes[0].x).toBe(700);
	});

	it("aligns shape top", () => {
		store.addShape(0, makeShape("a", { y: 50 }));
		store.selectShape("a");
		store.alignTop();
		expect(store.slides[0].shapes[0].y).toBe(0);
	});

	it("aligns shape to middle of slide", () => {
		store.addShape(0, makeShape("a", { y: 0, height: 50 }));
		store.selectShape("a");
		store.alignMiddle();
		expect(store.slides[0].shapes[0].y).toBe(275);
	});

	it("aligns shape bottom", () => {
		store.addShape(0, makeShape("a", { y: 0, height: 50 }));
		store.selectShape("a");
		store.alignBottom();
		expect(store.slides[0].shapes[0].y).toBe(550);
	});

	it("alignShape individual alignment", () => {
		store.addShape(0, makeShape("a", { x: 100 }));
		store.alignShape("a", "right");
		// alignShape uses getSlideDimensions(): baseWidth=960, right=960-100=860
		expect(store.slides[0].shapes[0].x).toBe(860);
	});

	it("alignSelectedShapes aligns all selected", () => {
		store.addShape(0, makeShape("a", { x: 50, y: 50 }));
		store.addShape(0, makeShape("b", { x: 100, y: 100 }));
		store.selectAllShapes();
		store.alignSelectedShapes("left");
		expect(store.slides[0].shapes[0].x).toBe(0);
		expect(store.slides[0].shapes[1].x).toBe(0);
	});

	// ── Distribute ──

	it("distributeHorizontally spaces shapes evenly", () => {
		store.addShape(0, makeShape("a", { x: 0, width: 50 }));
		store.addShape(0, makeShape("b", { x: 100, width: 50 }));
		store.addShape(0, makeShape("c", { x: 300, width: 50 }));
		store.selectAllShapes();
		store.distributeHorizontally();
		expect(store.slides[0].shapes[0].x).toBe(0);
		expect(store.slides[0].shapes[2].x + store.slides[0].shapes[2].width).toBe(
			350,
		);
	});

	it("distributeHorizontally requires 3+ shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectAllShapes();
		store.distributeHorizontally();
		expect(store.slides[0].shapes[0].x).toBe(100);
	});

	it("distributeVertically spaces shapes evenly", () => {
		store.addShape(0, makeShape("a", { y: 0, height: 50 }));
		store.addShape(0, makeShape("b", { y: 100, height: 50 }));
		store.addShape(0, makeShape("c", { y: 300, height: 50 }));
		store.selectAllShapes();
		store.distributeVertically();
		expect(store.slides[0].shapes[0].y).toBe(0);
		expect(store.slides[0].shapes[2].y + store.slides[0].shapes[2].height).toBe(
			350,
		);
	});

	// ── Grouping ──

	it("groups selected shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectAllShapes();
		store.groupSelected();
		expect(store.slides[0].shapes[0].groupId).toBeDefined();
		expect(store.slides[0].shapes[1].groupId).toBe(
			store.slides[0].shapes[0].groupId,
		);
	});

	it("groupSelected requires 2+ shapes", () => {
		store.addShape(0, makeShape("a"));
		store.selectShape("a");
		store.groupSelected();
		expect(store.slides[0].shapes[0].groupId).toBeUndefined();
	});

	it("ungroups selected shapes", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectAllShapes();
		store.groupSelected();
		store.ungroupSelected();
		expect(store.slides[0].shapes[0].groupId).toBeUndefined();
		expect(store.slides[0].shapes[1].groupId).toBeUndefined();
	});

	it("getGroupMemberIds returns member IDs", () => {
		store.addShape(0, makeShape("a"));
		store.addShape(0, makeShape("b"));
		store.selectAllShapes();
		store.groupSelected();
		const gid = store.slides[0].shapes[0].groupId as string;
		const members = store.getGroupMemberIds(gid);
		expect(members).toHaveLength(2);
		expect(members).toContain("a");
		expect(members).toContain("b");
	});

	it("moves grouped shapes together", () => {
		store.addShape(0, makeShape("a", { x: 100, y: 100 }));
		store.addShape(0, makeShape("b", { x: 200, y: 200 }));
		store.selectAllShapes();
		store.groupSelected();
		store.moveShape(0, "a", 150, 150);
		// b should move by the same delta (+50, +50)
		expect(store.slides[0].shapes[0].x).toBe(150);
		expect(store.slides[0].shapes[0].y).toBe(150);
		expect(store.slides[0].shapes[1].x).toBe(250);
		expect(store.slides[0].shapes[1].y).toBe(250);
	});

	// ── Transition ──

	it("sets transition effect", () => {
		store.setTransitionEffect("wipe");
		expect(store.transitionEffect).toBe("wipe");
	});

	it("sets transition duration", () => {
		store.setTransitionDuration(1.5);
		expect(store.transitionDuration).toBe(1.5);
	});

	it("sets advance mode", () => {
		store.setAdvanceMode("auto");
		expect(store.advanceMode).toBe("auto");
	});

	it("sets advance timing", () => {
		store.setAdvanceTiming(5);
		expect(store.advanceTiming).toBe(5);
	});

	it("getEffectiveTransition returns global transition when slide has none", () => {
		const t = store.getEffectiveTransition(0);
		expect(t.effect).toBe("none");
		expect(t.duration).toBe(0.5);
	});

	it("getEffectiveTransition returns per-slide transition when set", () => {
		const slide = store.slides[0];
		slide.transitionEffect = "zoom";
		slide.transitionDuration = 2;
		const t = store.getEffectiveTransition(0);
		expect(t.effect).toBe("zoom");
		expect(t.duration).toBe(2);
	});

	// ── Animation ──

	it("sets animation settings", () => {
		store.setAnimationEffect("fade");
		expect(store.animationEffect).toBe("fade");
		store.setAnimationCategory("basic");
		expect(store.animationCategory).toBe("basic");
		store.setAnimationStart("withPrevious");
		expect(store.animationStart).toBe("withPrevious");
		store.setAnimationDuration(2);
		expect(store.animationDuration).toBe(2);
		store.setAnimationDelay(0.5);
		expect(store.animationDelay).toBe(0.5);
	});

	it("adds animation to a slide", () => {
		store.addAnimation(0, "fade", "basic");
		expect(store.slides[0].animations).toHaveLength(1);
		expect(store.slides[0].animations?.[0].effect).toBe("fade");
		expect(store.slides[0].animations?.[0].category).toBe("basic");
	});

	it("removes animation from a slide", () => {
		store.addAnimation(0, "fly", "basic");
		const animId = store.slides[0].animations?.[0].id;
		store.removeAnimation(0, animId);
		expect(store.slides[0].animations).toHaveLength(0);
	});

	it("moveAnimationEarlier swaps with previous", () => {
		store.addAnimation(0, "fade", "basic");
		store.addAnimation(0, "fly", "basic");
		store.moveAnimationEarlier(0, 1);
		expect(store.slides[0].animations?.[0].effect).toBe("fly");
		expect(store.slides[0].animations?.[1].effect).toBe("fade");
	});

	it("moveAnimationLater swaps with next", () => {
		store.addAnimation(0, "fade", "basic");
		store.addAnimation(0, "fly", "basic");
		store.moveAnimationLater(0, 0);
		expect(store.slides[0].animations?.[0].effect).toBe("fly");
		expect(store.slides[0].animations?.[1].effect).toBe("fade");
	});

	it("sets animation target", () => {
		store.addAnimation(0, "fade", "basic");
		const animId = store.slides[0].animations?.[0].id;
		store.setAnimationTarget(0, animId, "shape-1");
		expect(store.slides[0].animations?.[0].target).toBe("shape-1");
	});

	// ── Undo / Redo ──

	it("undo reverts to snapshot before the action", () => {
		// pushSnapshot captures state BEFORE the action.
		// First action creates the base snapshot (historyIndex=0, can't undo).
		// Second action pushes another snapshot (historyIndex=1, can undo).
		store.addSlide(); // 4 slides, snapshots 3 (base)
		store.addSlide(); // 5 slides, snapshots 4
		expect(store.slides).toHaveLength(5);
		// undo restores snapshot[0] = state before both actions
		store.undo();
		expect(store.slides).toHaveLength(3);
	});

	it("redo re-applies undone action", () => {
		store.addSlide();
		store.undo();
		store.redo();
		expect(store.slides).toHaveLength(4);
	});

	it("cannot undo past start", () => {
		store.undo();
		expect(store.slides).toHaveLength(3);
	});

	it("cannot redo past latest", () => {
		store.redo();
		expect(store.slides).toHaveLength(3);
	});

	it("undo/redo updates availability flags", () => {
		expect(store.canUndo).toBe(false);
		expect(store.canRedo).toBe(false);
		// First action: only 1 snapshot (base state), canUndo stays false
		store.addSlide();
		expect(store.canUndo).toBe(false);
		expect(store.canRedo).toBe(false);
		expect(store.slides).toHaveLength(4);
		// Second action: 2 snapshots now, canUndo=true
		store.addSlide();
		expect(store.canUndo).toBe(true);
		expect(store.canRedo).toBe(false);
		expect(store.slides).toHaveLength(5);
		// Undo: back to snapshot[0] (3 slides), at base
		store.undo();
		expect(store.canUndo).toBe(false);
		expect(store.canRedo).toBe(true);
		expect(store.slides).toHaveLength(3);
		// Redo: forward to snapshot[1] (4 slides)
		store.redo();
		expect(store.canUndo).toBe(true);
		expect(store.canRedo).toBe(false);
		expect(store.slides).toHaveLength(4);
	});

	it("new action after undo clears redo history", () => {
		store.addSlide();
		store.undo();
		store.addSlide();
		expect(store.canRedo).toBe(false);
	});

	// ── Serialization ──

	it("toJSON produces valid JSON with version 3", () => {
		const json = store.toJSON();
		const data = JSON.parse(json);
		expect(data.version).toBe(3);
		expect(data.slides).toHaveLength(3);
		expect(data.slideSize).toBe("standard");
	});

	it("fromJSON restores state from valid JSON", () => {
		const json = JSON.stringify({
			version: 3,
			slideSize: "widescreen",
			themeType: "builtin",
			theme: { name: "Dark" },
			slides: [
				{
					id: "s1",
					title: "Custom",
					layout: "title",
					notes: "hello",
					shapes: [],
				},
			],
		});
		store.fromJSON(json);
		expect(store.slideSize).toBe("widescreen");
		expect(store.slides).toHaveLength(1);
		expect(store.slides[0].title).toBe("Custom");
		expect(store.slides[0].notes).toBe("hello");
		expect(store.totalSlides).toBe(1);
		expect(store.currentSlide).toBe(0);
	});

	it("fromJSON handles invalid JSON gracefully", () => {
		store.fromJSON("not json");
		expect(store.slides).toHaveLength(3);
	});

	it("fromJSON handles missing slides field", () => {
		store.fromJSON(JSON.stringify({ version: 3 }));
		expect(store.slides).toHaveLength(3);
	});

	// ── toJSON / fromJSON roundtrip ──

	it("roundtrips through toJSON/fromJSON", () => {
		store.setSlideTitle(0, "Modified Title");
		store.addShape(1, makeShape("shape-1"));
		store.setSlideSize("widescreen");
		const json = store.toJSON();
		const newStore = new PresentationStore();
		newStore.fromJSON(json);
		expect(newStore.slideSize).toBe("widescreen");
		expect(newStore.slides[0].title).toBe("Modified Title");
		expect(newStore.slides[1].shapes).toHaveLength(1);
		expect(newStore.slides[1].shapes[0].id).toBe("shape-1");
	});

	// ── Clipboard ──

	it("copies shape to clipboard", () => {
		store.addShape(0, makeShape("cp1"));
		store.addShape(0, makeShape("cp2"));
		store.selectAllShapes();
		store.copyShape();
		expect(store.clipboardShapes).toHaveLength(2);
	});

	it("cuts shape to clipboard and removes from slide", () => {
		store.addShape(0, makeShape("ct1"));
		store.addShape(0, makeShape("ct2"));
		store.selectAllShapes();
		store.cutShape();
		expect(store.clipboardShapes).toHaveLength(2);
		expect(store.slides[0].shapes).toHaveLength(0);
	});

	it("pastes shape from clipboard to current slide", () => {
		store.addShape(0, makeShape("p1"));
		store.addShape(0, makeShape("p2"));
		store.selectAllShapes();
		store.copyShape();
		store.setCurrentSlide(1);
		store.pasteShape();
		expect(store.slides[1].shapes).toHaveLength(2);
		expect(store.slides[1].shapes[0].id).not.toBe("p1");
	});

	it("pastes shape with offset", () => {
		store.addShape(0, makeShape("p1", { x: 100, y: 200 }));
		store.selectShape("p1");
		store.copyShape();
		store.pasteShape();
		expect(store.slides[0].shapes).toHaveLength(2);
		expect(store.slides[0].shapes[1].x).toBeGreaterThan(100);
		expect(store.slides[0].shapes[1].y).toBeGreaterThan(200);
		expect(store.selectedShapeIds).toHaveLength(1);
	});

	it("pasteShape does nothing when clipboard empty", () => {
		store.pasteShape();
		expect(store.slides[0].shapes).toHaveLength(0);
	});

	// ── Inline Text Editing ──

	it("starts inline text editing", () => {
		store.addShape(0, makeShape("txt"));
		store.startInlineEdit("txt");
		expect(store.editingShapeId).toBe("txt");
		expect(store.inlineEditText).toBe("");
	});

	it("ends inline text editing and saves text", () => {
		store.addShape(0, makeShape("txt"));
		store.startInlineEdit("txt");
		store.updateInlineText("Hello World");
		store.endInlineEdit();
		expect(store.editingShapeId).toBeNull();
		expect(store.inlineEditText).toBe("");
		expect(store.slides[0].shapes[0].text).toBe("Hello World");
	});

	// ── Presentation Mode ──

	it("starts and ends presentation", () => {
		store.startPresentation();
		expect(store.isPresenting).toBe(true);
		expect(store.presentStep).toBe(0);
		store.endPresentation();
		expect(store.isPresenting).toBe(false);
		expect(store.presentStep).toBe(0);
	});

	it("navigates slides in presentation mode", () => {
		store.startPresentation();
		store.nextSlide();
		expect(store.currentSlide).toBe(1);
		store.nextSlide();
		expect(store.currentSlide).toBe(2);
		store.prevSlide();
		expect(store.currentSlide).toBe(1);
	});

	it("prevSlide does not go below 0", () => {
		store.startPresentation();
		store.prevSlide();
		expect(store.presentStep).toBe(0);
		expect(store.currentSlide).toBe(0);
	});

	it("nextSlide does not go past last slide", () => {
		store.startPresentation();
		// presentStep starts at currentSlide (0)
		// Navigate to last slide
		store.nextSlide();
		store.nextSlide();
		expect(store.presentStep).toBe(2);
		// Try going past last
		store.nextSlide();
		expect(store.presentStep).toBe(2);
	});

	// ── Add Chart ──

	it("adds a chart to a slide", () => {
		store.addChartToSlide(0, "bar");
		expect(store.slides[0].shapes).toHaveLength(1);
		expect(store.slides[0].shapes[0].chart).toBeDefined();
		expect(store.slides[0].shapes[0].chart?.type).toBe("bar");
		expect(store.slides[0].shapes[0].id).toMatch(/^chart-/);
	});

	it("addChartToSlide auto-positions shape", () => {
		store.addChartToSlide(0, "line");
		const shape = store.slides[0].shapes[0];
		expect(shape.width).toBe(400);
		expect(shape.height).toBe(300);
	});

	// ── Add Connector ──

	it("adds a connector to a slide", () => {
		store.addConnectorToSlide(0, "curved");
		expect(store.slides[0].shapes).toHaveLength(1);
		expect(store.slides[0].shapes[0].connector).toBeDefined();
		expect(store.slides[0].shapes[0].connector?.connectorType).toBe("curved");
	});

	// ── Slide Size / Theme ──

	it("sets slide size", () => {
		store.setSlideSize("widescreen");
		expect(store.slideSize).toBe("widescreen");
	});

	it("sets theme and theme type", () => {
		store.setThemeType("custom");
		expect(store.themeType).toBe("custom");
		store.setTheme({ name: "CustomTheme", colors: {} } as unknown as Theme);
		expect(store.theme?.name).toBe("CustomTheme");
	});

	// ── Document and Mode ──

	it("sets document", () => {
		store.setDocument({ title: "test.pptx", fileType: "pptx" });
		expect(store.document?.title).toBe("test.pptx");
	});

	it("sets mode", () => {
		store.setMode({
			isEdit: true,
			canDownload: true,
			canPrint: true,
			customization: { goback: {} },
		} as unknown as PresentationMode);
		expect(store.mode?.isEdit).toBe(true);
	});

	// ── WOPI State ──

	it("manages WOPI connection state", () => {
		expect(store.wopiFileId).toBeNull();
		expect(store.wopiAccessToken).toBeNull();
		expect(store.wopiConnection).toBeNull();
		store.wopiFileId = "file123";
		store.wopiAccessToken = "token123";
		store.docserverBase = "https://example.com";
		expect(store.wopiConnection).toBeDefined();
		expect(store.wopiConnection?.wopiFileId).toBe("file123");
	});

	it("detectWopiParams does not throw without WOPI params", () => {
		// detectWopiParams uses window.location.search; in jsdom this is empty
		const result = store.detectWopiParams();
		// No WOPI params means it returns false
		expect(result).toBe(false);
	});

	// ── Collaboration ──

	it("registerMutationCallback stores callback", () => {
		const cb = vi.fn();
		store.registerMutationCallback(cb);
		// Trigger a mutation that should call the callback
		store.addShape(0, makeShape("test-collab"));
		expect(cb).toHaveBeenCalledWith(
			"shape_add",
			expect.objectContaining({
				slide_index: 0,
			}),
		);
		expect(cb.mock.calls[0][1].shape.id).toBe("test-collab");
	});

	// ── Language ──

	it("sets language code", () => {
		store.setLanguageCode("de");
		expect(store.languageCode).toBe("de");
	});

	// ── Compact Mode ──

	it("sets compact toolbar", () => {
		store.setCompactToolbar(true);
		expect(store.isCompactToolbar).toBe(true);
	});

	it("sets compact statusbar", () => {
		store.setCompactStatusbar(true);
		expect(store.isCompactStatusbar).toBe(true);
	});

	// ── BuildDocumentBlob ──

	it("buildDocumentBlob returns Blob", async () => {
		const blob = await store.buildDocumentBlob();
		expect(blob).toBeInstanceOf(Blob);
	});
});
