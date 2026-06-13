import { ThemeProvider } from "@world-office/design-system";
import { PresentationCollaborationProvider } from "./components/PresentationCollaborationProvider";
import { SlidePresenter } from "./components/SlidePresenter/SlidePresenter";
import { Viewport } from "./components/Viewport";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTheme } from "./hooks/useTheme";
import { presentationStore } from "./stores/PresentationStore";

export function App() {
	useKeyboardShortcuts();
	useTheme();

	return (
		<ThemeProvider>
			<PresentationCollaborationProvider />
			{presentationStore.isPresenting && <SlidePresenter />}
			<Viewport
				toolbarVisible={presentationStore.toolbarVisible}
				statusbarVisible={presentationStore.statusbarVisible}
				leftMenuVisible={presentationStore.leftMenuVisible}
				rightMenuVisible={presentationStore.rightMenuVisible}
				isCompactToolbar={presentationStore.isCompactToolbar}
			/>
		</ThemeProvider>
	);
}
