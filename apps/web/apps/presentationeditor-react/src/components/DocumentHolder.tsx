import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { presentationStore } from "../stores/PresentationStore";
import { MonacoEditor } from "./MonacoEditor";

const SAVE_DEBOUNCE_MS = 1500;

export const DocumentHolder = observer(function DocumentHolder() {
	const [value, setValue] = useState<string>("");
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
			<MonacoEditor
				value={value}
				onChange={handleChange}
				language="json"
				readOnly={false}
				editorType="presentation"
			/>
		</div>
	);
});
