/** Pre-loaded dictionary store that receives aff/dic buffers directly. */
import type { DictionaryStore } from "./types"

export class PreloadedDictionaryStore implements DictionaryStore {
  private loaded = new Map<string, { aff: BufferSource; dic: BufferSource }>()

  add(locale: string, aff: BufferSource, dic: BufferSource): void {
    this.loaded.set(locale, { aff, dic })
  }

  async load(locale: string): Promise<{ aff: BufferSource; dic: BufferSource }> {
    const entry = this.loaded.get(locale)
    if (!entry) {
      throw new Error(`Dictionary not available for locale: ${locale}`)
    }
    return entry
  }

  isLoaded(locale: string): boolean {
    return this.loaded.has(locale)
  }

  availableLocales(): string[] {
    return Array.from(this.loaded.keys())
  }
}
