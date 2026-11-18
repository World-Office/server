// @vitest-environment jsdom
/**
 * PGP-A4 — spellcheck context menu (OO ctx-contracts, misspelled rows).
 *
 * Covers the OO misspelled-word context contract (15 live-verified rows),
 * the suggestions block / session-ignore list behind the spellcheck rows,
 * the wo-command / browser-side dispatches behind the shared text rows,
 * and the setDocumentLanguage routing used by Select Language.
 */
import { act, createElement } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  SPELLCHECK_CONTEXT_CONTRACT_ROWS,
  SPELLCHECK_CONTEXT_ROWS,
  SpellcheckContextMenu,
  clearSpellcheckIgnores,
  ignoreWord,
  ignoreWordAll,
  isSpellcheckTarget,
  isWordIgnored,
  isWordIgnoredAll,
  runSpellcheckBrowserAction,
  spellcheckWordOf,
} from "../components/SpellcheckContextMenu"
import type { WasmSpellChecker } from "../lib/spellcheck-context"
import { createWordCommandHandler } from "../lib/word-commands"
import { documentStore } from "../stores/DocumentStore"

/**
 * Inline copy of the OO ctx-contract misspelled rows (live-verified
 * OO 9.4.0, see census/ctx-contracts.json → misspelled /
 * config/port-graph-parity/tasks.json → PGP-A4). Keeping the copy here
 * makes a contract change fail loudly instead of silently dropping rows.
 */
const OO_SPELLCHECK_CONTRACT_ROWS = [
  "Ignore",
  "IgnoreAll",
  "AddToDictionary",
  "SelectLanguage",
  "Cut",
  "Copy",
  "Paste",
  "PrintSelection",
  "PageBreakBefore",
  "KeepLines",
  "ParagraphSettings",
  "AddComment",
  "Link",
  "FormattingAsStyle",
  "AI",
] as const

const mounted: Array<ReturnType<typeof createRoot>> = []
const appended: HTMLElement[] = []
const woCommands: Array<{ command: string; value?: string }> = []

function recordWoCommand(e: Event): void {
  const detail = (e as CustomEvent<{ command: string; value?: string }>).detail
  woCommands.push({ command: detail.command, value: detail.value })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  woCommands.length = 0
  clearSpellcheckIgnores()
  window.addEventListener("wo-command", recordWoCommand)
})

afterEach(() => {
  window.removeEventListener("wo-command", recordWoCommand)
  for (const root of mounted.splice(0)) act(() => root.unmount())
  for (const el of appended.splice(0)) el.remove()
})

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  appended.push(container)
  const root = createRoot(container)
  act(() => root.render(node))
  mounted.push(root)
  return container
}

/** Stub WASM spellchecker surface — the menu only needs check/suggest. */
function fakeSpellchecker(suggestions: string[]): WasmSpellChecker {
  return {
    check: () => false,
    suggest: () => suggestions,
    checkText: () => [],
    addToDictionary: () => {},
    hyphenate: () => [],
  } as unknown as WasmSpellChecker
}

/**
 * Editor surface hosting a misspelled word plus the other context-menu
 * target types (plain text, an image, a table, a shape).
 */
function editorHost(): HTMLDivElement {
  const host = document.createElement("div")
  host.className = "rich-text-editor"
  host.innerHTML =
    '<p><span class="spellcheck-error" data-word="mispeld" id="misspelled">mispeld</span></p>' +
    '<p id="plain">plain paragraph</p>' +
    '<p><img id="pic" src="x.png" alt="pic" /> trailing text</p>' +
    '<table><tbody><tr><td id="in-table">cell text</td></tr></tbody></table>' +
    '<div class="wo-shape" data-wo-shape="true" data-shape-type="rect" id="shape"></div>'
  document.body.appendChild(host)
  appended.push(host)
  return host
}

const SUGGESTIONS = ["misspelled", "misplaced", "dispelled"]

interface MenuOptions {
  spellchecker?: WasmSpellChecker | null
  addToDictionary?: (word: string) => void
  onIgnore?: (word: string) => void
  onIgnoreAll?: (word: string) => void
}

