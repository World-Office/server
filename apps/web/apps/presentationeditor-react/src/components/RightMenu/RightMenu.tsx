import {
	type WoCommand,
	registerEditorRouter,
} from "@world-office/editor-common";
import { observer } from "mobx-react-lite";
import { type JSX, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../stores/PresentationStore";
import type { RightMenuPanel } from "../../types/presentation";
import type { SlideLayout } from "../../types/presentation";
import { AnimationPanel } from "./AnimationPanel";
import { ChartPanel } from "./ChartPanel";
import { ImagePanel } from "./ImagePanel";
import { ParagraphPanel } from "./ParagraphPanel";
import { RightMenuButton } from "./RightMenuButton";
import { ShapePanel } from "./ShapePanel";
import { SlidePanel } from "./SlidePanel";
import { TablePanel } from "./TablePanel";
import { TextArtPanel } from "./TextArtPanel";

const BUTTONS: Array<{ action: RightMenuPanel; title: string; icon: string }> =
	[
		{ action: "paragraph", title: "Paragraph", icon: "Type" },
		{ action: "table", title: "Table", icon: "Table2" },
		{ action: "image", title: "Image", icon: "Image" },
		{ action: "slide", title: "Slide", icon: "FileText" },
		{ action: "chart", title: "Chart", icon: "BarChart3" },
		{ action: "shape", title: "Shape", icon: "Shapes" },
		{ action: "textart", title: "TextArt", icon: "Type" },
		{ action: "animation", title: "Animation Pane", icon: "Play" },
	];

const PANELS: Record<RightMenuPanel, JSX.Element> = {
	paragraph: <ParagraphPanel visible={true} />,
	table: <TablePanel visible={true} />,
	image: <ImagePanel visible={true} />,
	slide: <SlidePanel />,
	chart: <ChartPanel visible={true} />,
	shape: <ShapePanel />,
	textart: <TextArtPanel visible={true} />,
	animation: <AnimationPanel />,
};

/**
 * Convert a capitalized property name back to camelCase.
 */
function toCamelCase(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Extract property name from shapeSet* command.
 */
function getPropNameFromCommand(command: string): string {
	const withoutPrefix = command.replace(/^shapeSet/, "");
	return toCamelCase(withoutPrefix);
}

/**
 * Handle slide commands dispatched from right-menu panels.
 * Translates commands to presentation store mutations.
 * These commands will eventually be routed to apply_op in SL-6 WASM.
 */
function handleSlideCommand(cmd: WoCommand): void {
	const { command, value } = cmd;

	// Shape commands: shapeSet*
	if (command.startsWith("shapeSet")) {
		if (typeof value !== "object" || value === null) {
			console.warn(
				`Invalid value for shape command ${command}: expected object, got ${typeof value}`,
			);
			return;
		}

		const valueObj = value as Record<string, unknown>;
		const { shapeId, slideIndex, ...updates } = valueObj;

		if (!shapeId) {
			console.warn(`Missing shapeId for command ${command}`);
			return;
		}

		const targetSlideIndex =
			typeof slideIndex === "number"
				? slideIndex
				: presentationStore.currentSlide;
		const propName = getPropNameFromCommand(command);

		const update: Record<string, unknown> = {};
		for (const key of Object.keys(updates)) {
			update[toCamelCase(key)] = updates[key];
		}

		if (Object.keys(update).length === 0 && "value" in valueObj) {
			update[propName] = valueObj.value;
		}

		if (Object.keys(update).length > 0) {
			presentationStore.updateShape(
				targetSlideIndex,
				shapeId as string,
				update,
			);
		}
		return;
	}

	// Shape delete
	if (command === "shapeDelete") {
		if (typeof value !== "object" || value === null) {
			console.warn("Invalid value for shapeDelete: expected object");
			return;
		}

		const { shapeId, slideIndex } = value as Record<string, unknown>;

		if (!shapeId || typeof shapeId !== "string") {
			console.warn("Missing or invalid shapeId for shapeDelete");
			return;
		}

		const targetSlideIndex =
			typeof slideIndex === "number"
				? slideIndex
				: presentationStore.currentSlide;

		presentationStore.removeShape(targetSlideIndex, shapeId);
		presentationStore.deselectShape();
		return;
	}

	// Slide commands
	if (command === "slideSetLayout") {
		if (typeof value !== "object" || value === null) {
			console.warn(
				"Invalid value for slideSetLayout: expected object with layout property",
			);
			return;
		}

		const { slideIndex, layout } = value as {
			slideIndex?: number;
			layout?: SlideLayout;
		};

		if (!layout) {
			console.warn("Missing layout for slideSetLayout");
			return;
		}

		const targetSlideIndex =
			typeof slideIndex === "number"
				? slideIndex
				: presentationStore.currentSlide;
		presentationStore.setSlideLayout(targetSlideIndex, layout);
		return;
	}

	if (command === "slideSetNotes") {
		if (typeof value !== "object" || value === null) {
			console.warn(
				"Invalid value for slideSetNotes: expected object with notes property",
			);
			return;
		}

		const { slideIndex, notes } = value as {
			slideIndex?: number;
			notes?: string;
		};

		if (!notes) {
			console.warn("Missing notes for slideSetNotes");
			return;
		}

		const targetSlideIndex =
			typeof slideIndex === "number"
				? slideIndex
				: presentationStore.currentSlide;
		presentationStore.setSlideNotes(targetSlideIndex, notes);
		return;
	}

	// Animation commands
	if (command === "animationRemove") {
		if (typeof value !== "object" || value === null) {
			console.warn(
				"Invalid value for animationRemove: expected object with animId property",
			);
			return;
		}

		const { slideIndex, animId } = value as {
			slideIndex?: number;
			animId?: string;
		};

		if (!animId) {
			console.warn("Missing animId for animationRemove");
			return;
		}

		const targetSlideIndex =
			typeof slideIndex === "number"
				? slideIndex
				: presentationStore.currentSlide;
		presentationStore.removeAnimation(targetSlideIndex, animId);
		return;
	}

	if (command === "animationMoveEarlier" || command === "animationMoveLater") {
		if (typeof value !== "object" || value === null) {
			console.warn(
				`Invalid value for ${command}: expected object with index property`,
			);
			return;
		}

		const { slideIndex, index } = value as {
			slideIndex?: number;
			index?: number;
		};

		if (typeof index !== "number") {
			console.warn(`Missing or invalid index for ${command}`);
			return;
		}

		const targetSlideIndex =
			typeof slideIndex === "number"
				? slideIndex
				: presentationStore.currentSlide;

		if (command === "animationMoveEarlier") {
			presentationStore.moveAnimationEarlier(targetSlideIndex, index);
		} else {
			presentationStore.moveAnimationLater(targetSlideIndex, index);
		}
		return;
	}

	// Paragraph, Table, Image, Chart, TextArt commands - passthrough for now
	// These will be handled by apply_op once SL-6 is fully integrated
	console.debug(`[Slide Command Router] Passthrough: ${command}`, value);
}

function RightMenuInner(): JSX.Element {
	const { t } = useTranslation();
	const { activeRightPanel, toggleRightPanel } = presentationStore;

	// Register slide command router with all 8 right-menu panel commands
	useEffect(() => {
		const SLIDE_COMMANDS = [
			// Paragraph commands
			"paraAlign",
			"paraSpaceBefore",
			"paraSpaceAfter",
			"paraLineSpacing",
			"paraBullets",
			// Table commands
			"addRowBefore",
			"addRowAfter",
			"addColumnBefore",
			"addColumnAfter",
			"deleteRow",
			"deleteColumn",
			"tableStyle",
			"tableShading",
			// Image commands
			"imageWidth",
			"imageHeight",
			"imageLockAspect",
			"imageX",
			"imageY",
			"imageRotation",
			// Chart commands
			"chartType",
			"chartStyle",
			"chartShowLegend",
			"chartShowDataLabels",
			// TextArt commands
			"textartFill",
			"textartFillType",
			"textartTransform",
			"textartShadow",
			"textartGlow",
			// Shape commands
			"shapeSetX",
			"shapeSetY",
			"shapeSetWidth",
			"shapeSetHeight",
			"shapeSetRotation",
			"shapeSetZIndex",
			"shapeSetFillColor",
			"shapeSetStrokeColor",
			"shapeSetStrokeWidth",
			"shapeSetFontSize",
			"shapeSetFontColor",
			"shapeSetText",
			"shapeDelete",
			// Slide commands
			"slideSetLayout",
			"slideSetNotes",
			// Animation commands
			"animationRemove",
			"animationMoveEarlier",
			"animationMoveLater",
		];

		const unregister = registerEditorRouter(
			"slide",
			handleSlideCommand,
			SLIDE_COMMANDS,
		);

		return () => {
			unregister();
		};
	}, []);

	return (
		<div
			className="prese-right-menu"
			role="menubar"
			aria-orientation="vertical"
			aria-label="Right menu"
		>
			<div className="prese-right-menu-btns">
				{BUTTONS.map(({ action, title, icon }) => (
					<RightMenuButton
						key={action}
						action={action}
						title={t(title)}
						icon={icon}
						active={activeRightPanel === action}
						onClick={() => toggleRightPanel(action)}
					/>
				))}
			</div>
			<div className="prese-right-panel-side">
				{activeRightPanel && PANELS[activeRightPanel]}
			</div>
		</div>
	);
}

export const RightMenu = observer(RightMenuInner);
