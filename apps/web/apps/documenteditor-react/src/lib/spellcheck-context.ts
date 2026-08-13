import { createContext, useContext } from "react"

/**
 * Spellchecker surface provided by the WASM SP engine (wo-renderer-wasm).
 * Consumers only need check/suggest/checkText/hyphenate — the rich
 * nspell-based @world-office/spellchecker type was replaced by SP-1..SP-4.
 */
export interface WasmSpellChecker {
  check: (word: string) => boolean
  suggest: (word: string) => string[]
  checkText: (text: string) => Array<{ word: string; offset: number; suggestions: string[] }>
  addToDictionary: (word: string) => void
  hyphenate: (word: string) => number[]
  /** Optional control surface (full WASM checker provides it). */
  isEnabled?: () => boolean
}

export interface SpellcheckContextValue {
  spellchecker: WasmSpellChecker | null
  enabled: boolean
  loading: boolean
  language: string
  switchLanguage: (lang: string) => void
  toggleEnabled: () => void
  addToDictionary: (word: string) => void
  availableLanguages: string[]
}

export const SpellcheckContext = createContext<SpellcheckContextValue | null>(null)

export function useSpellcheck(): SpellcheckContextValue {
  const ctx = useContext(SpellcheckContext)
  if (!ctx) {
    return {
      spellchecker: null,
      enabled: false,
      loading: false,
      language: "en-US",
      switchLanguage: () => {},
      toggleEnabled: () => {},
      addToDictionary: () => {},
      availableLanguages: [],
    }
  }
  return ctx
}
