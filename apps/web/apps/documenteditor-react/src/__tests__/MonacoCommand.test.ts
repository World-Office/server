import { describe, expect, it, vi } from "vitest"
import {
  MONACO_COMMANDS,
  type MonacoCommand,
  dispatchMonacoCommand,
} from "../components/Toolbar/MonacoCommand"

interface MockEditor {
  trigger: ReturnType<typeof vi.fn>
  getAction: ReturnType<typeof vi.fn>
  getOption: ReturnType<typeof vi.fn>
  updateOptions: ReturnType<typeof vi.fn>
}

function createMockEditor(initialMinimap = false): {
  editor: MockEditor
  actionsRun: string[]
  minimapState: { enabled: boolean }
} {
  const minimapState = { enabled: initialMinimap }
  const actionsRun: string[] = []
  const editor: MockEditor = {
    trigger: vi.fn(),
    getAction: vi.fn((id: string) => ({
      run: () => {
        actionsRun.push(id)
      },
    })),
    getOption: vi.fn(() => ({ enabled: minimapState.enabled })),
    updateOptions: vi.fn((opts: { minimap: { enabled: boolean } }) => {
      minimapState.enabled = opts.minimap.enabled
    }),
  }
  return { editor, actionsRun, minimapState }
}

describe("dispatchMonacoCommand", () => {
  it("returns false when editor is null", () => {
    expect(dispatchMonacoCommand("undo", null)).toBe(false)
    expect(dispatchMonacoCommand("copy", null)).toBe(false)
    expect(dispatchMonacoCommand("toggleMinimap", null)).toBe(false)
  })

  it("undo and redo use editor.trigger with the toolbar source", () => {
    const { editor } = createMockEditor()
    expect(dispatchMonacoCommand("undo", editor as never)).toBe(true)
    expect(editor.trigger).toHaveBeenCalledWith("toolbar", "undo", null)
    expect(dispatchMonacoCommand("redo", editor as never)).toBe(true)
    expect(editor.trigger).toHaveBeenCalledWith("toolbar", "redo", null)
  })

  it("cut, copy, paste, selectAll run the matching editor actions", () => {
    const { editor, actionsRun } = createMockEditor()
    const expected: Array<[MonacoCommand, string]> = [
      ["cut", "editor.action.clipboardCutAction"],
      ["copy", "editor.action.clipboardCopyAction"],
      ["paste", "editor.action.clipboardPasteAction"],
      ["selectAll", "editor.action.selectAll"],
    ]
    for (const [command] of expected) {
      expect(dispatchMonacoCommand(command, editor as never)).toBe(true)
    }
    expect(actionsRun).toEqual(expected.map(([, id]) => id))
  })

  it("find and replace run the matching find actions", () => {
    const { editor, actionsRun } = createMockEditor()
    expect(dispatchMonacoCommand("find", editor as never)).toBe(true)
    expect(dispatchMonacoCommand("replace", editor as never)).toBe(true)
    expect(actionsRun).toEqual(["actions.find", "editor.action.startFindReplaceAction"])
  })

  it("formatDocument and toggleWordWrap run their actions", () => {
    const { editor, actionsRun } = createMockEditor()
    expect(dispatchMonacoCommand("formatDocument", editor as never)).toBe(true)
    expect(dispatchMonacoCommand("toggleWordWrap", editor as never)).toBe(true)
    expect(actionsRun).toEqual(["editor.action.formatDocument", "editor.action.toggleWordWrap"])
  })

  it("toggleMinimap flips the minimap state from off to on", () => {
    const { editor, minimapState } = createMockEditor(false)
    expect(dispatchMonacoCommand("toggleMinimap", editor as never)).toBe(true)
    expect(minimapState.enabled).toBe(true)
  })

  it("toggleMinimap flips the minimap state from on to off", () => {
    const { editor, minimapState } = createMockEditor(true)
    expect(dispatchMonacoCommand("toggleMinimap", editor as never)).toBe(true)
    expect(minimapState.enabled).toBe(false)
  })

  it("querying getOption for toggleMinimap uses the minimap option id (0)", () => {
    const { editor } = createMockEditor()
    dispatchMonacoCommand("toggleMinimap", editor as never)
    expect(editor.getOption).toHaveBeenCalledWith(0)
  })

  it("is a no-op when getAction returns undefined", () => {
    const editor: MockEditor = {
      trigger: vi.fn(),
      getAction: vi.fn(() => undefined),
      getOption: vi.fn(() => ({ enabled: false })),
      updateOptions: vi.fn(),
    }
    expect(dispatchMonacoCommand("cut", editor as never)).toBe(true)
    expect(dispatchMonacoCommand("copy", editor as never)).toBe(true)
    expect(editor.getAction).toHaveBeenCalled()
  })
})

describe("MONACO_COMMANDS", () => {
  it("covers every defined MonacoCommand value", () => {
    const allCommands: MonacoCommand[] = [
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll",
      "find",
      "replace",
      "formatDocument",
      "toggleMinimap",
      "toggleWordWrap",
    ]
    for (const cmd of allCommands) {
      expect(MONACO_COMMANDS).toContain(cmd)
    }
    expect(MONACO_COMMANDS).toHaveLength(allCommands.length)
  })
})
