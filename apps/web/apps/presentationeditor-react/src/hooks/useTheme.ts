import { useEffect } from "react";
import { presentationStore } from "../stores/PresentationStore";

export const useTheme = () => {
	const { theme } = presentationStore;

	useEffect(() => {
		const root = document.documentElement;

		for (const themeColor of theme.colorScheme.colors) {
			root.style.setProperty(
				`--wo-prese-color-${themeColor.name}`,
				`#${themeColor.color}`,
			);
		}

		const { majorFont, minorFont } = theme.fontScheme;
		if (majorFont.latin) {
			root.style.setProperty("--wo-prese-font-major", majorFont.latin);
		}
		if (minorFont.latin) {
			root.style.setProperty("--wo-prese-font-minor", minorFont.latin);
		}

		const bg = theme.colorScheme.colors.find((c) => c.name === "light1");
		if (bg) {
			root.style.setProperty("--wo-prese-bg-page", `#${bg.color}`);
		}

		const text = theme.colorScheme.colors.find((c) => c.name === "dark1");
		if (text) {
			root.style.setProperty("--wo-prese-text-primary", `#${text.color}`);
		}
	}, [theme]);
};
