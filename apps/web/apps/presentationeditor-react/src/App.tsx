import { ThemeProvider } from "@world-office/design-system";
import {
	useDocumentLoader,
	useWoCommandListener,
} from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
import { type JSX, Suspense, lazy, useCallback } from "react";
import { getActiveEditor } from "./components/MonacoEditor";
import { SlidePresenter } from "./components/SlidePresenter/SlidePresenter";
import {
	type MonacoCommand,
	dispatchMonacoCommand,
} from "./components/Toolbar/MonacoCommand";
import { Viewport } from "./components/Viewport";
import { useEmbeddedAutoSave } from "./hooks/useEmbeddedAutoSave";
import { useEmbeddedBridge } from "./hooks/useEmbeddedBridge";
import { useEmbeddedMode } from "./hooks/useEmbeddedMode";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTheme } from "./hooks/useTheme";
import { isCollaborationConfigured } from "./lib/collaboration-config";
import { presentationStore } from "./stores/PresentationStore";

const PresentationCollaborationProvider = lazy(() =>
	import("./components/PresentationCollaborationProvider").then((m) => ({
		default: m.PresentationCollaborationProvider,
	})),
);

function onLoad(): Promise<void> {
	const hasWopi = presentationStore.detectWopiParams();
	if (hasWopi) {
		return presentationStore.loadFromWopi();
	}
	presentationStore.document = {
		title: "Untitled Presentation",
		fileType: "pptx",
		info: {},
	};
	presentationStore.isDocReady = true;
	return Promise.resolve();
}

export const App = observer(function App(): JSX.Element {
	useKeyboardShortcuts();
	useTheme();

	const { embedded } = useEmbeddedMode(
		presentationStore.setToolbarVisible.bind(presentationStore),
		presentationStore.setStatusbarVisible.bind(presentationStore),
		presentationStore.setLeftMenuVisible.bind(presentationStore),
		presentationStore.setRightMenuVisible.bind(presentationStore),
	);

	const bridge = useEmbeddedBridge({
		embedded,
		onSave: async () => {
			await presentationStore.saveToWopi();
		},
	});

	useEmbeddedAutoSave(
		embedded,
		presentationStore.wopiConnection,
		presentationStore.isModified,
		() => presentationStore.buildDocumentBlob(),
		bridge.notifyDocumentSaved,
		bridge.notifyError,
		undefined,
		() => {
			presentationStore.isModified = false;
		},
	);

	const handleMonacoCommand = useCallback((command: MonacoCommand) => {
		dispatchMonacoCommand(command, getActiveEditor());
	}, []);

	useWoCommandListener({
		onCommand: (command, _value) => {
			handleMonacoCommand(command as MonacoCommand);
		},
		onSave: () => presentationStore.saveToWopi(),
		onDownload: () => presentationStore.exportAsDownload(),
	});
	const loadState = useDocumentLoader({
		onLoad,
		isLoading: presentationStore.isLoading,
		isError: presentationStore.isLoadingError !== null,
		isReady: presentationStore.isDocReady,
	});

	if (loadState === "loading") {
		return <div className="prese-loading">Loading presentation…</div>;
	}
	if (loadState === "error") {
		return (
			<div className="prese-loading">
				<p>Failed to load document: {presentationStore.isLoadingError}</p>
				<button onClick={() => window.location.reload()} type="button">
					Retry
				</button>
			</div>
		);
	}

	return (
		<ThemeProvider>
			{isCollaborationConfigured() && (
				<Suspense fallback={null}>
					<PresentationCollaborationProvider />
				</Suspense>
			)}
			{presentationStore.isPresenting && <SlidePresenter />}
			<Viewport
				toolbarVisible={presentationStore.toolbarVisible}
				statusbarVisible={presentationStore.statusbarVisible}
				leftMenuVisible={presentationStore.leftMenuVisible}
				rightMenuVisible={presentationStore.rightMenuVisible}
				isCompactToolbar={presentationStore.isCompactToolbar}
				onMonacoCommand={handleMonacoCommand}
			/>
		</ThemeProvider>
	);
});
