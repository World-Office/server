import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { SpellChecker } from "@world-office/spellchecker"

export interface SpellcheckExtensionOptions {
  spellchecker: SpellChecker | null
  enabled: boolean
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spellcheck: {
      setSpellcheckEnabled: (enabled: boolean) => ReturnType
    }
  }
}

export const SpellcheckExtension = Extension.create<SpellcheckExtensionOptions>({
  name: "spellcheck",

  addOptions() {
    return {
      spellchecker: null,
      enabled: true,
    }
  },

  addCommands() {
    return {
      setSpellcheckEnabled:
        (enabled: boolean) =>
        () => {
          this.options.enabled = enabled
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey("spellcheck")

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, oldState) {
            if (!tr.docChanged) return oldState
            return DecorationSet.empty
          },
        },
        props: {
          decorations(state) {
            const spellchecker = this.spec.options?.spellchecker as SpellChecker | undefined
            if (!spellchecker || !spellchecker.isEnabled()) return DecorationSet.empty

            const decorations: Decoration[] = []
            const doc = state.doc

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return

              const text = node.text
              const wordRegex = /\b[a-zA-Z\u00C0-\u024F]+\b/g
              let match: RegExpExecArray | null

              while ((match = wordRegex.exec(text)) !== null) {
                const word = match[0]
                if (!spellchecker.check(word)) {
                  const from = pos + match.index
                  const to = from + word.length
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: "spellcheck-error",
                      "data-word": word,
                    }),
                  )
                }
              }
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }) as unknown as Plugin,
    ]
  },
})
