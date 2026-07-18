// ── Plugin Manifest ──────────────────────────────────────────────────────

export interface PluginManifest {
  /** Unique plugin identifier (e.g. "word-count") */
  id: string
  /** Human-readable plugin name */
  name: string
  /** Semantic version string */
  version: string
  /** Optional plugin description */
  description?: string
  /** Plugin author */
  author?: string
  /** Plugin license identifier (e.g. "MIT", "AGPL-3.0") */
  license?: string
  /** Plugin homepage URL */
  homepage?: string
  /** Entry point relative to plugin directory (default: "src/index.ts") */
  main?: string
  /** Lucide icon name for the plugin */
  icon?: string
}
