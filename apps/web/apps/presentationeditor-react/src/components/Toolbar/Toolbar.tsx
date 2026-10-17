import { Ribbon, presentationRibbonSpec } from "@world-office/editor-common";
import type {
	RibbonCommandDispatch,
	RibbonContext,
} from "@world-office/editor-common";
import { detectWopiParams } from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
import { translateRibbonControlCommand } from "../../lib/presentation-commands";
import { presentationStore } from "../../stores/PresentationStore";
import { FileTab } from "./FileTab";
import type { MonacoCommand } from "./MonacoCommand";

interface ToolbarProps {
	onMonacoCommand: (command: MonacoCommand) => void;
}

const ObservedToolbar = observer(function ObservedToolbar({
	onMonacoCommand,
}: ToolbarProps) {
	const wopi = detectWopiParams();

	const context: RibbonContext = {
		isEditMode: presentationStore.isEditMode,
		isModified: presentationStore.isModified ?? false,
		isSaving: presentationStore.isSaving ?? false,
		canEdit: presentationStore.isEditMode,
		activeTab: "",
		isWopi: !!wopi,
		connectionStatus: "connected",
		userCount: 0,
		fileName: presentationStore.document?.title ?? "",
	};

	const dispatch: RibbonCommandDispatch = {
		// Text formatting flows through onCommand → the store router below;
		// keeping this a no-op avoids dispatching every click twice (toggles
		// would cancel themselves out).
		onRichTextCommand: () => {},
		onMonacoCommand: (command: string) => {
			onMonacoCommand(command as MonacoCommand);
		},
		onCommand: (command: string, value?: string) => {
			switch (command) {
				case "addSlide":
					presentationStore.addSlide();
					break;
				case "goToFirstSlide":
					presentationStore.setCurrentSlide(0);
					break;
				case "goToPrevSlide":
					presentationStore.setCurrentSlide(
						Math.max(0, presentationStore.currentSlide - 1),
					);
					break;
				case "goToNextSlide":
					presentationStore.setCurrentSlide(
						Math.min(
							presentationStore.totalSlides - 1,
							presentationStore.currentSlide + 1,
						),
					);
					break;
				case "goToLastSlide":
					presentationStore.setCurrentSlide(presentationStore.totalSlides - 1);
					break;
				default: {
					// Select controls fire onCommand with their CONTROL id after
					// their own onChange — translate to the real command so this
					// redundant dispatch reaches a handler too.
					const translated = translateRibbonControlCommand(command, value);
					const payload = translated ?? { command, value };
					window.dispatchEvent(
						new CustomEvent("wo-command", {
							detail: { command: payload.command, value: payload.value },
						}),
					);
				}
			}
		},
	};

	return (
		<Ribbon
			spec={presentationRibbonSpec}
			context={context}
			dispatch={dispatch}
			beforeTabs={<FileTab />}
		/>
	);
});

export { ObservedToolbar as Toolbar };
