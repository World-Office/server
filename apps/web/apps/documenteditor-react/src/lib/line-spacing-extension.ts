import { Extension } from "@tiptap/core"

export interface LineSpacingOptions {
  types: string[]
  defaultSpacing: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineSpacing: {
      setLineSpacing: (spacing: string) => ReturnType
      unsetLineSpacing: () => ReturnType
    }
  }
}

export const LineSpacingExtension = Extension.create<LineSpacingOptions>({
  name: "lineSpacing",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
      defaultSpacing: "1.15",
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight) return {}
              return { style: `line-height: ${attrs.lineHeight}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineSpacing:
        (spacing: string) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          tr = tr.setSelection(selection)
          const { from, to } = selection
          const relevantTypes = this.options.types

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (relevantTypes.includes(node.type.name)) {
              const nodeFrom = pos
              tr = tr.setNodeMarkup(nodeFrom, undefined, {
                ...node.attrs,
                lineHeight: spacing,
              })
            }
          })

          if (dispatch) {
            dispatch(tr)
          }
          return true
        },
      unsetLineSpacing:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          tr = tr.setSelection(selection)
          const { from, to } = selection
          const relevantTypes = this.options.types

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (relevantTypes.includes(node.type.name) && node.attrs.lineHeight) {
              const nodeFrom = pos
              const { lineHeight: _, ...rest } = node.attrs
              tr = tr.setNodeMarkup(nodeFrom, undefined, rest)
            }
          })

          if (dispatch) {
            dispatch(tr)
          }
          return true
        },
    }
  },
})
