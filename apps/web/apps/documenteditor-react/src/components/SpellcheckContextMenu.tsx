import { useEffect, useRef, useState } from "react"
import type { SpellChecker } from "@world-office/spellchecker"

interface SpellcheckContextMenuProps {
  spellchecker: SpellChecker | null
  editorElement: HTMLElement | null
  addToDictionary: (word: string) => void
}

interface MenuState {
  x: number
  y: number
  word: string
  suggestions: string[]
}

export function SpellcheckContextMenu({
  spellchecker,
  editorElement,
  addToDictionary,
}: SpellcheckContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const ignoredRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!editorElement) return

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const spellcheckEl = target.closest(".spellcheck-error") as HTMLElement | null
      if (!spellcheckEl) {
        setMenu(null)
        return
      }

      e.preventDefault()
      const word = spellcheckEl.getAttribute("data-word") || ""
      const suggestions = spellchecker?.suggest(word) ?? []

      setMenu({
        x: e.clientX,
        y: e.clientY,
        word,
        suggestions,
      })
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }

    editorElement.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("mousedown", handleClickOutside)

    return () => {
      editorElement.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [editorElement, spellchecker])

  if (!menu) return null

  return (
    <div
      ref={menuRef}
      className="spellcheck-context-menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.suggestions.length > 0 ? (
        menu.suggestions.slice(0, 5).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="spellcheck-suggestion"
            onMouseDown={(e) => {
              e.preventDefault()
              const sel = window.getSelection()
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0)
                const textNode = range.startContainer
                if (textNode.nodeType === Node.TEXT_NODE) {
                  const text = textNode.textContent || ""
                  const idx = text.toLowerCase().indexOf(menu.word.toLowerCase())
                  if (idx !== -1) {
                    const newRange = document.createRange()
                    newRange.setStart(textNode, idx)
                    newRange.setEnd(textNode, idx + menu.word.length)
                    newRange.deleteContents()
                    newRange.insertNode(document.createTextNode(suggestion))
                  }
                }
              }
              setMenu(null)
            }}
          >
            {suggestion}
          </button>
        ))
      ) : (
        <div style={{ padding: "6px 12px", color: "#999", fontSize: 13 }}>
          No suggestions
        </div>
      )}

      <div className="spellcheck-divider" />

      <button
        type="button"
        className="spellcheck-action"
        onMouseDown={(e) => {
          e.preventDefault()
          addToDictionary(menu.word)
          setMenu(null)
        }}
      >
        Add "{menu.word}" to dictionary
      </button>

      <button
        type="button"
        className="spellcheck-action"
        onMouseDown={(e) => {
          e.preventDefault()
          ignoredRef.current.add(menu.word.toLowerCase())
          setMenu(null)
        }}
      >
        Ignore
      </button>
    </div>
  )
}
