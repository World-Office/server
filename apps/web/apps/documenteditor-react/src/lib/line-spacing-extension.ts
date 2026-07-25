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
      setParagraphSpacingBefore: (spacing: string) => ReturnType
      unsetParagraphSpacingBefore: () => ReturnType
      setParagraphSpacingAfter: (spacing: string) => ReturnType
      unsetParagraphSpacingAfter: () => ReturnType
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
          marginTop: {
            default: null,
            parseHTML: (el) => el.style.marginTop || null,
            renderHTML: (attrs) => {
              if (!attrs.marginTop) return {}
              return { style: `margin-top: ${attrs.marginTop}` }
            },
          },
          marginBottom: {
            default: null,
            parseHTML: (el) => el.style.marginBottom || null,
            renderHTML: (attrs) => {
              if (!attrs.marginBottom) return {}
              return { style: `margin-bottom: ${attrs.marginBottom}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    const setNodeAttr = (
      // biome-ignore lint/suspicious/noExplicitAny: ProseMirror Node/Transaction types
      state: any,
      // biome-ignore lint/suspicious/noExplicitAny: ProseMirror Node/Transaction types
      tr: any,
      attrName: string,
      value: string | null,
    ) => {
      const { from, to } = state.selection
      const relevantTypes = this.options.types
      let currentTr = tr
      // biome-ignore lint/suspicious/noExplicitAny: ProseMirror Node type
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (relevantTypes.includes(node.type.name)) {
          const attrs = { ...node.attrs }
          if (value === null) {
            delete attrs[attrName]
          } else {
            attrs[attrName] = value
          }
          currentTr = currentTr.setNodeMarkup(pos, undefined, attrs)
        }
      })
    }
    return {
      setLineSpacing:
        (spacing: string) =>
        ({ tr, state, dispatch }) => {
          tr = tr.setSelection(state.selection)
          setNodeAttr(state, tr, "lineHeight", spacing)
          if (dispatch) dispatch(tr)
          return true
        },
      unsetLineSpacing:
        () =>
        ({ tr, state, dispatch }) => {
          tr = tr.setSelection(state.selection)
          setNodeAttr(state, tr, "lineHeight", null)
          if (dispatch) dispatch(tr)
          return true
        },
      setParagraphSpacingBefore:
        (spacing: string) =>
        ({ tr, state, dispatch }) => {
          tr = tr.setSelection(state.selection)
          setNodeAttr(state, tr, "marginTop", spacing)
          if (dispatch) dispatch(tr)
          return true
        },
      unsetParagraphSpacingBefore:
        () =>
        ({ tr, state, dispatch }) => {
          tr = tr.setSelection(state.selection)
          setNodeAttr(state, tr, "marginTop", null)
          if (dispatch) dispatch(tr)
          return true
        },
      setParagraphSpacingAfter:
        (spacing: string) =>
        ({ tr, state, dispatch }) => {
          tr = tr.setSelection(state.selection)
          setNodeAttr(state, tr, "marginBottom", spacing)
          if (dispatch) dispatch(tr)
          return true
        },
      unsetParagraphSpacingAfter:
        () =>
        ({ tr, state, dispatch }) => {
          tr = tr.setSelection(state.selection)
          setNodeAttr(state, tr, "marginBottom", null)
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})
