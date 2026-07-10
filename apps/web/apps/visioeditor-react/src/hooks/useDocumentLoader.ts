import { useEffect, useRef } from "react";
import { flowchartStore } from "../stores/FlowchartStore";
import { visioStore } from "../stores/VisioStore";

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * Initialize the editor from WOPI URL params or fall back to standalone dev mode.
 * Returns the current load state so the UI can show loading indicators.
 */
export function useDocumentLoader(): LoadState {
	const loadedRef = useRef(false);

	useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		const hasWopi = visioStore.detectWopiParams();

		if (hasWopi) {
			visioStore.loadFromWopi().catch(() => {
				// error state is set inside loadFromWopi
			});
		} else {
			// Standalone dev mode: populate with a demo flowchart
			visioStore.isDocReady = true;
			const demo = flowchartStore;
			if (demo.document.nodes.length === 0) {
				demo.addNode("process", 200, 100, "MVP Ready");
				demo.addNode("decision", 450, 80, "Ship now?");
				demo.addNode("start-end", 450, 280, "Deploy");
				demo.addNode("input-output", 50, 250, "OpenCloud");
				demo.addEdge(demo.document.nodes[0]?.id, demo.document.nodes[1]?.id);
				demo.addEdge(demo.document.nodes[1]?.id, demo.document.nodes[2]?.id);
				demo.addEdge(demo.document.nodes[0]?.id, demo.document.nodes[3]?.id);
				demo.autoLayout();
				demo.history = [];
				demo.future = [];
			}
			visioStore.document = {
				title: "Flowchart",
				fileType: "vsdx",
				info: { sheetCount: 1, width: 1200, height: 800 },
			};
			visioStore.setEditorMode("flowchart");
			visioStore.isModified = false;
		}
	}, []);

	if (visioStore.isLoading) return "loading";
	if (visioStore.isLoadingError) return "error";
	if (visioStore.isDocReady) return "ready";
	return "idle";
}
