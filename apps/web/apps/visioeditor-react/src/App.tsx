import { ThemeProvider } from "@world-office/design-system";
import { useWoCommandListener } from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
import { Suspense, lazy, useCallback, useEffect, useRef } from "react";
import { getActiveEditor } from "./components/MonacoEditor";
import {
	type MonacoCommand,
	dispatchMonacoCommand,
} from "./components/Toolbar/MonacoCommand";
import { Viewport } from "./components/Viewport";
import { useDocumentLoader } from "./hooks/useDocumentLoader";
import { useEmbeddedAutoSave } from "./hooks/useEmbeddedAutoSave";
import { useEmbeddedBridge } from "./hooks/useEmbeddedBridge";
import { useEmbeddedMode } from "./hooks/useEmbeddedMode";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { isCollaborationConfigured } from "./lib/collaboration-config";
import { flowchartStore } from "./stores/FlowchartStore";
import { visioStore } from "./stores/VisioStore";

const VisioCollaborationProvider = lazy(() =>
	import("./components/VisioCollaborationProvider").then((m) => ({
		default: m.VisioCollaborationProvider,
	})),
);

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

export const App = observer(function App() {
	const loadState = useDocumentLoader();
	// Trigger keyboard shortcut registration after mount
	useKeyboardShortcuts();

	const { embedded } = useEmbeddedMode(
		visioStore.setToolbarVisible.bind(visioStore),
		visioStore.setStatusbarVisible.bind(visioStore),
		visioStore.setLeftMenuVisible.bind(visioStore),
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		() => {},
	);

	const bridge = useEmbeddedBridge({
		embedded,
		onSave: async () => {
			await visioStore.saveToWopi();
		},
	});

	useEmbeddedAutoSave(
		embedded,
		visioStore.wopiConnection,
		visioStore.isModified,
		() => Promise.resolve(visioStore.buildDocumentBlob()),
		bridge.notifyDocumentSaved,
		bridge.notifyError,
		undefined,
		() => {
			visioStore.isModified = false;
		},
	);

	const handleMonacoCommand = useCallback((command: MonacoCommand) => {
		dispatchMonacoCommand(command, getActiveEditor());
	}, []);

	useWoCommandListener({
		onCommand: (command, _value) => {
			handleMonacoCommand(command as MonacoCommand);
		},
		onSave: () => visioStore.save(),
		onDownload: () => visioStore.exportAsDownload(),
	});

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
		flowchartStore.updateNode = ((...args: Parameters<typeof origUpdate>) => {
			origUpdate(...args);
			mark();
		}) as typeof flowchartStore.updateNode;
		flowchartStore.moveNode = ((...args: Parameters<typeof origMove>) => {
			origMove(...args);
			mark();
		}) as typeof flowchartStore.moveNode;

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
			{isCollaborationConfigured() && (
				<Suspense fallback={null}>
					<VisioCollaborationProvider />
				</Suspense>
			)}
			<Viewport
				toolbarVisible={visioStore.toolbarVisible}
				statusbarVisible={visioStore.statusbarVisible}
				leftMenuVisible={visioStore.leftMenuVisible}
				isCompactToolbar={visioStore.isCompactToolbar}
				onMonacoCommand={handleMonacoCommand}
			/>
		</ThemeProvider>
	);
});
