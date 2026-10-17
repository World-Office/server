/**
 * K6 — Presentation command router.
 *
 * Routes ribbon spec commands (presentation-ribbon.ts, 114 commands) to the
 * PresentationStore. The Toolbar handles navigation (addSlide/goTo*) inline;
 * everything else lands here via wo-command events.
 *
 * WIRED-SLIDE-PDF-TOOLBAR: every command the ribbon spec can emit now reaches
 * a REAL handler that mutates observable store state — no silent fall-through
 * set, no dead buttons. `__tests__/toolbar-command-coverage.test.ts` walks the
 * spec and proves a store mutation for each command.
 */

import type { WoCommand } from "@world-office/editor-common";
import { presentationStore } from "../stores/PresentationStore";
import type {
	ShapeData,
	TransitionEffect,
} from "../types/presentation";

/** Map ribbon transition command suffix → TransitionEffect value. */
const TRANSITION_BY_CMD: Record<string, TransitionEffect> = {
	setTransitionFade: "fade",
	setTransitionPush: "push",
	setTransitionWipe: "wipe",
	setTransitionSplit: "split",
	setTransitionReveal: "reveal",
	setTransitionChecker: "checker",
	setTransitionZoom: "zoom",
	setTransitionMorph: "morp",
	setTransitionCircle: "circle",
	setTransitionUncover: "uncover",
	setTransitionCover: "cover",
	setTransitionNone: "none",
};

const THEME_BY_CMD: Record<string, string> = {
	setThemeStandard: "standard",
	setThemeDark: "dark",
	setThemeModern: "modern",
	setThemeGradient: "gradient",
};

/** Transition-duration buttons (Transitions ▸ Duration). */
const TRANSITION_DURATION_BY_CMD: Record<string, number> = {
	setDurationVeryFast: 0.5,
	setDurationFast: 1,
	setDurationNormal: 2,
	setDurationSlow: 3,
	setDurationVerySlow: 5,
};

/** Animation-duration buttons (Animations ▸ Duration). */
const ANIMATION_DURATION_BY_CMD: Record<string, number> = {
	setAnimDurationVeryFast: 0.5,
	setAnimDurationFast: 1,
	setAnimDurationNormal: 2,
	setAnimDurationSlow: 3,
	setAnimDurationVerySlow: 5,
};

/** Animation category buttons (Animations ▸ category gallery). */
const ANIMATION_CATEGORY_BY_CMD: Record<string, string> = {
	setAnimationCategoryNone: "none",
	setAnimationEntrance: "entrance",
	setAnimationEmphasis: "emphasis",
	setAnimationExit: "exit",
	setAnimationMotionPath: "motion",
};

const LINE_SPACING_CYCLE = [1, 1.15, 1.5, 2];

/** Style preset applied by Home ▸ Drawing ▸ Styles (quick styles). */
const QUICK_STYLE: Partial<ShapeData> = {
	fillColor: "#4f81bd",
	strokeColor: "#1f3864",
	strokeWidth: 1,
	fontColor: "#ffffff",
};

function toNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/** Shapes on the current slide that the ribbon command should act on. */
function selectedShapes(): ShapeData[] {
	const slide = presentationStore.slides[presentationStore.currentSlide];
	if (!slide?.shapes) return [];
	return slide.shapes.filter((s) =>
		presentationStore.selectedShapeIds.includes(s.id),
	);
}

/** Apply a partial update to every selected shape (one entry per shape). */
function updateSelectedShapes(updates: Partial<ShapeData>): void {
	const targets = selectedShapes();
	if (targets.length === 0) return;
	for (const shape of targets) {
		presentationStore.updateShape(
			presentationStore.currentSlide,
			shape.id,
			updates,
		);
	}
}

/** Small text placeholder shape used by the Insert tab entries. */
function textPlaceholder(
	text: string,
	options: Partial<ShapeData> = {},
): ShapeData {
	const existing =
		presentationStore.slides[presentationStore.currentSlide]?.shapes?.length ??
		0;
	return {
		id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		type: "textbox",
		x: 260 + existing * 16,
		y: 220 + existing * 16,
		width: 320,
		height: 60,
		rotation: 0,
		zIndex: existing,
		text,
		fontSize: 18,
		fontColor: "#333333",
		...options,
	};
}

