import { Extension } from "@tiptap/core"
import type { EditorState, Transaction } from "@tiptap/pm/state"

export interface TextDirectionOptions {
  types: string[]
  directions: string[]
  defaultDirection: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textDirection: {
      setTextDirection: (direction: "ltr" | "rtl") => ReturnType
      unsetTextDirection: () => ReturnType
    }
  }
}

export const TextDirectionExtension = Extension.create<TextDirectionOptions>({
  name: "textDirection",

  addOptions() {
    return {
      types: ["paragraph", "heading", "blockquote", "listItem"],
      directions: ["ltr", "rtl"],
      defaultDirection: "ltr",
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: null,
            parseHTML: (el) => {
              const dir = el.getAttribute("dir")
              if (dir === "ltr" || dir === "rtl") return dir
              return null
            },
            renderHTML: (attrs) => {
              if (!attrs.dir) return {}
              return { dir: attrs.dir }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmds: Record<string, (...args: any[]) => any> = {
      setTextDirection:
        (direction: "ltr" | "rtl") =>
        ({
          tr,
          state,
          dispatch,
        }: {
          tr: Transaction
          state: EditorState
          dispatch: ((tr: Transaction) => void) | undefined
        }) => {
          const { selection } = state
          tr = tr.setSelection(selection)
          const { from, to } = selection

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                dir: direction,
              })
            }
          })

          if (dispatch) {
            dispatch(tr)
          }
          return true
        },
      unsetTextDirection:
        () =>
        ({
          tr,
          state,
          dispatch,
        }: {
          tr: Transaction
          state: EditorState
          dispatch: ((tr: Transaction) => void) | undefined
        }) => {
          const { selection } = state
          tr = tr.setSelection(selection)
          const { from, to } = selection

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name) && node.attrs.dir) {
              const { dir: _, ...rest } = node.attrs
              tr = tr.setNodeMarkup(pos, undefined, rest)
            }
          })

          if (dispatch) {
            dispatch(tr)
          }
          return true
        },
    }
    return cmds
  },
})
