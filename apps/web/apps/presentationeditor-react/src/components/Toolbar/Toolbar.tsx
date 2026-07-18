import { Ribbon, presentationRibbonSpec } from "@world-office/editor-common";
import type {
	RibbonCommandDispatch,
	RibbonContext,
} from "@world-office/editor-common";
import { detectWopiParams } from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
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
		onRichTextCommand: () => {},
		onMonacoCommand: (command: string) => {
			onMonacoCommand(command as MonacoCommand);
		},
		onCommand: (command: string) => {
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
				default:
					window.dispatchEvent(
						new CustomEvent("wo-command", { detail: { command } }),
					);
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
