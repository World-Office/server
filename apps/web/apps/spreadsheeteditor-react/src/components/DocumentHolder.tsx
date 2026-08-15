import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { spreadsheetStore } from "../stores/SpreadsheetStore";
import { MonacoEditor } from "./MonacoEditor";
import { SpreadsheetGrid } from "./SpreadsheetGrid";

const SAVE_DEBOUNCE_MS = 1500;

function languageForFile(name: string): string {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	if (ext === "csv" || ext === "tsv") return "plaintext";
	if (ext === "json") return "json";
	return "xml";
}

async function blobToText(blob: Blob): Promise<string> {
	return await blob.text();
}

function isSpreadsheetFile(name: string): boolean {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	return ["xlsx", "ods", "fods", "csv", "tsv"].includes(ext);
}

export const DocumentHolder = observer(function DocumentHolder() {
	const [value, setValue] = useState<string>("");
	const [spreadsheetData, setSpreadsheetData] = useState<ArrayBuffer | null>(
		null,
	);
	const [viewMode, setViewMode] = useState<"grid" | "source">("grid");
	const lastBlobRef = useRef<Blob | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Document loading is handled by useDocumentLoader in App.tsx — calling
	// detectAndLoadWopi() here as well caused an infinite remount loop:
	// loading → App hides DocumentHolder → unmount → mount → load again…

	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger on WOPI blob changes
	useEffect(() => {
		const blob = spreadsheetStore.lastLoadedContent;
		if (!blob || blob === lastBlobRef.current) return;
		lastBlobRef.current = blob;

		const fileName = spreadsheetStore.wopiFileInfo?.BaseFileName ?? "";

		if (isSpreadsheetFile(fileName)) {
			blob
				.arrayBuffer()
				.then((buf) => {
					setSpreadsheetData(buf);
				})
				.catch(() => {
					void blobToText(blob).then(setValue);
				});
		} else {
			void blobToText(blob).then(setValue);
		}
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

	const fileName = spreadsheetStore.wopiFileInfo?.BaseFileName ?? "";
	const isGrid = isSpreadsheetFile(fileName);

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
			{isGrid && (
				<div
					style={{
						display: "flex",
						gap: 4,
						padding: "4px 8px",
						backgroundColor: "#f5f5f5",
						borderBottom: "1px solid #ccc",
					}}
				>
					<button
						type="button"
						onClick={() => setViewMode("grid")}
						style={{
							padding: "4px 12px",
							fontWeight: viewMode === "grid" ? 700 : 400,
							backgroundColor: viewMode === "grid" ? "#fff" : "transparent",
							border: "1px solid #ccc",
							borderRadius: 4,
							cursor: "pointer",
						}}
					>
						Grid View
					</button>
					<button
						type="button"
						onClick={() => setViewMode("source")}
						style={{
							padding: "4px 12px",
							fontWeight: viewMode === "source" ? 700 : 400,
							backgroundColor: viewMode === "source" ? "#fff" : "transparent",
							border: "1px solid #ccc",
							borderRadius: 4,
							cursor: "pointer",
						}}
					>
						Source
					</button>
				</div>
			)}
			{viewMode === "grid" && isGrid && spreadsheetData ? (
				<div style={{ flex: 1, overflow: "hidden" }}>
					<SpreadsheetGrid data={spreadsheetData} />
				</div>
			) : (
				<MonacoEditor
					value={value}
					onChange={handleChange}
					language={languageForFile(fileName)}
					readOnly={
						spreadsheetStore.wopiFileInfo
							? !spreadsheetStore.wopiFileInfo.UserCanWrite
							: false
					}
					editorType="spreadsheet"
				/>
			)}
		</div>
	);
});
