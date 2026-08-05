/**
 * Document Themes — color and font scheme presets.
 *
 * Each theme defines:
 *   • Major font (headings, title)
 *   • Minor font (body text)
 *   • Accent colors (6 colors for headings, highlights, hyperlinks)
 *   • Background / page color
 *
 * When a theme is applied, the DocumentStore stores the theme name, and
 * the toolbar/font selectors use it to populate their defaults. The theme
 * is also written into the saved document so it round-trips.
 */

export interface ThemeDefinition {
  id: string
  name: string
  majorFont: string
  minorFont: string
  accent1: string
  accent2: string
  accent3: string
  accent4: string
  accent5: string
  accent6: string
  hyperlink: string
  pageColor: string
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "office",
    name: "Office",
    majorFont: "Aptos",
    minorFont: "Aptos",
    accent1: "#0078d4",
    accent2: "#2ecc71",
    accent3: "#e67e22",
    accent4: "#9b59b6",
    accent5: "#e74c3c",
    accent6: "#1abc9c",
    hyperlink: "#0563c1",
    pageColor: "#ffffff",
  },
  {
    id: "classic",
    name: "Classic",
    majorFont: "Calibri Light",
    minorFont: "Calibri",
    accent1: "#4472c4",
    accent2: "#ed7d31",
    accent3: "#a5a5a5",
    accent4: "#ffc000",
    accent5: "#5b9bd5",
    accent6: "#70ad47",
    hyperlink: "#0563c1",
    pageColor: "#ffffff",
  },
  {
    id: "dark",
    name: "Dark",
    majorFont: "Segoe UI",
    minorFont: "Segoe UI",
    accent1: "#0078d4",
    accent2: "#2ecc71",
    accent3: "#f39c12",
    accent4: "#9b59b6",
    accent5: "#e74c3c",
    accent6: "#1abc9c",
    hyperlink: "#4fc3f7",
    pageColor: "#1e1e1e",
  },
  {
    id: "modern",
    name: "Modern",
    majorFont: "Montserrat",
    minorFont: "Open Sans",
    accent1: "#3f51b5",
    accent2: "#ff4081",
    accent3: "#00bcd4",
    accent4: "#ff9800",
    accent5: "#8bc34a",
    accent6: "#607d8b",
    hyperlink: "#2196f3",
    pageColor: "#fafafa",
  },
  {
    id: "elegant",
    name: "Elegant",
    majorFont: "Georgia",
    minorFont: "Palatino Linotype",
    accent1: "#8b4513",
    accent2: "#2f4f4f",
    accent3: "#556b2f",
    accent4: "#800020",
    accent5: "#191970",
    accent6: "#4a2c2a",
    hyperlink: "#0000cd",
    pageColor: "#fefcf3",
  },
  {
    id: "playful",
    name: "Playful",
    majorFont: "Comic Sans MS",
    minorFont: "Trebuchet MS",
    accent1: "#e91e63",
    accent2: "#ff5722",
    accent3: "#cddc39",
    accent4: "#00bcd4",
    accent5: "#ffc107",
    accent6: "#9c27b0",
    hyperlink: "#2196f3",
    pageColor: "#fffde7",
  },
]

/**
 * Apply a theme to the document by setting font-family and accent colors
 * on the document's root style. Each editor implements the actual CSS.
 */
export function getThemeById(id: string): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/**
 * Build a CSS string from a theme definition to be injected into the editor.
 */
export function themeToCss(theme: ThemeDefinition): string {
  return `
    --wo-theme-major-font: "${theme.majorFont}";
    --wo-theme-minor-font: "${theme.minorFont}";
    --wo-theme-accent-1: ${theme.accent1};
    --wo-theme-accent-2: ${theme.accent2};
    --wo-theme-accent-3: ${theme.accent3};
    --wo-theme-accent-4: ${theme.accent4};
    --wo-theme-accent-5: ${theme.accent5};
    --wo-theme-accent-6: ${theme.accent6};
    --wo-theme-hyperlink: ${theme.hyperlink};
    --wo-theme-page-color: ${theme.pageColor};
  `
}
