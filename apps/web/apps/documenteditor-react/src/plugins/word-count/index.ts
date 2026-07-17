import type { WorldOfficePlugin, PluginContext } from "@world-office/editor-common"

function countWords(text: string): { words: number; chars: number; charsNoSpaces: number } {
  const trimmed = text.trim()
  if (!trimmed) return { words: 0, chars: 0, charsNoSpaces: 0 }
  const words = trimmed.split(/\s+/).length
  const chars = trimmed.length
  const charsNoSpaces = trimmed.replace(/\s/g, "").length
  return { words, chars, charsNoSpaces }
}

const wordCountPlugin: WorldOfficePlugin = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  description: "Shows word and character count for the current document selection",

  init(ctx: PluginContext) {
    ctx.toolbar.registerButton({
      id: "word-count",
      label: "Word Count",
      icon: "FileText",
      tooltip: "Word Count: Click to count words in document",
      group: "Editing",
      onClick: () => {
        const selection = ctx.editor.getSelection()
        const text = selection.text || (document.body.innerText || "")
        const counts = countWords(text)
        const msg = `Words: ${counts.words} | Characters: ${counts.chars} | No spaces: ${counts.charsNoSpaces}`
        window.dispatchEvent(new CustomEvent("plugin-show-toast", { detail: { message: msg } }))
      },
    })
  },

  destroy() {
    window.dispatchEvent(new CustomEvent("plugin-remove-button", { detail: { id: "word-count" } }))
  },
}

export default wordCountPlugin
