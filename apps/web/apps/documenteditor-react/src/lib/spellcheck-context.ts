import { createContext, useContext } from "react"
import type { SpellChecker } from "@world-office/spellchecker"

export interface SpellcheckContextValue {
  spellchecker: SpellChecker | null
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