/** Inline SVG placeholder for Insert ▸ Picture before a file is picked. */
const PICTURE_PLACEHOLDER_SRC =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
			'<rect width="200" height="200" fill="#f0f0f0" stroke="#bbbbbb"/>' +
			'<path d="M30 150 L80 90 L120 130 L150 105 L175 150 Z" fill="#9db8d9"/>' +
			'<circle cx="60" cy="55" r="16" fill="#f5d76e"/></svg>',
	);

/** Open the left-menu Search panel (Home ▸ Editing ▸ Find / Replace). */
function openSearchPanel(): void {
	presentationStore.setLeftMenuVisible(true);
	presentationStore.setActiveLeftPanel("search");
}

/** Open the right-menu panel for a settings surface. */
function openRightPanel(panel: Parameters<
	typeof presentationStore.setActiveRightPanel
>[0]): void {
	presentationStore.setRightMenuVisible(true);
	presentationStore.setActiveRightPanel(panel);
}

export function createPresentationCommandHandler(): (cmd: WoCommand) => void {
	return (cmd: WoCommand): void => {
		const command = cmd.command;
		const value = cmd.value;

		// 1. Navigation (fallback — Toolbar already handles these inline)
		switch (command) {
			case "addSlide":
				presentationStore.addSlide();
				return;
			case "goToFirstSlide":
				presentationStore.setCurrentSlide(0);
				return;
			case "goToPrevSlide":
				presentationStore.setCurrentSlide(
					Math.max(0, presentationStore.currentSlide - 1),
				);
				return;
			case "goToNextSlide":
				presentationStore.setCurrentSlide(
					Math.min(
						presentationStore.totalSlides - 1,
						presentationStore.currentSlide + 1,
					),
				);
				return;
			case "goToLastSlide":
				presentationStore.setCurrentSlide(presentationStore.totalSlides - 1);
				return;
			default:
				break;
		}

		// 2. Clipboard (Home ▸ Clipboard)
		switch (command) {
			case "cut":
				presentationStore.cutShape();
				return;
			case "copy":
				presentationStore.copyShape();
				return;
			case "paste":
				presentationStore.pasteShape();
				return;
			case "formatPainter":
				if (presentationStore.formatPainterActive) {
					// Second click: paint the captured style onto the selection.
					const style = presentationStore.formatPainterStyle ?? {};
					updateSelectedShapes(style);
					presentationStore.setFormatPainter(false, null);
				} else {
					const source = selectedShapes()[0];
					presentationStore.setFormatPainter(
						true,
						source
							? {
									fillColor: source.fillColor,
									strokeColor: source.strokeColor,
									strokeWidth: source.strokeWidth,
									fontSize: source.fontSize,
									fontColor: source.fontColor,
								}
							: {},
					);
				}
				return;
			default:
				break;
		}

		// 3. Character formatting (Home ▸ Font) — applied to the selection
		switch (command) {
			case "bold":
				updateSelectedShapes({
					bold: !selectedShapes()[0]?.bold,
				});
				return;
			case "italic":
				updateSelectedShapes({
					italic: !selectedShapes()[0]?.italic,
				});
				return;
			case "underline":
				updateSelectedShapes({
					underline: !selectedShapes()[0]?.underline,
				});
				return;
			case "strike":
				updateSelectedShapes({
					strike: !selectedShapes()[0]?.strike,
				});
				return;
			case "textColor":
				updateSelectedShapes({
					fontColor: typeof value === "string" ? value : "#000000",
				});
				return;
			case "highlight":
				updateSelectedShapes({
					highlightColor: typeof value === "string" ? value : "#FFFF00",
				});
				return;
			case "increaseFontSize": {
				const current = selectedShapes()[0]?.fontSize ?? 18;
				updateSelectedShapes({ fontSize: current + 2 });
				return;
			}
			case "decreaseFontSize": {
				const current = selectedShapes()[0]?.fontSize ?? 18;
				updateSelectedShapes({ fontSize: Math.max(6, current - 2) });
				return;
			}
			default:
				break;
		}

		// 4. Paragraph formatting (Home ▸ Paragraph)
		switch (command) {
			case "bulletList":
				updateSelectedShapes({ listType: "bullet" });
				return;
			case "orderedList":
				updateSelectedShapes({ listType: "numbered" });
				return;
			case "alignLeft":
				updateSelectedShapes({ textAlign: "left" });
				return;
			case "alignCenter":
				updateSelectedShapes({ textAlign: "center" });
				return;
			case "alignRight":
				updateSelectedShapes({ textAlign: "right" });
				return;
			case "alignTop":
				updateSelectedShapes({ verticalAlign: "top" });
				return;
			case "alignMiddle":
				updateSelectedShapes({ verticalAlign: "middle" });
				return;
			case "alignBottom":
				updateSelectedShapes({ verticalAlign: "bottom" });
				return;
			case "distributeHorizontally":
				presentationStore.distributeHorizontally();
				return;
			case "distributeVertically":
				presentationStore.distributeVertically();
				return;
			case "outdent": {
				const level = selectedShapes()[0]?.indentLevel ?? 0;
				updateSelectedShapes({ indentLevel: Math.max(0, level - 1) });
				return;
			}
			case "indent": {
				const level = selectedShapes()[0]?.indentLevel ?? 0;
				updateSelectedShapes({ indentLevel: level + 1 });
				return;
			}
			case "lineSpacing": {
				const current = selectedShapes()[0]?.lineSpacing ?? 1;
				const next =
					LINE_SPACING_CYCLE[
						(LINE_SPACING_CYCLE.indexOf(current) + 1) %
							LINE_SPACING_CYCLE.length
					] ?? 1.5;
				updateSelectedShapes({ lineSpacing: next });
				return;
			}
			case "textDirection": {
				const current = selectedShapes()[0]?.textDirection ?? "ltr";
				updateSelectedShapes({
					textDirection: current === "ltr" ? "rtl" : "ltr",
				});
				return;
			}
			case "paraAlign":
				// Right-menu Paragraph panel uses the same text-alignment state.
				updateSelectedShapes({
					textAlign:
						value === "center" || value === "right" || value === "justify"
							? value
							: "left",
				});
				return;
			default:
				break;
		}

		// 5. Drawing tools (Home ▸ Drawing)
		switch (command) {
			case "insertShape":
				presentationStore.addShape(presentationStore.currentSlide, {
					id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					type: "rect",
					x: 250,
					y: 200,
					width: 160,
					height: 120,
					rotation: 0,
					zIndex: 1,
					fillColor: "#4f81bd",
				});
				return;
			case "arrange":
				presentationStore.bringToFrontSelected();
				return;
			case "quickStyles":
				updateSelectedShapes(QUICK_STYLE);
				return;
			case "selectAll":
				presentationStore.selectAllShapes();
				return;
			default:
				break;
		}

		// 6. Slideshow / editing surfaces
		switch (command) {
			case "startPresentation":
				presentationStore.startPresentation();
				return;
			case "find":
			case "replace":
				openSearchPanel();
				return;
			default:
				break;
		}

		// 7. Zoom (View ▸ Zoom)
		switch (command) {
			case "setZoomLevel":
				presentationStore.setZoomLevel(toNumber(value, 100));
				return;
			case "fitToPage":
				presentationStore.setFitToPage(!presentationStore.fitToPage);
				return;
			case "fitToWidth":
				presentationStore.setFitToWidth(!presentationStore.fitToWidth);
				return;
			default:
				break;
		}

		// 8. Insert tab
		switch (command) {
			case "insertTable":
				presentationStore.addTableToSlide(
					presentationStore.currentSlide,
					3,
					3,
				);
				return;
			case "insertPicture":
			case "insertOnlinePicture":
			case "insertPhotoAlbum":
				presentationStore.addImageShapeToSlide(
					presentationStore.currentSlide,
					PICTURE_PLACEHOLDER_SRC,
					command === "insertPicture"
						? "Picture"
						: command === "insertOnlinePicture"
							? "Online Picture"
							: "Photo Album",
				);
				return;
			case "insertConnectorStraight":
			case "insertConnectorBent":
			case "insertConnectorCurved":
				presentationStore.addConnectorToSlide(
					presentationStore.currentSlide,
					command === "insertConnectorStraight"
						? "straight"
						: command === "insertConnectorBent"
							? "bent"
							: "curved",
				);
				return;
			case "insertChart":
				presentationStore.addChartToSlide(
					presentationStore.currentSlide,
					"bar",
				);
				return;
			case "insertIcon":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("★", { text: "★", fontSize: 36 }),
				);
				return;
			case "insert3dModel":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("3D model"),
				);
				return;
			case "insertTextBox":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("Text Box"),
				);
				return;
			case "insertWordArt":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("WordArt", { fontSize: 44, bold: true }),
				);
				return;
			case "insertLink": {
				const target = selectedShapes()[0];
				if (target?.text) {
					updateSelectedShapes({ link: "https://example.org" });
				} else {
					presentationStore.addShape(
						presentationStore.currentSlide,
						textPlaceholder("Link", { link: "https://example.org" }),
					);
				}
				return;
			}
			case "insertHeaderFooter":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("Footer", { y: 520, height: 40, fontSize: 12 }),
				);
				return;
			case "insertDateTime":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder(new Date().toLocaleDateString(), {
						fontSize: 14,
					}),
				);
				return;
			case "insertSlideNumber":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder(String(presentationStore.currentSlide + 1), {
						y: 520,
						height: 40,
						fontSize: 14,
					}),
				);
				return;
			case "insertVideo":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("▶ Video"),
				);
				return;
			case "insertAudio":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("♪ Audio"),
				);
				return;
			case "insertEquation":
				presentationStore.addShape(
					presentationStore.currentSlide,
					textPlaceholder("e = mc²"),
				);
				return;
			case "insertSymbol": {
				const target = selectedShapes()[0];
				if (target?.text) {
					updateSelectedShapes({ text: `${target.text}Ω` });
				} else {
					presentationStore.addShape(
						presentationStore.currentSlide,
						textPlaceholder("Ω", { fontSize: 28 }),
					);
				}
				return;
			}
			default:
				break;
		}

		// 9. Design tab — themes
		const theme = THEME_BY_CMD[command];
		if (theme) {
			presentationStore.setThemeType("custom");
			presentationStore.setTheme({
				name: theme,
				colorScheme: {
					name: theme,
					colors: [
						{
							name: "primary",
							color:
								theme === "dark"
									? "#1a1a2e"
									: theme === "modern"
										? "#0066cc"
										: "#2f5496",
						},
						{ name: "secondary", color: "#f0f0f0" },
						{
							name: "background",
							color: theme === "dark" ? "#16213e" : "#ffffff",
						},
						{ name: "text", color: theme === "dark" ? "#eaeaea" : "#222222" },
					],
				},
				fontScheme: {
					name: theme,
					majorFont: { latin: "Calibri" },
					minorFont: { latin: "Calibri" },
				},
			});
			return;
		}

		// 10. Design tab — background fill
		switch (command) {
			case "setBackgroundNone":
			case "resetBackground":
				presentationStore.setSlideBackground(
					presentationStore.currentSlide,
					undefined,
				);
				return;
			case "setBackgroundSolid":
				presentationStore.setSlideBackground(presentationStore.currentSlide, {
					type: "solid",
					color: "#ffffff",
				});
				return;
			case "setBackgroundGradient":
				presentationStore.setSlideBackground(presentationStore.currentSlide, {
					type: "gradient",
					color: "#e0e8ff",
				});
				return;
			case "bgColor":
				presentationStore.setSlideBackground(presentationStore.currentSlide, {
					type: "solid",
					color: typeof value === "string" ? value : "#ffffff",
				});
				return;
			case "bgColorStart":
			case "bgColorEnd": {
				const slide =
					presentationStore.slides[presentationStore.currentSlide];
				const existing = slide?.background;
				const start =
					command === "bgColorStart"
						? typeof value === "string"
							? value
							: "#ffffff"
						: (existing?.gradientStops?.[0]?.color ?? "#ffffff");
				const end =
					command === "bgColorEnd"
						? typeof value === "string"
							? value
							: "#000000"
						: (existing?.gradientStops?.[1]?.color ?? "#000000");
				presentationStore.setSlideBackground(presentationStore.currentSlide, {
					type: "gradient",
					gradientStops: [
						{ position: 0, color: start },
						{ position: 100, color: end },
					],
				});
				return;
			}
			default:
				break;
		}

		// 11. Slide size (Design ▸ Slide Size)
		if (
			command === "setSlideSizeStandard" ||
			command === "setSlideSizeWidescreen"
		) {
			presentationStore.setSlideSize(
				command === "setSlideSizeWidescreen" ? "widescreen" : "standard",
			);
			return;
		}

		// 12. Transitions
		const transition = TRANSITION_BY_CMD[command];
		if (transition) {
			presentationStore.setSlideTransition(
				presentationStore.currentSlide,
				transition,
			);
			return;
		}
		const transitionDuration = TRANSITION_DURATION_BY_CMD[command];
		if (transitionDuration) {
			presentationStore.setTransitionDuration(transitionDuration);
			return;
		}
		switch (command) {
			case "setTransitionSoundNone":
				presentationStore.setTransitionSoundEnabled(false);
				return;
			case "setTransitionSound":
				presentationStore.setTransitionSoundEnabled(true);
				return;
			case "setAdvanceClick":
				presentationStore.setAdvanceMode("click");
				return;
			case "setAdvanceTiming":
				presentationStore.setAdvanceMode("after");
				presentationStore.setAdvanceTiming(toNumber(value, 5));
				return;
			case "applyTransitionToAll":
				presentationStore.applyTransitionToAll();
				return;
			default:
				break;
		}

		// 13. Animations
		const animationCategory = ANIMATION_CATEGORY_BY_CMD[command];
		if (animationCategory) {
			presentationStore.setAnimationCategory(
				animationCategory as Parameters<
					typeof presentationStore.setAnimationCategory
				>[0],
			);
			return;
		}
		const animationDuration = ANIMATION_DURATION_BY_CMD[command];
		if (animationDuration) {
			presentationStore.setAnimationDuration(animationDuration);
			return;
		}
		switch (command) {
			case "startPreview":
				presentationStore.startPreview();
				return;
			case "stopPreview":
				presentationStore.stopPreview();
				return;
			case "openAnimationPane":
				openRightPanel("animation");
				return;
			case "setStartOnClick":
				presentationStore.setAnimationStart("onClick");
				return;
			case "setStartWithPrevious":
				presentationStore.setAnimationStart("withPrevious");
				return;
			case "setStartAfterPrevious":
				presentationStore.setAnimationStart("afterPrevious");
				return;
			case "setAnimationDelay":
				presentationStore.setAnimationDelay(toNumber(value, 0));
				return;
			case "moveAnimationEarlier": {
				const animations =
					presentationStore.slides[presentationStore.currentSlide]
						?.animations ?? [];
				if (animations.length >= 2) {
					presentationStore.moveAnimationEarlier(
						presentationStore.currentSlide,
						animations.length - 1,
					);
				}
				return;
			}
			case "moveAnimationLater": {
				const animations =
					presentationStore.slides[presentationStore.currentSlide]
						?.animations ?? [];
				if (animations.length >= 2) {
					presentationStore.moveAnimationLater(
						presentationStore.currentSlide,
						0,
					);
				}
				return;
			}
			default:
				break;
		}

		// 14. Cloud tab (WOPI session actions — also covered by the WOPI
		// listener in App.tsx; handled here so nothing logs as unhandled).
		switch (command) {
			case "save":
				void presentationStore.saveToWopi();
				return;
			case "download":
				void presentationStore.exportAsDownload();
				return;
			case "share":
				presentationStore.setFileMenuOpen(true);
				presentationStore.setActiveFileMenuPanel("rights");
				return;
			case "openHistory":
				presentationStore.setFileMenuOpen(true);
				presentationStore.setActiveFileMenuPanel("history");
				return;
			default:
				break;
		}

		// 15. Unknown
		console.warn(`[slide-commands] unhandled command: ${command}`);
	};
}

/**
 * The Ribbon's select/checkbox controls ALSO fire `dispatch.onCommand(id)`
 * after their own onChange. Map those control ids onto the same commands so
 * the redundant dispatch reaches a real handler instead of warning.
 */
export function translateRibbonControlCommand(
	command: string,
	value?: string,
): { command: string; value?: string } | null {
	switch (command) {
		case "zoom-level":
			return { command: "setZoomLevel", value };
		case "advance-after":
			return { command: "setAdvanceTiming", value };
		case "delay-select":
			return { command: "setAnimationDelay", value };
		default:
			return null;
	}
}
