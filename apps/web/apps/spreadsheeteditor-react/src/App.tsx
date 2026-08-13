import { ThemeProvider } from "@world-office/design-system";
import {
	useDocumentLoader,
	useWoCommandListener,
} from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
import { Suspense, lazy, useCallback } from "react";
import { getActiveEditor } from "./components/MonacoEditor";
import { handlePanelCommand } from "./components/RightMenu/spreadsheet-command-router";
import {
	type MonacoCommand,
	dispatchMonacoCommand,
} from "./components/Toolbar/MonacoCommand";
import { Viewport } from "./components/Viewport";
import { useEmbeddedAutoSave } from "./hooks/useEmbeddedAutoSave";
import { useEmbeddedBridge } from "./hooks/useEmbeddedBridge";
import { useEmbeddedMode } from "./hooks/useEmbeddedMode";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { isCollaborationConfigured } from "./lib/collaboration-config";
import { spreadsheetStore } from "./stores/SpreadsheetStore";

const SpreadsheetCollaborationProvider = lazy(() =>
	import("./components/SpreadsheetCollaborationProvider").then((m) => ({
		default: m.SpreadsheetCollaborationProvider,
	})),
);

export const App = observer(function App() {
	useKeyboardShortcuts();

	const { embedded } = useEmbeddedMode(
		spreadsheetStore.setToolbarVisible.bind(spreadsheetStore),
		spreadsheetStore.setStatusbarVisible.bind(spreadsheetStore),
		spreadsheetStore.setLeftMenuVisible.bind(spreadsheetStore),
		spreadsheetStore.setRightMenuVisible.bind(spreadsheetStore),
	);

	const bridge = useEmbeddedBridge({
		embedded,
		onSave: async () => {
			await spreadsheetStore.saveToWopi();
		},
	});

	useEmbeddedAutoSave(
		embedded,
		spreadsheetStore.wopiConnection,
		spreadsheetStore.isModified,
		() => spreadsheetStore.buildDocumentBlob(),
		bridge.notifyDocumentSaved,
		bridge.notifyError,
		undefined,
		() => {
			spreadsheetStore.isModified = false;
		},
	);

	const handleMonacoCommand = useCallback((command: MonacoCommand) => {
		dispatchMonacoCommand(command, getActiveEditor());
	}, []);

	useWoCommandListener({
		onCommand: (command, value) => {
			// SS-8: route right-menu panel commands to the spreadsheet engine
			// (Univer) first; fall back to the Monaco handler for legacy commands.
			if (handlePanelCommand(command, value)) {
				return;
			}
			handleMonacoCommand(command as MonacoCommand);
		},
		onSave: () => spreadsheetStore.saveToWopi(),
		onDownload: () => spreadsheetStore.exportAsDownload(),
	});
	const loadState = useDocumentLoader({
		onLoad: () => spreadsheetStore.detectAndLoadWopi(),
		isLoading: spreadsheetStore.isLoading,
		isError: spreadsheetStore.isLoadingError !== null,
		isReady: spreadsheetStore.isDocReady,
	});

	if (loadState === "loading") {
		return (
			<ThemeProvider>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						height: "100vh",
						color: "#666",
						fontSize: 14,
					}}
				>
					Loading document...
				</div>
			</ThemeProvider>
		);
	}
	if (loadState === "error") {
		return (
			<ThemeProvider>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						height: "100vh",
						gap: 12,
					}}
				>
					<p style={{ color: "#d32f2f", fontSize: 14, margin: 0 }}>
						Failed to load document: {spreadsheetStore.isLoadingError}
					</p>
					<button
						type="button"
						onClick={() => {
							spreadsheetStore.isLoadingError = null;
							spreadsheetStore.detectAndLoadWopi();
						}}
						style={{ padding: "6px 16px", cursor: "pointer" }}
					>
						Retry
					</button>
				</div>
			</ThemeProvider>
		);
	}

	return (
		<ThemeProvider>
			<Viewport
				toolbarVisible={spreadsheetStore.toolbarVisible}
				statusbarVisible={spreadsheetStore.statusbarVisible}
				leftMenuVisible={spreadsheetStore.leftMenuVisible}
				rightMenuVisible={spreadsheetStore.rightMenuVisible}
				isCompactToolbar={spreadsheetStore.isCompactToolbar}
				onMonacoCommand={handleMonacoCommand}
			/>
			{isCollaborationConfigured() && (
				<Suspense fallback={null}>
					<SpreadsheetCollaborationProvider />
				</Suspense>
			)}
		</ThemeProvider>
	);
});
