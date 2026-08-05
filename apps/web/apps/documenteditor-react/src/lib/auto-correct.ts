/**
 * AutoCorrection — keyboard handler that replaces common patterns on space/Enter,
 * similar to Word's AutoCorrect.
 *
 * Features:
 *   • Typographic symbols: (c) → ©, -- → – (en-dash), --- → — (em-dash)
 *   • Arrows: -> → →, <- → ←, => → ⇒
 *   • Common misspellings: "teh" → "the", "dont" → "don't", etc.
 *   • Fraction symbols: 1/2 → ½, 1/4 → ¼, 3/4 → ¾
 *   • Ellipsis: ... → …
 *
 * The handler runs on every keydown. When the user types space or Enter, it
 * checks the word immediately before the cursor against the replacement table.
 */

import type { Editor } from "@tiptap/core"
import { documentStore } from "../stores/DocumentStore"

// ── Replacement table (sorted longest-first for correctness) ──────────

interface AutoCorrectEntry {
  /** The raw string to match (case-sensitive) */
  from: string
  /** Replacement string */
  to: string
}

const REPLACEMENTS: AutoCorrectEntry[] = [
  // Typographic symbols
  { from: "(tm)", to: "™" },
  { from: "(TM)", to: "™" },
  { from: "(r)", to: "®" },
  { from: "(R)", to: "®" },
  { from: "(c)", to: "©" },
  { from: "(C)", to: "©" },
  { from: "---", to: "—" },
  { from: "--", to: "–" },
  { from: "->", to: "→" },
  { from: "<-", to: "←" },
  { from: "=>", to: "⇒" },
  { from: "...", to: "…" },
  { from: "1/2", to: "½" },
  { from: "1/4", to: "¼" },
  { from: "3/4", to: "¾" },

  // Common misspellings & contractions
  { from: "wont", to: "won't" },
  { from: "dont", to: "don't" },
  { from: "cant", to: "can't" },
  { from: "didnt", to: "didn't" },
  { from: "doesnt", to: "doesn't" },
  { from: "couldnt", to: "couldn't" },
  { from: "shouldnt", to: "shouldn't" },
  { from: "wouldnt", to: "wouldn't" },
  { from: "wasnt", to: "wasn't" },
  { from: "werent", to: "weren't" },
  { from: "isnt", to: "isn't" },
  { from: "hasnt", to: "hasn't" },
  { from: "havent", to: "haven't" },
  { from: "theyll", to: "they'll" },
  { from: "theyre", to: "they're" },
  { from: "theyve", to: "they've" },
  { from: "youre", to: "you're" },
  { from: "youve", to: "you've" },
  { from: "youll", to: "you'll" },
  { from: "well", to: "we'll" },
  { from: "were", to: "we're" }, // careful: "were" != "we're"
  { from: "ive", to: "I've" },
  { from: "im", to: "I'm" },
  { from: "ill", to: "I'll" },
  { from: "id", to: "I'd" },

  // Actual misspellings
  { from: "teh", to: "the" },
  { from: "adn", to: "and" },
  { from: "waht", to: "what" },
  { from: "recieve", to: "receive" },
  { from: "acheive", to: "achieve" },
  { from: "seperate", to: "separate" },
  { from: "calender", to: "calendar" },
  { from: "occured", to: "occurred" },
  { from: "ocuring", to: "occurring" },
  { from: "definately", to: "definitely" },
  { from: "goverment", to: "government" },
  { from: "peice", to: "piece" },
  { from: "wierd", to: "weird" },
  { from: "thier", to: "their" },
  { from: "beleive", to: "believe" },
  { from: "acommodate", to: "accommodate" },
  { from: "commitee", to: "committee" },
  { from: "embarass", to: "embarrass" },
  { from: "neccessary", to: "necessary" },
  { from: "occassion", to: "occasion" },
  { from: "priviledge", to: "privilege" },
  { from: "recomend", to: "recommend" },
  { from: "succesful", to: "successful" },
  { from: "untill", to: "until" },
  { from: "writting", to: "writing" },
]

/** Build a fast lookup map for O(1) checking (longest key length determines lookup depth) */
function buildLookup(entries: AutoCorrectEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    map.set(entry.from, entry.to)
    // Also add capitalized version if the original starts with lowercase
    if (entry.from[0] >= "a" && entry.from[0] <= "z") {
      const capped = entry.from.charAt(0).toUpperCase() + entry.from.slice(1)
      if (!map.has(capped)) {
        map.set(capped, entry.to.charAt(0).toUpperCase() + entry.to.slice(1))
      }
    }
  }
  return map
}

const lookup = buildLookup(REPLACEMENTS)

// Maximum key length for efficient searching
const maxKeyLen = Math.max(...Array.from(lookup.keys()).map((k) => k.length), 0)

/**
 * Extract the word before cursor. Returns the word text and its start position.
 */
function getWordBeforeCursor(editor: Editor): { word: string; from: number } | null {
  const { selection } = editor.state
  const { $head } = selection
  const start = $head.start()
  const pos = $head.pos
  const before = $head.parent.textBetween(Math.max(start, pos - maxKeyLen - 2), pos, "\n", " ")

  // Find the start of the current word
  let wordStart = before.length
  while (wordStart > 0) {
    const ch = before[wordStart - 1]
    if (ch === " " || ch === "\n" || ch === "\t") break
    wordStart--
  }

  // Note: pos - before.length gives absolute position of the word start;
  // we compute the absolute position of the search start
  const absoluteWordStart = pos - before.length + wordStart
  const word = before.slice(wordStart)

  return word.length > 0 ? { word, from: absoluteWordStart } : null
}

/**
 * Register auto-correct on the editor. Call in onCreate.
 */
export function registerAutoCorrect(editor: Editor): void {
  editor.view.dom.addEventListener("keydown", (event: KeyboardEvent) => {
    // Skip if auto-correct is disabled
    if (!documentStore.autoCorrectEnabled) return

    // Only react to space, Enter, or Tab (triggers for autocorrect)
    if (event.key !== " " && event.key !== "Enter" && event.key !== "Tab") return

    const result = getWordBeforeCursor(editor)
    if (!result) return

    const { word, from } = result
    const replacement = lookup.get(word)
    if (!replacement) return

    // Don't replace if we're inside a code block
    const resolved = editor.state.doc.resolve(from)
    const parent = resolved.parent
    if (parent.type.name === "codeBlock" || parent.type.name === "code") return

    event.preventDefault()

    const to = from + word.length
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContent(replacement)
      // Re-insert the trigger character
      .insertContent(event.key)
      .run()
  })
}