/** Mount the menu and right-click on the misspelled word. */
function openMenuOnMisspelledWord(options: MenuOptions = {}): HTMLDivElement {
  const host = editorHost()
  const menuHost = mount(
    createElement(SpellcheckContextMenu, {
      spellchecker:
        options.spellchecker === undefined ? fakeSpellchecker(SUGGESTIONS) : options.spellchecker,
      editorElement: null,
      addToDictionary: options.addToDictionary ?? vi.fn(),
      onIgnore: options.onIgnore,
      onIgnoreAll: options.onIgnoreAll,
    }),
  )
  const misspelled = host.querySelector("#misspelled") as HTMLElement
  act(() => {
    misspelled.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 34 }),
    )
  })
  expect(menuHost.querySelector('[role="menu"]')).not.toBeNull()
  return menuHost
}

function menuItem(container: HTMLElement, rowId: string): HTMLButtonElement {
  const el = container.querySelector(`button[data-row-id="${rowId}"]`)
  expect(el, `menu row ${rowId}`).toBeDefined()
  return el as HTMLButtonElement
}

function rowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-row-id]")).map((el) =>
    el.getAttribute("data-row-id"),
  ) as string[]
}

describe("spellcheck ctx menu — OO contract coverage", () => {
  it("declares exactly the 15 live-verified OO misspelled rows", () => {
    expect(OO_SPELLCHECK_CONTRACT_ROWS).toHaveLength(15)
    expect(SPELLCHECK_CONTEXT_CONTRACT_ROWS).toEqual([...OO_SPELLCHECK_CONTRACT_ROWS])
    expect(SPELLCHECK_CONTEXT_ROWS.filter((row) => row.contract).map((row) => row.id)).toEqual([
      ...OO_SPELLCHECK_CONTRACT_ROWS,
    ])
  })

  it("renders every contract row (missing rows are listed, not dropped)", () => {
    const menu = openMenuOnMisspelledWord()
    const ids = rowIds(menu)
    const missing = OO_SPELLCHECK_CONTRACT_ROWS.filter((id) => !ids.includes(id))
    expect(missing).toEqual([])
  })

  it("renders the contract rows in OO's order", () => {
    const menu = openMenuOnMisspelledWord()
    const order = rowIds(menu).filter((id) =>
      (OO_SPELLCHECK_CONTRACT_ROWS as readonly string[]).includes(id),
    )
    expect(order).toEqual([...OO_SPELLCHECK_CONTRACT_ROWS])
  })

  it("shows the labels OO uses", () => {
    const menu = openMenuOnMisspelledWord()
    const text = menu.textContent ?? ""
    for (const label of [
      "Ignore",
      "Ignore All",
      "Add to Dictionary",
      "Select Language",
      "Cut",
      "Copy",
      "Paste",
      "Print Selection",
      "Page Break Before",
      "Keep Lines Together",
      "Paragraph Settings",
      "Add Comment",
      "Link",
      "Formatting as Style",
      "AI",
    ]) {
      expect(text).toContain(label)
    }
  })
})

