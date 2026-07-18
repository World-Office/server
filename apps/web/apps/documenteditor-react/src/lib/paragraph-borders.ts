import { Extension } from "@tiptap/core"

export interface ParagraphBorderAttrs {
  borderTop?: string
  borderBottom?: string
  borderLeft?: string
  borderRight?: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphBorders: {
      setBorderTop: (attrs?: ParagraphBorderAttrs) => ReturnType
      setBorderBottom: (attrs?: ParagraphBorderAttrs) => ReturnType
      setBorderLeft: (attrs?: ParagraphBorderAttrs) => ReturnType
      setBorderRight: (attrs?: ParagraphBorderAttrs) => ReturnType
      setBoxBorder: (attrs?: ParagraphBorderAttrs) => ReturnType
      removeBorders: () => ReturnType
    }
  }
}

export const ParagraphBorders = Extension.create({
  name: "paragraphBorders",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          borderTop: { default: null },
          borderBottom: { default: null },
          borderLeft: { default: null },
          borderRight: { default: null },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBorderTop:
        (attrs?: ParagraphBorderAttrs) =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", {
            borderTop: attrs?.borderTop ?? "2px solid #000",
          })
        },
      setBorderBottom:
        (attrs?: ParagraphBorderAttrs) =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", {
            borderBottom: attrs?.borderBottom ?? "2px solid #000",
          })
        },
      setBorderLeft:
        (attrs?: ParagraphBorderAttrs) =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", {
            borderLeft: attrs?.borderLeft ?? "2px solid #000",
          })
        },
      setBorderRight:
        (attrs?: ParagraphBorderAttrs) =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", {
            borderRight: attrs?.borderRight ?? "2px solid #000",
          })
        },
      setBoxBorder:
        (attrs?: ParagraphBorderAttrs) =>
        ({ commands }) => {
          const border = attrs?.borderTop ?? "2px solid #000"
          return commands.updateAttributes("paragraph", {
            borderTop: border,
            borderBottom: border,
            borderLeft: border,
            borderRight: border,
          })
        },
      removeBorders:
        () =>
        ({ commands }) => {
          return commands.updateAttributes("paragraph", {
            borderTop: null,
            borderBottom: null,
            borderLeft: null,
            borderRight: null,
          })
        },
    }
  },
})
