/**
 * Frontend command router — replaces the TipTap/WASM split.
 *
 * Listens for `wo-command` window events, validates against a per-editor registry,
 * and dispatches to handlers that translate WoCommand → ModelOp JSON → apply_op().
 */

/** Represents a command that can be executed by an editor. */
export interface WoCommand {
  command: string
  value?: string | number | boolean | object
}

/** Handler function type for processing commands. */
export type CommandHandler = (cmd: WoCommand) => void

/**
 * Per-editor command registries.
 * Maps editor kind to a Set of registered command names.
 */
const editorRegistries = new Map<"doc" | "sheet" | "slide" | "pdf" | "visio", Set<string>>()

/**
 * Per-editor handlers.
 * Maps editor kind to its command handler function.
 */
const editorHandlers = new Map<"doc" | "sheet" | "slide" | "pdf" | "visio", CommandHandler>()

/**
 * Global event listener reference for cleanup.
 */
let globalListener: ((event: Event) => void) | null = null

/**
 * Initialize the router if not already initialized.
 * Sets up the global window event listener.
 */
function initRouter(): void {
  if (globalListener !== null) {
    return
  }

  globalListener = (event: Event) => {
    const customEvent = event as CustomEvent

    // Only handle wo-command events
    if (customEvent.type !== "wo-command") {
      return
    }

    const detail = customEvent.detail as WoCommand | undefined

    // Validate event structure
    if (!detail || typeof detail.command !== "string") {
      console.warn("Invalid wo-command event: missing command property")
      return
    }

    const command: WoCommand = {
      command: detail.command,
      value: detail.value,
    }

    // Find the appropriate editor handler based on the event target
    // Try all registered editors to find one that can handle this command
    for (const [kind, handler] of editorHandlers.entries()) {
      const registry = editorRegistries.get(kind)

      // If no registry exists for this editor, all commands are allowed
      if (!registry || registry.has(command.command)) {
        try {
          handler(command)
          return // Command handled, stop propagation
        } catch (error) {
          console.error(`Error handling command "${command.command}" for editor "${kind}":`, error)
        }
      }
    }

    // If we get here, no handler was found for the command
    console.warn(`No handler found for command: ${command.command}`)
  }

  // Use capture phase to ensure we catch events before they bubble
  window.addEventListener("wo-command", globalListener as EventListener, false)
}

/**
 * Register a command handler for a specific editor kind.
 *
 * @param kind - The editor kind: 'doc', 'sheet', 'slide', 'pdf', or 'visio'
 * @param handler - The function to call when a command is received
 * @param commands - Optional list of command names to register for this editor
 * @returns A function that unregisters the handler when called
 */
export function registerEditorRouter(
  kind: "doc" | "sheet" | "slide" | "pdf" | "visio",
  handler: CommandHandler,
  commands?: string[],
): () => void {
  // Initialize the global router if not already done
  initRouter()

  // Register the handler
  editorHandlers.set(kind, handler)

  // Register commands if provided
  if (commands && commands.length > 0) {
    let registry = editorRegistries.get(kind)
    if (!registry) {
      registry = new Set()
      editorRegistries.set(kind, registry)
    }
    for (const cmd of commands) {
      registry.add(cmd)
    }
  }

  // Return unregister function
  return () => {
    editorHandlers.delete(kind)
    editorRegistries.delete(kind)

    // Clean up global listener if no more handlers
    if (editorHandlers.size === 0) {
      if (globalListener !== null) {
        window.removeEventListener("wo-command", globalListener as EventListener, false)
        globalListener = null
      }
    }
  }
}

/**
 * Register specific commands for an editor kind.
 * Useful for adding commands after the router is registered.
 *
 * @param kind - The editor kind
 * @param commands - Array of command names to register
 */
export function registerCommands(
  kind: "doc" | "sheet" | "slide" | "pdf" | "visio",
  commands: string[],
): void {
  let registry = editorRegistries.get(kind)
  if (!registry) {
    registry = new Set()
    editorRegistries.set(kind, registry)
  }
  for (const cmd of commands) {
    registry.add(cmd)
  }
}

/**
 * Unregister specific commands for an editor kind.
 *
 * @param kind - The editor kind
 * @param commands - Array of command names to unregister
 */
export function unregisterCommands(
  kind: "doc" | "sheet" | "slide" | "pdf" | "visio",
  commands: string[],
): void {
  const registry = editorRegistries.get(kind)
  if (registry) {
    for (const cmd of commands) {
      registry.delete(cmd)
    }
  }
}

/**
 * Check if a command is registered for a specific editor kind.
 *
 * @param kind - The editor kind
 * @param command - The command name to check
 * @returns true if the command is registered
 */
export function isCommandRegistered(
  kind: "doc" | "sheet" | "slide" | "pdf" | "visio",
  command: string,
): boolean {
  const registry = editorRegistries.get(kind)
  return registry ? registry.has(command) : false
}

/**
 * Get all registered commands for an editor kind.
 *
 * @param kind - The editor kind
 * @returns Array of registered command names
 */
export function getRegisteredCommands(kind: "doc" | "sheet" | "slide" | "pdf" | "visio"): string[] {
  const registry = editorRegistries.get(kind)
  return registry ? Array.from(registry) : []
}

/**
 * Reset the router state. Useful for testing.
 * Clears all registered handlers and command registries.
 */
export function resetRouter(): void {
  editorHandlers.clear()
  editorRegistries.clear()

  // Remove the global listener
  if (globalListener !== null) {
    window.removeEventListener("wo-command", globalListener as EventListener, false)
    globalListener = null
  }
}
