import nspell from "nspell"
import type { SpellCheckerOptions, SpellCheckResult } from "./types"

type NSpellInstance = ReturnType<typeof nspell>

export class SpellChecker {
  private nspellInstance: NSpellInstance | null = null
  private enabled = true
  private currentLanguage: string
  private userWords: Set<string> = new Set()

  constructor(options: SpellCheckerOptions = {}) {
    this.currentLanguage = options.language ?? "en-US"
  }

  /** Load a Hunspell dictionary from aff/dic buffers. */
  async loadDictionary(aff: BufferSource, dic: BufferSource): Promise<void> {
    this.nspellInstance = nspell(aff, dic)
  }

  /** Check if a word is correctly spelled. */
  check(word: string): boolean {
    if (!this.enabled || !this.nspellInstance) return true
    if (this.userWords.has(word.toLowerCase())) return true
    return this.nspellInstance.correct(word)
  }

  /** Get spelling suggestions for a misspelled word. */
  suggest(word: string): string[] {
    if (!this.nspellInstance) return []
    const suggestions = this.nspellInstance.suggest(word)
    return suggestions.slice(0, 8)
  }

  /** Check a text segment and return all misspelled words with positions. */
  checkText(text: string): SpellCheckResult[] {
    if (!this.enabled || !this.nspellInstance) return []

    const results: SpellCheckResult[] = []
    const wordRegex = /\b[a-zA-Z\u00C0-\u024F]+\b/g
    let match: RegExpExecArray | null

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0]
      if (!this.check(word)) {
        results.push({
          word,
          offset: match.index,
          suggestions: this.suggest(word),
        })
      }
    }

    return results
  }

  /** Add a word to the user dictionary. */
  addToDictionary(word: string): void {
    this.userWords.add(word.toLowerCase())
  }

  /** Remove a word from the user dictionary. */
  removeFromDictionary(word: string): void {
    this.userWords.delete(word.toLowerCase())
  }

  /** Switch the active language. */
  setLanguage(lang: string): void {
    this.currentLanguage = lang
  }

  getLanguage(): string {
    return this.currentLanguage
  }

  /** Toggle spell checking on/off. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** Cleanup. */
  destroy(): void {
    this.nspellInstance = null
    this.userWords.clear()
  }
}
