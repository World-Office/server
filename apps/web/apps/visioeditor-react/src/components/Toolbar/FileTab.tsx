import { File } from "lucide-react";
import { observer } from "mobx-react-lite";
import type { JSX } from "react";
import { visioStore } from "../../stores/VisioStore";

// FileTab reads visioStore.isFileMenuOpen to paint its own active state — the
// observer keeps the tab in sync with the File-menu panel it toggles.
const FileTabInner = observer(function FileTab(): JSX.Element {
	const isActive = visioStore.isFileMenuOpen;

	function handleClick(): void {
		if (isActive) {
			visioStore.setFileMenuOpen(false);
		} else {
			visioStore.setActiveTab("file");
		}
	}

	return (
		<button
			type="button"
			className={`visio-toolbar-tab${isActive ? " active" : ""}`}
			data-tab="file"
			onClick={handleClick}
			aria-label="File"
			aria-expanded={isActive}
		>
			<File size={14} />
			File
		</button>
	);
});

export const FileTab = FileTabInner;
