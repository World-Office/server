/**
 * TipTap mark extension that renders `font-size` to CSS via the `textStyle`
 * mark.
 *
 * Mirrors the structure of `@tiptap/extension-font-family`. The stock
 * `TextStyle` mark in `@tiptap/extension-text-style` only renders `color`;
 * without this extension, `chain.setMark("textStyle", { fontSize: x })` is
 * accepted at the ProseMirror layer but never reaches the rendered HTML.
 *
 * See plan/2026-07-25-basic-formatting-spec.md §3.
 */
import { Mark } from "@tiptap/core"

export interface FontSizeOptions {
  types: string[]
}

declare module "@tiptap/extension-text-style" {
  interface TextStyleAttributes {
    fontSize?: string | null
  }
}

export const FontSize = Mark.create<FontSizeOptions>({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {}
              }
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
})
