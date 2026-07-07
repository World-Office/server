import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { presentationStore } from "../stores/PresentationStore";
import { MonacoEditor } from "./MonacoEditor";
import { SlideCanvas } from "./SlideCanvas/SlideCanvas";
import { SlideTextEditor } from "./SlideTextEditor";

type ViewMode = "canvas" | "text" | "source";

const SAVE_DEBOUNCE_MS = 1500;

export const DocumentHolder = observer(function DocumentHolder() {
	const [value, setValue] = useState<string>("");
	const [viewMode, setViewMode] = useState<ViewMode>("source");
	const lastSerializedRef = useRef<string | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const initializedRef = useRef(false);

	useEffect(() => {
		if (initializedRef.current) return;
		initializedRef.current = true;
		void presentationStore.loadFromWopi();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-serialize whenever the structured presentation document changes
	useEffect(() => {
		let next = "";
		try {
			next = JSON.stringify(presentationStore.document ?? {}, null, 2);
		} catch {
			next = "";
		}
		if (next === lastSerializedRef.current) return;
		lastSerializedRef.current = next;
		setValue(next);
	}, [presentationStore.document]);

	const hasCanvas = presentationStore.slides.length > 0;
	const hasHtml = presentationStore.convertedHtml !== null;

	const effectiveViewMode: ViewMode =
		viewMode === "source" && hasHtml
			? "text"
			: viewMode === "source" && hasCanvas
				? "canvas"
				: viewMode;

	useEffect(
		() => () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		},
		[],
	);

	const handleChange = (next: string) => {
		setValue(next);
		try {
			const parsed = JSON.parse(next);
			presentationStore.fromJSON(JSON.stringify(parsed));
		} catch {
			// ignore partial / invalid JSON; user can keep typing
		}
		presentationStore.isModified = true;
		if (!presentationStore.wopiFileId || !presentationStore.wopiAccessToken)
			return;
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			void presentationStore.saveToWopi();
		}, SAVE_DEBOUNCE_MS);
	};

	if (presentationStore.isLoadingError) {
		return (
			<div className="prese-document-holder prese-document-holder--error">
				<p>Failed to load presentation: {presentationStore.isLoadingError}</p>
				<button
					type="button"
					onClick={() => void presentationStore.loadFromWopi()}
				>
					Retry
				</button>
			</div>
		);
	}

	if (!presentationStore.isDocReady) {
		return (
			<div className="prese-document-holder prese-document-holder--loading">
				<p>Loading presentation...</p>
			</div>
		);
	}

	return (
		<div
			className="prese-document-holder"
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				overflow: "hidden",
				height: "100%",
				backgroundColor: "#e8e8e8",
			}}
		>
			<div
				style={{
					display: "flex",
					gap: 4,
					padding: "4px 8px",
					backgroundColor: "#f5f5f5",
					borderBottom: "1px solid #ccc",
				}}
			>
				{hasCanvas && (
					<button
						type="button"
						onClick={() => setViewMode("canvas")}
						style={{
							padding: "4px 12px",
							fontWeight: effectiveViewMode === "canvas" ? 700 : 400,
							backgroundColor:
								effectiveViewMode === "canvas" ? "#fff" : "transparent",
							border: "1px solid #ccc",
							borderRadius: 4,
							cursor: "pointer",
						}}
					>
						Canvas View
					</button>
				)}
				{hasHtml && (
					<button
						type="button"
						onClick={() => setViewMode("text")}
						style={{
							padding: "4px 12px",
							fontWeight: effectiveViewMode === "text" ? 700 : 400,
							backgroundColor:
								effectiveViewMode === "text" ? "#fff" : "transparent",
							border: "1px solid #ccc",
							borderRadius: 4,
							cursor: "pointer",
						}}
					>
						Text Edit
					</button>
				)}
				<button
					type="button"
					onClick={() => setViewMode("source")}
					style={{
						padding: "4px 12px",
						fontWeight: effectiveViewMode === "source" ? 700 : 400,
						backgroundColor:
							effectiveViewMode === "source" ? "#fff" : "transparent",
						border: "1px solid #ccc",
						borderRadius: 4,
						cursor: "pointer",
					}}
				>
					Source
				</button>
			</div>

			{effectiveViewMode === "canvas" && hasCanvas && (
				<div style={{ flex: 1, overflow: "auto" }}>
					<SlideCanvas />
				</div>
			)}
			{effectiveViewMode === "text" && hasHtml && (
				<div style={{ flex: 1, overflow: "auto" }}>
					<SlideTextEditor
						value={presentationStore.convertedHtml ?? ""}
						onChange={(html) => {
							presentationStore.convertedHtml = html;
						}}
					/>
				</div>
			)}
			{effectiveViewMode === "source" && (
				<MonacoEditor
					value={value}
					onChange={handleChange}
					language="json"
					readOnly={false}
					editorType="presentation"
				/>
			)}
		</div>
	);
});
