/** Result of checking a single word. */
export interface SpellCheckResult {
  word: string
  offset: number
  suggestions: string[]
}

/** Options for creating a SpellChecker instance. */
export interface SpellCheckerOptions {
  language?: string
  autoDetect?: boolean
}

/** Dictionary store interface for loading Hunspell dictionaries. */
export interface DictionaryStore {
  load(locale: string): Promise<{ aff: BufferSource; dic: BufferSource }>
  isLoaded(locale: string): boolean
  availableLocales(): string[]
}

/** User dictionary (custom words). */
export interface UserDictionary {
  has(word: string): boolean
  add(word: string): void
  remove(word: string): void
  words(): string[]
}
