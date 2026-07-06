import { Mark } from "@tiptap/core"

export interface CommentOptions {
  HTMLAttributes: Record<string, string>
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      setComment: (attributes: { comment: string }) => ReturnType
      unsetComment: () => ReturnType
    }
  }
}

export const CommentMark = Mark.create<CommentOptions>({
  name: "comment",

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      comment: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-comment"),
        renderHTML: (attrs) => {
          if (!attrs.comment) {
            return {}
          }
          return { "data-comment": attrs.comment as string, title: attrs.comment as string }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-comment]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, style: "background: #ffff88; cursor: help;" }, 0]
  },

  addCommands() {
    return {
      setComment:
        (attributes: { comment: string }) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes)
        },
      unsetComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name, { extendEmptyMarkRange: true })
        },
    }
  },
})