describe("spellcheck ctx menu — trigger", () => {
  it("opens at the pointer position on right-click over a misspelled word", () => {
    const menu = openMenuOnMisspelledWord().querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.left).toBe("12px")
    expect(menu.style.top).toBe("34px")
  })

  it.each<[string, string]>([
    ["plain", "plain text (text menu owns it)"],
    ["pic", "images (image menu owns them)"],
    ["in-table", "table cells (table menu owns them)"],
    ["shape", "shapes (shape menu owns them)"],
  ])("stays closed for right-clicks on %s — %s", (elementId) => {
    const host = editorHost()
    const menuHost = mount(
      createElement(SpellcheckContextMenu, {
        spellchecker: fakeSpellchecker(SUGGESTIONS),
        editorElement: null,
        addToDictionary: vi.fn(),
      }),
    )
    act(() => {
      host.querySelector(`#${elementId}`)?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 5,
          clientY: 5,
        }),
      )
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()
  })

  it("isSpellcheckTarget only matches misspelled words, not text/image/table/shape", () => {
    const host = editorHost()
    expect(isSpellcheckTarget(host.querySelector("#misspelled"))).toBe(true)
    expect(isSpellcheckTarget(host.querySelector("#plain"))).toBe(false)
    expect(isSpellcheckTarget(host.querySelector("#pic"))).toBe(false)
    expect(isSpellcheckTarget(host.querySelector("#in-table"))).toBe(false)
    expect(isSpellcheckTarget(host.querySelector("#shape"))).toBe(false)
    expect(isSpellcheckTarget(null)).toBe(false)
  })

  it("spellcheckWordOf reads the data-word attribute off the decoration", () => {
    const host = editorHost()
    expect(spellcheckWordOf(host.querySelector("#misspelled"))).toBe("mispeld")
    expect(spellcheckWordOf(host.querySelector("#plain"))).toBe("")
    expect(spellcheckWordOf(null)).toBe("")
  })

  it("closes on Escape and on an outside mousedown", () => {
    const menuHost = openMenuOnMisspelledWord()
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()

    const secondHost = openMenuOnMisspelledWord()
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
    expect(secondHost.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("spellcheck ctx menu — suggestions block", () => {
  it("lists the spellchecker's suggestions above the contract rows", () => {
    const menu = openMenuOnMisspelledWord()
    const suggestions = Array.from(menu.querySelectorAll(".spellcheck-suggestion")).map(
      (el) => el.textContent,
    )
    expect(suggestions).toEqual(SUGGESTIONS)
    // suggestions render before the first contract row (OO lists them on top)
    const first = menu.querySelector("[data-row-id], .spellcheck-suggestion") as HTMLElement
    expect(first.className).toContain("spellcheck-suggestion")
  })

  it("caps the suggestion list at the OO maximum", () => {
    const menu = openMenuOnMisspelledWord({
      spellchecker: fakeSpellchecker(["a", "b", "c", "d", "e", "f", "g"]),
    })
    expect(menu.querySelectorAll(".spellcheck-suggestion")).toHaveLength(5)
  })

  it("clicking a suggestion replaces the misspelled word in the text", () => {
    const host = editorHost()
    const menuHost = mount(
      createElement(SpellcheckContextMenu, {
        spellchecker: fakeSpellchecker(["misspelled"]),
        editorElement: null,
        addToDictionary: vi.fn(),
      }),
    )
    const misspelled = host.querySelector("#misspelled") as HTMLElement
    act(() => {
      misspelled.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      )
    })
    // jsdom: put the caret on the misspelled text node so applySuggestion
    // can find it (the browser has one there from the right-click).
    const selection = window.getSelection()
    const paragraph = misspelled.parentElement as HTMLParagraphElement
    const range = document.createRange()
    range.selectNodeContents(misspelled.firstChild as Node)
    selection?.removeAllRanges()
    selection?.addRange(range)

    act(() => {
      ;(menuHost.querySelector(".spellcheck-suggestion") as HTMLButtonElement).click()
    })
    expect(paragraph.textContent).toBe("misspelled")
    expect(menuHost.querySelector('[role="menu"]')).toBeNull()
  })

  it("keeps the 'No suggestions' fallback when the engine has nothing", () => {
    const menu = openMenuOnMisspelledWord({ spellchecker: fakeSpellchecker([]) })
    expect(menu.textContent).toContain("No suggestions")
    expect(menu.querySelectorAll(".spellcheck-suggestion")).toHaveLength(0)
    // the contract rows still render under the fallback
    const missing = OO_SPELLCHECK_CONTRACT_ROWS.filter((id) => !rowIds(menu).includes(id))
    expect(missing).toEqual([])
  })

  it("renders the contract rows when no spellchecker is loaded", () => {
    const menu = openMenuOnMisspelledWord({ spellchecker: null })
    expect(menu.textContent).toContain("No suggestions")
    const missing = OO_SPELLCHECK_CONTRACT_ROWS.filter((id) => !rowIds(menu).includes(id))
    expect(missing).toEqual([])
  })
})

describe("spellcheck ctx menu — spellcheck rows", () => {
  it("Ignore session-ignores the word and notifies the host", () => {
    const onIgnore = vi.fn()
    const menu = openMenuOnMisspelledWord({ onIgnore })
    act(() => menuItem(menu, "Ignore").click())
    expect(onIgnore).toHaveBeenCalledWith("mispeld")
    expect(isWordIgnored("Mispeld")).toBe(true)
    // Ignore is occurrence-scoped — it does not hit the Ignore-All list
    expect(isWordIgnoredAll("mispeld")).toBe(false)
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })

  it("Ignore All session-ignores every occurrence of the word", () => {
    const onIgnoreAll = vi.fn()
    const menu = openMenuOnMisspelledWord({ onIgnoreAll })
    act(() => menuItem(menu, "IgnoreAll").click())
    expect(onIgnoreAll).toHaveBeenCalledWith("mispeld")
    expect(isWordIgnoredAll("mispeld")).toBe(true)
    expect(isWordIgnored("misPeld")).toBe(true)
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })

  it("Add to Dictionary hands the word to the spellcheck hook", () => {
    const addToDictionary = vi.fn()
    const menu = openMenuOnMisspelledWord({ addToDictionary })
    act(() => menuItem(menu, "AddToDictionary").click())
    expect(addToDictionary).toHaveBeenCalledWith("mispeld")
    expect(woCommands).toEqual([])
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })

  it("the session ignore helpers are case-insensitive and clearable", () => {
    expect(isWordIgnored("mispeld")).toBe(false)
    ignoreWord("Mispeld")
    expect(isWordIgnored("mispeld")).toBe(true)
    ignoreWordAll("Other")
    expect(isWordIgnoredAll("other")).toBe(true)
    clearSpellcheckIgnores()
    expect(isWordIgnored("mispeld")).toBe(false)
    expect(isWordIgnoredAll("other")).toBe(false)
  })

  it("spellcheck rows dispatch no wo-command", () => {
    const menu = openMenuOnMisspelledWord()
    act(() => menuItem(menu, "IgnoreAll").click())
    const second = openMenuOnMisspelledWord()
    act(() => menuItem(second, "Ignore").click())
    expect(woCommands).toEqual([])
  })
})

describe("spellcheck ctx menu — command rows", () => {
  it.each<[string, string]>([
    ["SelectLanguage", "setDocumentLanguage"],
    ["PageBreakBefore", "pageBreakBefore"],
    ["KeepLines", "keepLines"],
    ["ParagraphSettings", "paragraphSettings"],
    ["AddComment", "addComment"],
    ["Link", "link"],
    ["FormattingAsStyle", "formattingAsStyle"],
    ["AI", "aiAssistant"],
  ])("%s dispatches wo-command %s", (rowId, command) => {
    const menu = openMenuOnMisspelledWord()
    act(() => menuItem(menu, rowId).click())
    expect(woCommands).toEqual([{ command, value: undefined }])
    // choosing an action closes the menu (OO dismisses on select)
    expect(menu.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("spellcheck ctx menu — browser-side rows (Cut/Copy/Paste/Print)", () => {
  // jsdom ships no execCommand implementation — install a recording stub.
  const execCalls: string[] = []
  let previousExec: ((command: string, showUI?: boolean, value?: string) => boolean) | undefined

  beforeEach(() => {
    execCalls.length = 0
    previousExec = document.execCommand
    document.execCommand = (command: string) => {
      execCalls.push(command)
      return true
    }
  })

  afterEach(() => {
    if (previousExec === undefined) Reflect.deleteProperty(document as object, "execCommand")
    else document.execCommand = previousExec
  })

  it.each<[string, string]>([
    ["Cut", "cut"],
    ["Copy", "copy"],
    ["Paste", "paste"],
  ])("%s runs the native execCommand %s", (rowId, action) => {
    const menu = openMenuOnMisspelledWord()
    act(() => menuItem(menu, rowId).click())
    expect(execCalls).toEqual([action])
    expect(woCommands).toEqual([])
  })

  it("Print Selection prints natively", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    const menu = openMenuOnMisspelledWord()
    act(() => menuItem(menu, "PrintSelection").click())
    window.print = previous
    expect(print).toHaveBeenCalledTimes(1)
    expect(woCommands).toEqual([])
  })

  it("command rows use wo-command, not execCommand", () => {
    const menu = openMenuOnMisspelledWord()
    act(() => menuItem(menu, "AddComment").click())
    expect(execCalls).toEqual([])
    expect(woCommands).toEqual([{ command: "addComment", value: undefined }])
  })

  it("runSpellcheckBrowserAction covers all four browser rows", () => {
    const print = vi.fn()
    const previous = window.print
    window.print = print
    for (const action of ["cut", "copy", "paste"] as const) {
      expect(() => runSpellcheckBrowserAction(action)).not.toThrow()
    }
    runSpellcheckBrowserAction("print")
    window.print = previous
    expect(execCalls).toEqual(["cut", "copy", "paste"])
    expect(print).toHaveBeenCalledTimes(1)
  })
})

describe("spellcheck ctx menu — word-commands routing", () => {
  it("routes Select Language (setDocumentLanguage) to the document language store", () => {
    const handler = createWordCommandHandler({
      editorRef: { current: null },
      onRichTextCommand: vi.fn(),
    })
    const previous = documentStore.languageCode
    handler({ command: "setDocumentLanguage", value: "de-DE" })
    expect(documentStore.languageCode).toBe("de-DE")
    handler({ command: "setDocumentLanguage" })
    expect(documentStore.languageCode).toBe("en-US")
    documentStore.setLanguage(previous)
  })
})
