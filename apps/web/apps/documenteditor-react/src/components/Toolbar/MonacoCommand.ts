/**
 * Monaco command bridge for the document editor toolbar.
 *
 * The toolbar in this app is a sibling of the MonacoEditor (they are rendered
 * by separate React components). To dispatch a Monaco command from a toolbar
 * button we use a module-level "active editor" reference inside MonacoEditor
 * plus this typed command surface.
 *
 * Only commands that map cleanly to a Monaco editor action are listed here.
 * Rich-text operations (bold, italic, headings, lists, tables, images) are
 * NOT included because Monaco is a code editor and cannot represent them.
 *
 * If a command is dispatched while no editor is mounted (e.g. the user
 * reloaded the page or the WOPI document is still loading) the dispatcher
 * becomes a no-op. Callers do not need to guard for this.
 */

import type * as monaco from "monaco-editor"

export type MonacoCommand =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "find"
  | "replace"
  | "formatDocument"
  | "toggleMinimap"
  | "toggleWordWrap"

export type MonacoCommandHandler = (command: MonacoCommand) => void

export const MONACO_COMMANDS: readonly MonacoCommand[] = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "selectAll",
  "find",
  "replace",
  "formatDocument",
  "toggleMinimap",
  "toggleWordWrap",
] as const

interface MinimalMonacoEditor {
  trigger: (source: string, actionId: string, payload: unknown) => void
  getAction: (id: string) => { run: () => void } | undefined
  getOption: (id: number) => { enabled: boolean }
  updateOptions: (options: { minimap: { enabled: boolean } }) => void
}

/**
 * Dispatch a Monaco command to the given editor instance. Extracted from
 * App.tsx so it can be unit-tested without a React tree. Returns true if
 * the command was actually applied, false if the editor was null or the
 * command was not recognized.
 */
export function dispatchMonacoCommand(
  command: MonacoCommand,
  editor: monaco.editor.IStandaloneCodeEditor | null,
): boolean {
  if (!editor) return false
  const minimal = editor as unknown as MinimalMonacoEditor
  switch (command) {
    case "undo":
      minimal.trigger("toolbar", "undo", null)
      return true
    case "redo":
      minimal.trigger("toolbar", "redo", null)
      return true
    case "cut":
      minimal.getAction("editor.action.clipboardCutAction")?.run()
      return true
    case "copy":
      minimal.getAction("editor.action.clipboardCopyAction")?.run()
      return true
    case "paste":
      minimal.getAction("editor.action.clipboardPasteAction")?.run()
      return true
    case "selectAll":
      minimal.getAction("editor.action.selectAll")?.run()
      return true
    case "find":
      minimal.getAction("actions.find")?.run()
      return true
    case "replace":
      minimal.getAction("editor.action.startFindReplaceAction")?.run()
      return true
    case "formatDocument":
      minimal.getAction("editor.action.formatDocument")?.run()
      return true
    case "toggleMinimap": {
      const opts = minimal.getOption(0) // monaco.editor.EditorOption.minimap === 0
      minimal.updateOptions({ minimap: { enabled: !opts.enabled } })
      return true
    }
    case "toggleWordWrap":
      minimal.getAction("editor.action.toggleWordWrap")?.run()
      return true
  }
}
