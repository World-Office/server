import { File } from "lucide-react";
import type { JSX } from "react";
import { visioStore } from "../../stores/VisioStore";

export function FileTab(): JSX.Element {
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
		>
			<File size={14} />
			File
		</button>
	);
}
