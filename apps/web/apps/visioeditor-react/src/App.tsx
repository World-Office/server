import { ThemeProvider } from "@world-office/design-system";
import { useCallback, useEffect, useRef } from "react";
import { getActiveEditor } from "./components/MonacoEditor";
import {
	type MonacoCommand,
	dispatchMonacoCommand,
} from "./components/Toolbar/MonacoCommand";
import { Viewport } from "./components/Viewport";
import { useDocumentLoader } from "./hooks/useDocumentLoader";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { flowchartStore } from "./stores/FlowchartStore";
import { visioStore } from "./stores/VisioStore";

function LoadingScreen(): React.JSX.Element {
	return (
		<div className="visio-loading">
			<div className="visio-loading-spinner" />
			<p>Loading document...</p>
		</div>
	);
}

function ErrorScreen(): React.JSX.Element {
	return (
		<div className="visio-loading visio-loading-error">
			<p className="visio-loading-error-text">
				{visioStore.isLoadingError || "Failed to load document"}
			</p>
			<button
				type="button"
				className="visio-loading-retry"
				onClick={() => visioStore.loadFromWopi()}
			>
				Retry
			</button>
		</div>
	);
}

export function App() {
	const loadState = useDocumentLoader();
	// Trigger keyboard shortcut registration after mount
	useKeyboardShortcuts();

	const handleMonacoCommand = useCallback((command: MonacoCommand) => {
		dispatchMonacoCommand(command, getActiveEditor());
	}, []);

	// Track document modifications so VisioStore.isModified stays in sync
	const cleanupRef = useRef<(() => void) | null>(null);
	useEffect(() => {
		const origAdd = flowchartStore.addNode.bind(flowchartStore);
		const origRemove = flowchartStore.removeNode.bind(flowchartStore);
		const origUpdate = flowchartStore.updateNode.bind(flowchartStore);
		const origMove = flowchartStore.moveNode.bind(flowchartStore);

		// After any flowchart action, mark the document modified
		const mark = () => visioStore.markModified();
		flowchartStore.addNode = ((...args: Parameters<typeof origAdd>) => {
			const result = origAdd(...args);
			mark();
			return result;
		}) as typeof flowchartStore.addNode;
		flowchartStore.removeNode = ((...args: Parameters<typeof origRemove>) => {
			origRemove(...args);
			mark();
		}) as typeof flowchartStore.removeNode;

		cleanupRef.current = () => {
			flowchartStore.addNode = origAdd;
			flowchartStore.removeNode = origRemove;
			flowchartStore.updateNode = origUpdate;
			flowchartStore.moveNode = origMove;
		};
		return () => cleanupRef.current?.();
	}, []);

	if (loadState === "loading") return <LoadingScreen />;
	if (loadState === "error") return <ErrorScreen />;

	return (
		<ThemeProvider>
			<Viewport
				toolbarVisible={visioStore.toolbarVisible}
				statusbarVisible={visioStore.statusbarVisible}
				leftMenuVisible={visioStore.leftMenuVisible}
				isCompactToolbar={visioStore.isCompactToolbar}
				onMonacoCommand={handleMonacoCommand}
			/>
		</ThemeProvider>
	);
}
