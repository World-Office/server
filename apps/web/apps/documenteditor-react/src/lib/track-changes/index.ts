import { type Editor, Mark } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export const TrackInsertMark = Mark.create({
  name: "trackInsert",
  addAttributes() {
    return {
      author: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-author"),
        renderHTML: (attrs) => (attrs.author ? { "data-author": attrs.author as string } : {}),
      },
      timestamp: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-timestamp"),
        renderHTML: (attrs) =>
          attrs.timestamp ? { "data-timestamp": attrs.timestamp as string } : {},
      },
      userId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-user-id"),
        renderHTML: (attrs) => (attrs.userId ? { "data-user-id": attrs.userId as string } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: "ins[data-author]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["ins", { ...HTMLAttributes, class: "track-insert" }, 0]
  },
})

export const TrackDeleteMark = Mark.create({
  name: "trackDelete",
  addAttributes() {
    return {
      author: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-author"),
        renderHTML: (attrs) => (attrs.author ? { "data-author": attrs.author as string } : {}),
      },
      timestamp: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-timestamp"),
        renderHTML: (attrs) =>
          attrs.timestamp ? { "data-timestamp": attrs.timestamp as string } : {},
      },
      userId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-user-id"),
        renderHTML: (attrs) => (attrs.userId ? { "data-user-id": attrs.userId as string } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: "del[data-author]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["del", { ...HTMLAttributes, class: "track-delete" }, 0]
  },
})

export const trackChangesPluginKey = new PluginKey("trackChanges")

export interface TrackChangesPluginState {
  active: boolean
  author: string
  userId: string
}

let pluginState: TrackChangesPluginState = { active: false, author: "", userId: "" }

export function createTrackChangesPlugin(initialState: TrackChangesPluginState): Plugin {
  pluginState = { ...initialState }

  return new Plugin({
    key: trackChangesPluginKey,
    state: {
      init() {
        return { ...pluginState }
      },
      apply(tr, prev) {
        const meta = tr.getMeta(trackChangesPluginKey)
        if (meta) {
          const next = { ...prev }
          if (meta.active !== undefined) next.active = meta.active
          if (meta.author !== undefined) next.author = meta.author
          if (meta.userId !== undefined) next.userId = meta.userId
          pluginState = next
          return next
        }
        return prev
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (!pluginState.active) return false

        const { schema, tr } = view.state
        const attrs = {
          author: pluginState.author,
          timestamp: Date.now().toString(),
          userId: pluginState.userId,
        }

        if (from !== to) {
          const deleted = view.state.doc.textBetween(from, to)
          const delText = schema.text(deleted, [schema.marks.trackDelete.create(attrs)])
          tr.replaceWith(from, to, delText)
        }

        const insText = schema.text(text, [schema.marks.trackInsert.create(attrs)])
        tr.replaceWith(from, from, insText)
        view.dispatch(tr)
        return true
      },
    },
  })
}

export function isTrackChangesActive(): boolean {
  return pluginState.active
}

export function toggleTrackChanges(editor: Editor, author: string, userId: string): boolean {
  const current = trackChangesPluginKey.getState(editor.state)
  const isActive = current ? !current.active : true

  editor.view.dispatch(
    editor.state.tr.setMeta(trackChangesPluginKey, {
      active: isActive,
      author,
      userId,
    }),
  )
  return true
}

export function acceptChange(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(pos)
  const marks = $pos.marks()

  for (const mark of marks) {
    if (mark.type.name === "trackInsert") {
      editor.chain().focus().unsetMark("trackInsert").run()
      return true
    }
    if (mark.type.name === "trackDelete") {
      editor
        .chain()
        .focus()
        .unsetMark("trackDelete")
        .deleteRange({ from: pos, to: pos + 1 })
        .run()
      return true
    }
  }
  return false
}

export function rejectChange(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(pos)
  const marks = $pos.marks()

  for (const mark of marks) {
    if (mark.type.name === "trackInsert") {
      editor
        .chain()
        .focus()
        .unsetMark("trackInsert")
        .deleteRange({ from: pos, to: pos + 1 })
        .run()
      return true
    }
    if (mark.type.name === "trackDelete") {
      editor.chain().focus().unsetMark("trackDelete").run()
      return true
    }
  }
  return false
}

export function acceptAllChanges(editor: Editor): void {
  const { doc } = editor.state
  for (let pos = 0; pos < doc.content.size; pos++) {
    const $pos = doc.resolve(Math.min(pos, doc.content.size - 1))
    for (const mark of $pos.marks()) {
      if (mark.type.name === "trackInsert" || mark.type.name === "trackDelete") {
        acceptChange(editor, pos)
        break
      }
    }
  }
}

export function rejectAllChanges(editor: Editor): void {
  const { doc } = editor.state
  for (let pos = 0; pos < doc.content.size; pos++) {
    const $pos = doc.resolve(Math.min(pos, doc.content.size - 1))
    for (const mark of $pos.marks()) {
      if (mark.type.name === "trackInsert" || mark.type.name === "trackDelete") {
        rejectChange(editor, pos)
        break
      }
    }
  }
}

export function nextChange(editor: Editor): boolean {
  const { from } = editor.state.selection
  const { doc } = editor.state

  for (let pos = from; pos < doc.content.size; pos++) {
    const $pos = doc.resolve(pos)
    for (const mark of $pos.marks()) {
      if (mark.type.name === "trackInsert" || mark.type.name === "trackDelete") {
        editor.commands.setTextSelection({ from: pos, to: pos + 1 })
        editor.commands.scrollIntoView()
        return true
      }
    }
  }
  return false
}
