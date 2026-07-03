/**
 * Rich-text editor command bridge for the document editor toolbar.
 *
 * The toolbar in this app is a sibling of the RichTextEditor (they are rendered
 * by separate React components). To dispatch a TipTap command from a toolbar
 * button we use a module-level "active editor" reference inside RichTextEditor
 * plus this typed command surface.
 *
 * If a command is dispatched while no editor is mounted the dispatcher becomes
 * a no-op. Callers do not need to guard for this.
 */

import type { Editor } from "@tiptap/core"

export type RichTextCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "undo"
  | "redo"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "blockquote"
  | "code"
  | "link"
  | "image"

export type RichTextCommandHandler = (command: RichTextCommand) => void

export const RICH_TEXT_COMMANDS: readonly RichTextCommand[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "undo",
  "redo",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "blockquote",
  "code",
  "link",
  "image",
] as const

export type RichTextCommandSurface = Editor

let activeEditor: RichTextCommandSurface | null = null

export function getActiveRichTextEditor(): RichTextCommandSurface | null {
  return activeEditor
}

export function setActiveRichTextEditor(editor: RichTextCommandSurface | null): void {
  activeEditor = editor
}

export function dispatchRichTextCommand(command: RichTextCommand): boolean {
  const editor = activeEditor
  if (!editor) return false

  const chain = editor.chain().focus()

  switch (command) {
    case "bold":
      chain.toggleBold().run()
      return true
    case "italic":
      chain.toggleItalic().run()
      return true
    case "underline":
      chain.toggleUnderline().run()
      return true
    case "strike":
      chain.toggleStrike().run()
      return true
    case "undo":
      chain.undo().run()
      return true
    case "redo":
      chain.redo().run()
      return true
    case "heading1":
      chain.toggleHeading({ level: 1 }).run()
      return true
    case "heading2":
      chain.toggleHeading({ level: 2 }).run()
      return true
    case "heading3":
      chain.toggleHeading({ level: 3 }).run()
      return true
    case "bulletList":
      chain.toggleBulletList().run()
      return true
    case "orderedList":
      chain.toggleOrderedList().run()
      return true
    case "alignLeft":
      chain.setTextAlign("left").run()
      return true
    case "alignCenter":
      chain.setTextAlign("center").run()
      return true
    case "alignRight":
      chain.setTextAlign("right").run()
      return true
    case "blockquote":
      chain.toggleBlockquote().run()
      return true
    case "code":
      chain.toggleCode().run()
      return true
    case "link": {
      // Prompt for a URL and apply a link to the selected text
      const url = window.prompt("Enter link URL:")
      if (url) {
        chain.setLink({ href: url }).run()
      }
      return true
    }
    case "image": {
      // Prompt for an image URL and insert it
      const src = window.prompt("Enter image URL:")
      if (src) {
        chain.setImage({ src }).run()
      }
      return true
    }
  }
}
