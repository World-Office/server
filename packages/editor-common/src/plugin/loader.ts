import type { PluginConfig } from "./config"
import type { PluginContext, PluginRegistryEntry, PluginStatus, WorldOfficePlugin } from "./types"

// ── Plugin Loader ───────────────────────────────────────────────────────

export class PluginLoader {
  private registry = new Map<string, PluginRegistryEntry>()
  private context: PluginContext | null = null

  /**
   * Set the PluginContext that will be passed to all plugins on init.
   */
  setContext(ctx: PluginContext): void {
    this.context = ctx
  }

  /**
   * Load all plugins from the given configuration.
   * Failed plugins are logged and marked as 'failed' — they don't block others.
   */
  async loadPlugins(configs: PluginConfig[]): Promise<void> {
    const ctx = this.context
    if (!ctx) {
      console.warn("[PluginLoader] No context set — call setContext() first")
      return
    }

    const results = await Promise.allSettled(
      configs.map(async (cfg) => {
        if (!cfg.enabled) {
          this.registry.set(cfg.id, {
            plugin: { id: cfg.id, name: cfg.name, version: "0.0.0", destroy: () => {} },
            status: "disabled",
          })
          return
        }

        if (this.registry.get(cfg.id)?.status === "active") {
          return
        }

        try {
          const plugin = await this.loadPlugin(cfg)
          await plugin.init(ctx)
          this.registry.set(cfg.id, { plugin, status: "active" })
          window.dispatchEvent(
            new CustomEvent("plugin-loaded", { detail: { id: cfg.id, name: cfg.name } }),
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[PluginLoader] Failed to load plugin "${cfg.id}":`, msg)
          this.registry.set(cfg.id, {
            plugin: { id: cfg.id, name: cfg.name, version: "0.0.0", destroy: () => {} },
            status: "failed",
            error: msg,
          })
        }
      }),
    )

    const failed = results.filter((r) => r.status === "rejected")
    if (failed.length > 0) {
      console.warn(`[PluginLoader] ${failed.length} plugin load(s) failed`)
    }
  }

  /**
   * Unload a plugin by ID — calls destroy() and removes it from the registry.
   */
  unloadPlugin(id: string): void {
    const entry = this.registry.get(id)
    if (!entry) return

    try {
      entry.plugin.destroy()
    } catch (err) {
      console.error(`[PluginLoader] Error destroying plugin "${id}":`, err)
    }

    this.registry.delete(id)
    window.dispatchEvent(new CustomEvent("plugin-unloaded", { detail: { id } }))
  }

  /**
   * Unload all plugins.
   */
  unloadAll(): void {
    for (const [id] of this.registry) {
      this.unloadPlugin(id)
    }
  }

  /**
   * Get a loaded plugin's registry entry.
   */
  getPlugin(id: string): PluginRegistryEntry | undefined {
    return this.registry.get(id)
  }

  /**
   * Get all loaded plugin registry entries.
   */
  getAllPlugins(): PluginRegistryEntry[] {
    return Array.from(this.registry.values())
  }

  /**
   * Get all plugins with a specific status.
   */
  getPluginsByStatus(status: PluginStatus): PluginRegistryEntry[] {
    return this.getAllPlugins().filter((p) => p.status === status)
  }

  /**
   * Check if a plugin is loaded and active.
   */
  isActive(id: string): boolean {
    return this.registry.get(id)?.status === "active"
  }

  /**
   * Reload a single plugin.
   */
  async reloadPlugin(id: string, config: PluginConfig): Promise<void> {
    this.unloadPlugin(id)
    await this.loadPlugins([config])
  }

  /**
   * Internal: load a single plugin module.
   * Tries dynamic import() first, then falls back to evaluating source.
   */
  private async loadPlugin(config: PluginConfig): Promise<WorldOfficePlugin> {
    if (config.path) {
      const mod = await import(/* @vite-ignore */ config.path)
      return mod.default ?? mod
    }

    throw new Error(`Plugin "${config.id}" has no path specified`)
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

/** Global PluginLoader instance. */
export const pluginLoader = new PluginLoader()
