import { File } from "lucide-react";
import { observer } from "mobx-react-lite";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";

const ObservedFileTab = observer(function ObservedFileTab() {
	const isActive = spreadsheetStore.isFileMenuOpen;

	function handleClick() {
		if (isActive) {
			spreadsheetStore.setFileMenuOpen(false);
		} else {
			spreadsheetStore.setActiveTab("file");
		}
	}

	return (
		<button
			type="button"
			className={`se-toolbar-tab${isActive ? " active" : ""}`}
			data-tab="file"
			onClick={handleClick}
			aria-label="File"
		>
			<File size={14} />
			<span>File</span>
		</button>
	);
});

export { ObservedFileTab as FileTab };
