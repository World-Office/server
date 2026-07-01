import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { spreadsheetStore } from "../stores/SpreadsheetStore";
import { MonacoEditor } from "./MonacoEditor";

const SAVE_DEBOUNCE_MS = 1500;

function languageForFile(name: string): string {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	if (ext === "csv" || ext === "tsv") return "plaintext";
	if (ext === "json") return "json";
	// .xlsx, .ods, .fods are zipped XML; surface as xml for Monaco syntax highlighting
	return "xml";
}

async function blobToText(blob: Blob): Promise<string> {
	return await blob.text();
}

export const DocumentHolder = observer(function DocumentHolder() {
	const [value, setValue] = useState<string>("");
	const lastBlobRef = useRef<Blob | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const initializedRef = useRef(false);

	useEffect(() => {
		if (initializedRef.current) return;
		initializedRef.current = true;
		void spreadsheetStore.detectAndLoadWopi();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger when the WOPI-loaded blob changes so we re-render the editor
	useEffect(() => {
		const blob = spreadsheetStore.lastLoadedContent;
		if (!blob || blob === lastBlobRef.current) return;
		lastBlobRef.current = blob;
		void blobToText(blob).then(setValue);
	}, [spreadsheetStore.lastLoadedContent]);

	useEffect(
		() => () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		},
		[],
	);

	const handleChange = (next: string) => {
		setValue(next);
		spreadsheetStore.isModified = true;
		if (!spreadsheetStore.wopiConnection) return;
		if (
			spreadsheetStore.wopiFileInfo &&
			!spreadsheetStore.wopiFileInfo.UserCanWrite
		)
			return;
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			void spreadsheetStore.saveToWopi();
		}, SAVE_DEBOUNCE_MS);
	};

	if (spreadsheetStore.isLoadingError) {
		return (
			<div className="se-document-holder se-document-holder--error">
				<p>Failed to load spreadsheet: {spreadsheetStore.isLoadingError}</p>
				<button
					type="button"
					onClick={() => void spreadsheetStore.detectAndLoadWopi()}
				>
					Retry
				</button>
			</div>
		);
	}

	if (!spreadsheetStore.isDocReady) {
		return (
			<div className="se-document-holder se-document-holder--loading">
				<p>Loading spreadsheet...</p>
			</div>
		);
	}

	return (
		<div
			className="se-document-holder"
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				overflow: "hidden",
				height: "100%",
				backgroundColor: "#e8e8e8",
			}}
		>
			<MonacoEditor
				value={value}
				onChange={handleChange}
				language={languageForFile(
					spreadsheetStore.wopiFileInfo?.BaseFileName ?? "",
				)}
				readOnly={
					spreadsheetStore.wopiFileInfo
						? !spreadsheetStore.wopiFileInfo.UserCanWrite
						: false
				}
				editorType="spreadsheet"
			/>
		</div>
	);
});
