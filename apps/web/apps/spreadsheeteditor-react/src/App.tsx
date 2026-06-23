import { ThemeProvider } from "@world-office/design-system";
import { useDocumentLoader } from "@world-office/wopi-client";
import { Viewport } from "./components/Viewport";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { spreadsheetStore } from "./stores/SpreadsheetStore";

export function App() {
	useKeyboardShortcuts();
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
			/>
		</ThemeProvider>
	);
}
