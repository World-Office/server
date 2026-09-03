// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createWordCommandHandler, type WordCommandDeps } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"
import type { CanvasEditorHandle } from "../components/CanvasEditor"
import type { WoCommand } from "@world-office/editor-common"

vi.mock("../stores/DocumentStore", () => ({
  documentStore: {
    toggleRuler: vi.fn(),
    toggleGridlines: vi.fn(),
    toggleNavigation: vi.fn(),
    setSpellingEnabled: vi.fn(),
    spellingEnabled: false,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setDifferentFirstPage: vi.fn(),
    differentFirstPage: false,
    setDifferentOddEven: vi.fn(),
    differentOddEven: false,
    clearHeader: vi.fn(),
    clearFooter: vi.fn(),
    headerFooterMode: "none",
    saveToWopi: vi.fn(),
    exportAsDownload: vi.fn(),
    toggleRightPanel: vi.fn(),
    pageOrientation: "portrait",
    pageSize: "A4",
    pageMargins: "normal",
  },
}))

describe("word-commands", () => {
  let deps: WordCommandDeps
  let editorHandle: CanvasEditorHandle
  let handler: ReturnType<typeof createWordCommandHandler>

  beforeEach(() => {
    vi.clearAllMocks()

    editorHandle = {
      applyFormatting: vi.fn(),
      applyStructureOp: vi.fn(),
    } as unknown as CanvasEditorHandle

    deps = {
      editorRef: { current: editorHandle },
      onRichTextCommand: vi.fn(),
      onFind: vi.fn(),
    }

    handler = createWordCommandHandler(deps)
  })

  describe("formatting commands", () => {
    it("should apply bold formatting", () => {
      handler({ command: "bold" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ bold: true })
    })

    it("should apply italic formatting", () => {
      handler({ command: "italic" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ italic: true })
    })

    it("should apply underline formatting (default single)", () => {
      handler({ command: "underline" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ underline: "single" })
    })

    it("should apply underline formatting with value", () => {
      handler({ command: "underline", value: "double" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ underline: "double" })
    })

    it("should apply strikethrough formatting", () => {
      handler({ command: "strike" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ strikethrough: true })
      handler({ command: "strikethrough" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ strikethrough: true })
    })

    it("should apply vertical alignment (sub/super)", () => {
      handler({ command: "subscript" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ verticalAlignment: "subscript" })
      handler({ command: "superscript" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ verticalAlignment: "superscript" })
    })

    it("should apply font size", () => {
      handler({ command: "fontSize", value: "12" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ fontSize: 24 })
      handler({ command: "fontSize" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ fontSize: 24 })
    })

    it("should apply font family", () => {
      handler({ command: "fontFamily", value: "Arial" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ fontName: "Arial" })
    })

    it("should apply text color", () => {
      handler({ command: "textColor", value: "#ff0000" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ textColor: "#ff0000" })
    })

    it("should apply highlight color", () => {
      handler({ command: "highlight", value: "yellow" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ highlight: "yellow" })
      handler({ command: "highlightColor", value: "green" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ highlight: "green" })
    })

    it("should clear formatting", () => {
      handler({ command: "clearFormatting" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ clearFormatting: true })
    })

    it("should apply alignment", () => {
      const aligns = [
        { cmd: "alignLeft", val: "left" },
        { cmd: "alignCenter", val: "center" },
        { cmd: "alignRight", val: "right" },
        { cmd: "alignJustify", val: "justify" },
      ]
      aligns.forEach(({ cmd, val }) => {
        handler({ command: cmd })
        expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ align: val })
      })
    })

    it("should apply heading levels", () => {
      for (let i = 1; i <= 6; i++) {
        handler({ command: `heading${i}` })
        expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ heading: i })
      }
    })

    it("should apply line spacing", () => {
      handler({ command: "lineSpacing", value: "1.5" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ lineSpacing: 360 })
      handler({ command: "lineSpacing" })
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ lineSpacing: 276 }) // default 1.15 * 240
    })
  })

  describe("structure operations", () => {
    it("should apply structure ops (lists, breaks, etc)", () => {
      const ops = [
        { cmd: "bulletList", op: "bullet-list" },
        { cmd: "bullet-list", op: "bullet-list" },
        { cmd: "orderedList", op: "ordered-list" },
        { cmd: "ordered-list", op: "ordered-list" },
        { cmd: "taskList", op: "task-list" },
        { cmd: "task-list", op: "task-list" },
        { cmd: "indent", op: "indent" },
        { cmd: "outdent", op: "outdent" },
        { cmd: "insertSectionBreak", op: "insert-section-break" },
        { cmd: "insert-section-break", op: "insert-section-break" },
        { cmd: "insertContinuousSectionBreak", op: "insert-continuous-section-break" },
        { cmd: "insert-continuous-section-break", op: "insert-continuous-section-break" },
        { cmd: "horizontalRule", op: "horizontal-rule" },
        { cmd: "horizontal-rule", op: "horizontal-rule" },
        { cmd: "pageBreak", op: "page-break" },
        { cmd: "page-break", op: "page-break" },
        { cmd: "blockquote", op: "blockquote" },
        { cmd: "codeBlock", op: "code-block" },
      ]
      ops.forEach(({ cmd, op }) => {
        handler({ command: cmd })
        expect(editorHandle.applyStructureOp).toHaveBeenCalledWith(op)
      })
    })

    it("should handle text direction", () => {
      handler({ command: "setTextDirection", value: "rtl" })
      expect(editorHandle.applyStructureOp).toHaveBeenCalledWith("set-text-direction-rtl")
      handler({ command: "setTextDirection", value: "ltr" })
      expect(editorHandle.applyStructureOp).toHaveBeenCalledWith("set-text-direction-ltr")
      handler({ command: "setTextDirection" })
      expect(editorHandle.applyStructureOp).toHaveBeenCalledWith("set-text-direction-ltr")
    })
  })

  describe("clipboard commands", () => {
    it("should handle copy", () => {
      const selection = { toString: () => "selected text" }
      vi.stubGlobal("getSelection", () => selection)
      const writeText = vi.fn()
      vi.stubGlobal("navigator", { clipboard: { writeText } })

      handler({ command: "copy" })
      expect(writeText).toHaveBeenCalledWith("selected text")
    })

    it("should handle paste", async () => {
      const readText = vi.fn().mockResolvedValue("pasted text")
      vi.stubGlobal("navigator", { clipboard: { readText } })

      handler({ command: "paste" })
      // Need to wait for the promise in the handler
      await vi.waitFor(() => {
        expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ insertText: "pasted text" })
      })
    })

    it("should handle cut", () => {
      const selection = { toString: () => "selected text" }
      vi.stubGlobal("getSelection", () => selection)
      const writeText = vi.fn()
      vi.stubGlobal("navigator", { clipboard: { writeText } })

      handler({ command: "cut" })
      expect(writeText).toHaveBeenCalledWith("selected text")
      expect(editorHandle.applyFormatting).toHaveBeenCalledWith({ insertText: "" })
    })
  })

  describe("edit history", () => {
    it("should dispatch rich text commands for undo/redo/selectAll", () => {
      const cmds = ["undo", "redo", "selectAll"]
      cmds.forEach(cmd => {
        handler({ command: cmd })
        expect(deps.onRichTextCommand).toHaveBeenCalledWith(cmd, undefined)
      })
    })
  })

  describe("store toggles", () => {
    it("should call documentStore methods for UI toggles", () => {
      handler({ command: "toggleRuler" })
      expect(documentStore.toggleRuler).toHaveBeenCalled()
      handler({ command: "toggleGridlines" })
      expect(documentStore.toggleGridlines).toHaveBeenCalled()
      handler({ command: "toggleNavigation" })
      expect(documentStore.toggleNavigation).toHaveBeenCalled()
      handler({ command: "toggleSpellCheck" })
      expect(documentStore.setSpellingEnabled).toHaveBeenCalled()
      handler({ command: "zoomIn" })
      expect(documentStore.zoomIn).toHaveBeenCalled()
      handler({ command: "zoomOut" })
      expect(documentStore.zoomOut).toHaveBeenCalled()
      handler({ command: "differentFirstPage" })
      expect(documentStore.setDifferentFirstPage).toHaveBeenCalled()
      handler({ command: "differentOddEven" })
      expect(documentStore.setDifferentOddEven).toHaveBeenCalled()
    })

    it("should handle header/footer commands", () => {
      handler({ command: "removeHeader" })
      expect(documentStore.clearHeader).toHaveBeenCalled()
      expect(documentStore.headerFooterMode).toBe("none")
      handler({ command: "removeFooter" })
      expect(documentStore.clearFooter).toHaveBeenCalled()
      expect(documentStore.headerFooterMode).toBe("none")
      handler({ command: "editHeader" })
      expect(documentStore.headerFooterMode).toBe("header")
      handler({ command: "editFooter" })
      expect(documentStore.headerFooterMode).toBe("footer")
      handler({ command: "insertPageNumber" })
      expect(documentStore.headerFooterMode).toBe("footer")
    })

    it("should handle save and download", () => {
      handler({ command: "save" })
      expect(documentStore.saveToWopi).toHaveBeenCalled()
      handler({ command: "download" })
      expect(documentStore.exportAsDownload).toHaveBeenCalled()
    })
  })

  describe("page layout events", () => {
    it("should dispatch page-layout custom event", () => {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent")
      
      handler({ command: "pageOrientation", value: "landscape" })
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: "world-office:page-layout",
        detail: expect.objectContaining({ orientation: "landscape" })
      }))

      handler({ command: "pageSize", value: "Letter" })
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: "world-office:page-layout",
        detail: expect.objectContaining({ pageSize: "Letter" })
      }))

      handler({ command: "pageMargins", value: "narrow" })
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: "world-office:page-layout",
        detail: expect.objectContaining({ margins: "narrow" })
      }))
    })

    it("should dispatch columns custom event", () => {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent")
      
      handler({ command: "columns", value: "3" })
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: "world-office:columns",
        detail: { count: 3 }
      }))
    })
  })

  describe("panel commands", () => {
    it("should handle find/replace", () => {
      handler({ command: "find" })
      expect(deps.onFind).toHaveBeenCalledWith(false)
      handler({ command: "replace" })
      expect(deps.onFind).toHaveBeenCalledWith(true)
    })

    it("should toggle right panels", () => {
      const panels = [
        { cmd: "addComment", panel: "comments" },
        { cmd: "toggleComment", panel: "comments" },
        { cmd: "image", panel: "image" },
        { cmd: "link", panel: "crossreference" },
        { cmd: "insertTable", panel: "table" },
        { cmd: "openTheme", panel: "theme" },
        { cmd: "insertPlainTextControl", panel: "form" },
        { cmd: "insertCheckboxControl", panel: "form" },
        { cmd: "insertDropdownControl", panel: "form" },
        { cmd: "insertDatePickerControl", panel: "form" },
      ]
      panels.forEach(({ cmd, panel }) => {
        handler({ command: cmd })
        expect(documentStore.toggleRightPanel).toHaveBeenCalledWith(panel)
      })
    })

    it("should toggle review panel for track changes", () => {
      const cmds = ["toggleTrackChanges", "acceptChange", "acceptAllChanges", "rejectChange", "rejectAllChanges", "nextChange"]
      cmds.forEach(cmd => {
        handler({ command: cmd })
        expect(documentStore.toggleRightPanel).toHaveBeenCalledWith("review")
      })
    })

    it("should toggle crossreference panel for references", () => {
      const cmds = ["insertFootnote", "insertEndnote", "insertToc", "updateToc", "insertIndex", "updateIndex", "insertIndexEntry"]
      cmds.forEach(cmd => {
        handler({ command: cmd })
        expect(documentStore.toggleRightPanel).toHaveBeenCalledWith("crossreference")
      })
    })
  })

  describe("unknown commands", () => {
    it("should log a warning for unknown commands and not throw", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      expect(() => handler({ command: "unknown-cmd" })).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[word-commands] unhandled command: unknown-cmd"))
      warnSpy.mockRestore()
    })
  })
})
