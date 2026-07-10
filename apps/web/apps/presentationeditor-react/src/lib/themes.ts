import type { Theme, ThemePreset } from "../types/presentation";

export const BUILTIN_THEME_PRESETS: ThemePreset[] = [
	{
		name: "Office",
		description: "The classic Microsoft Office theme",
		colorScheme: {
			name: "Office",
			colors: [
				{ name: "dark1", color: "000000" },
				{ name: "light1", color: "FFFFFF" },
				{ name: "dark2", color: "44546A" },
				{ name: "light2", color: "E7E6E6" },
				{ name: "accent1", color: "4472C4" },
				{ name: "accent2", color: "ED7D31" },
				{ name: "accent3", color: "A5A5A5" },
				{ name: "accent4", color: "FFC000" },
				{ name: "accent5", color: "5B9BD5" },
				{ name: "accent6", color: "70AD47" },
				{ name: "hlink", color: "0563C1" },
				{ name: "folHlink", color: "954F72" },
			],
		},
		fontScheme: {
			name: "Office",
			majorFont: { latin: "Calibri Light" },
			minorFont: { latin: "Calibri" },
		},
	},
	{
		name: "Ion",
		description: "Sleek and modern with deep blues",
		colorScheme: {
			name: "Ion",
			colors: [
				{ name: "dark1", color: "2B2B2B" },
				{ name: "light1", color: "F2F2F2" },
				{ name: "dark2", color: "4D4D4D" },
				{ name: "light2", color: "D9D9D9" },
				{ name: "accent1", color: "336699" },
				{ name: "accent2", color: "6699CC" },
				{ name: "accent3", color: "99CCFF" },
				{ name: "accent4", color: "FF9933" },
				{ name: "accent5", color: "FFCC99" },
				{ name: "accent6", color: "FFFFCC" },
				{ name: "hlink", color: "003366" },
				{ name: "folHlink", color: "660033" },
			],
		},
		fontScheme: {
			name: "Ion",
			majorFont: { latin: "Century Gothic" },
			minorFont: { latin: "Century Gothic" },
		},
	},
];

export const DEFAULT_THEME: Theme = {
	name: BUILTIN_THEME_PRESETS[0].name,
	colorScheme: BUILTIN_THEME_PRESETS[0].colorScheme,
	fontScheme: BUILTIN_THEME_PRESETS[0].fontScheme,
};
