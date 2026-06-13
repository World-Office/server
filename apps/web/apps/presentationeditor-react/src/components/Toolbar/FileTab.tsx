import { observer } from "mobx-react-lite";
import { presentationStore } from "../../stores/PresentationStore";

const ObservedFileTab = observer(function ObservedFileTab() {
	const isActive = presentationStore.isFileMenuOpen;

	function handleClick() {
		if (isActive) {
			presentationStore.setFileMenuOpen(false);
		} else {
			presentationStore.setActiveTab("file");
		}
	}

	return (
		<button
			type="button"
			className={`prese-toolbar-tab${isActive ? " active" : ""}`}
			data-tab="file"
			onClick={handleClick}
			aria-label="File"
		>
			File
		</button>
	);
});

export { ObservedFileTab as FileTab };
