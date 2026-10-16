import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { presentationStore } from "../../../stores/PresentationStore";

/**
 * File → Rename... — a dialog-declaring File-menu entry that had no surface of
 * its own (the click just closed the menu). Edits the document title
 * (extension kept); the new name drives Document Info and every export /
 * download file name. The WOPI host has no rename endpoint, so the change is
 * local to the editor session.
 */
export function RenamePanel({ visible }: { visible: boolean }) {
	const { t } = useTranslation();
	const inputRef = useRef<HTMLInputElement>(null);

	// current title split into base name + extension (".pptx" when none)
	const title = presentationStore.document?.title ?? "";
	const match = title.match(/^(.*?)(\.[^.]+)$/);
	const baseName = match ? match[1] : title || "Untitled";
	const extension = match ? match[2] : ".pptx";

	const [name, setName] = useState(baseName);

	// re-seed the input whenever the pane is (re)opened or the document changes
	useEffect(() => {
		if (!visible) return;
		setName(baseName);
		const id = window.setTimeout(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		}, 50);
		return () => window.clearTimeout(id);
	}, [visible, baseName]);

	function handleRename(): void {
		const clean = name.trim();
		if (!clean) return;
		presentationStore.renameDocument(`${clean}${extension}`);
		handleClose();
	}

	function handleClose(): void {
		presentationStore.setActiveFileMenuPanel(null);
		presentationStore.setFileMenuOpen(false);
	}

	function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
		if (event.key === "Enter") {
			event.preventDefault();
			handleRename();
		} else if (event.key === "Escape") {
			event.preventDefault();
			handleClose();
		}
	}

	const canRename = name.trim().length > 0;

	return (
		<div
			className="prese-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="prese-file-menu-header">{t("Rename")}</div>
			<div className="prese-file-menu-body">
				<p className="prese-file-menu-instruction">
					Enter a new name for the presentation. The file extension is kept.
				</p>
			</div>
			<div className="prese-file-menu-rename-row">
				<input
					ref={inputRef}
					type="text"
					className="prese-file-menu-rename-input"
					aria-label={t("File name")}
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={handleKeyDown}
					spellCheck={false}
				/>
				<span className="prese-file-menu-rename-ext">{extension}</span>
			</div>
			<div className="prese-file-menu-footer">
				<button
					type="button"
					className="prese-file-menu-primary-btn"
					disabled={!canRename}
					onClick={handleRename}
				>
					{t("Save")}
				</button>
				<button type="button" onClick={handleClose}>
					{t("Cancel")}
				</button>
			</div>
		</div>
	);
}
