import type { UserDictionary } from "./types"

const STORAGE_KEY = "wo-spellcheck-user-dict"

export class LocalStorageUserDict implements UserDictionary {
  private wordBank: string[] = []

  constructor() {
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    this.wordBank = stored ? JSON.parse(stored) : []
  }

  has(word: string): boolean {
    return this.wordBank.includes(word.toLowerCase())
  }

  add(word: string): void {
    if (!this.has(word)) {
      this.wordBank.push(word.toLowerCase())
    }
    this.persist()
  }

  remove(word: string): void {
    this.wordBank = this.wordBank.filter((w) => w !== word.toLowerCase())
    this.persist()
  }

  words(): string[] {
    return [...this.wordBank]
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.wordBank))
    } catch {
      /* localStorage may be full or unavailable */
    }
  }
}
