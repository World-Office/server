import { Node, mergeAttributes } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export interface TocItem {
  id: string
  level: number
  text: string
}

const tocPluginKey = new PluginKey("tableOfContents")

function buildTocFromHeadings(doc: PmNode): TocItem[] {
  const items: TocItem[] = []
  doc.forEach((node) => {
    if (node.type.name === "heading") {
      const level = node.attrs.level as number | undefined
      if (level && level <= 3) {
        let text = ""
        node.forEach((child) => {
          if (child.isText) text += child.text
        })
        items.push({
          id: (node.attrs.id as string) ?? `heading-${items.length + 1}`,
          level,
          text,
        })
      }
    }
  })
  return items
}

function buildTocHtml(items: TocItem[]): string {
  return items
    .map(
      (item) =>
        `<div class="toc-item toc-level-${item.level}"><a href="#${item.id}">${item.text}</a></div>`,
    )
    .join("")
}

function updateTocDoms(view: { state: { doc: PmNode }; nodeDOM: (pos: number) => Node | null }) {
  const tocNodes: Array<{ node: PmNode; pos: number }> = []
  view.state.doc.forEach((node, pos) => {
    if (node.type.name === "tableOfContents") {
      tocNodes.push({ node, pos })
    }
  })

  for (const { node, pos } of tocNodes) {
    const maxLevel = node.attrs.maxLevel as number
    const toc = buildTocFromHeadings(view.state.doc)
    const filtered = toc.filter((item) => item.level <= maxLevel)
    const html = buildTocHtml(filtered)
    const dom = view.nodeDOM(pos) as HTMLElement | null
    if (dom) {
      dom.innerHTML = html || '<span class="toc-placeholder">No headings found</span>'
    }
  }
}

// Standalone command functions (not TipTap chain commands — use these from UI)
export function insertTableOfContentsCommand(editor: Editor) {
  const toc = buildTocFromHeadings(editor.state.doc)
  const html = buildTocHtml(toc)
  return editor.chain().focus().insertContent(`<div data-toc>${html}</div>`).run()
}

export function updateTableOfContentsCommand(editor: Editor) {
  const tocNodes: Array<{ pos: number }> = []
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === "tableOfContents") {
      tocNodes.push({ pos })
    }
  })
  if (tocNodes.length === 0) return false

  const toc = buildTocFromHeadings(editor.state.doc)
  const html = buildTocHtml(toc)

  for (const { pos } of tocNodes) {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null
    if (dom) {
      dom.innerHTML = html || '<span class="toc-placeholder">No headings found</span>'
    }
  }
  return true
}

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      maxLevel: {
        default: 3,
        parseHTML: (el) => Number(el.getAttribute("data-max-level")) || 3,
        renderHTML: (attrs) => ({ "data-max-level": attrs.maxLevel }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-toc]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "table-of-contents", "data-toc": "" }),
      0,
    ]
  },

  addNodeView() {
    return () => {
      const container = document.createElement("div")
      container.className = "table-of-contents"
      container.contentEditable = "false"
      container.setAttribute("data-toc", "")
      container.innerHTML =
        '<span class="toc-placeholder">Table of Contents — headings will appear here</span>'
      return { dom: container }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tocPluginKey,
        view() {
          return {
            update(view) {
              updateTocDoms(view as Parameters<typeof updateTocDoms>[0])
            },
          }
        },
      }),
    ]
  },
})
