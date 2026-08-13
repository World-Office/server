import { useCallback, useEffect, useRef, useState } from "react"
import type { WasmSpellChecker } from "../lib/spellcheck-context"

/** Full checker surface (control methods + WasmSpellChecker). */
interface WasmSpellCheckerFull extends WasmSpellChecker {
  isEnabled: () => boolean
  setEnabled: (v: boolean) => void
  setLanguage: (l: string) => void
  getLanguage: () => string
  destroy: () => void
}

/**
 * WASM spellchecker hook — replaces the nspell-based `@world-office/spellchecker`.
 *
 * Calls the `wo-spell` engine through WASM exports in `wo-renderer-wasm`:
 *
 * - `spell_load_dictionary(affBytes, dicBytes, lang)`
 * - `spell_check_word(word, lang)`
 * - `spell_suggest(word, lang)`
 * - `spell_check_text(text, lang)`
 * - `spell_add_to_user_dict(word, lang)`
 * - `spell_load_hyphenation(hyphBytes, lang)`
 * - `spell_hyphenate(word, lang)`
 * - `spell_release(lang)`
 *
 * The WASM module is loaded lazily from `wo-renderer-wasm`.
 */

export interface SpellCheckResult {
  word: string
  offset: number
  suggestions: string[]
}

export interface SpellcheckerState {
  spellchecker: WasmSpellChecker | null
  language: string
  enabled: boolean
  loading: boolean
  switchLanguage: (lang: string) => void
  toggleEnabled: () => void
  addToDictionary: (word: string) => void
  availableLanguages: string[]
}

const DICTIONARIES: Record<string, { aff: string; dic: string; hyph?: string }> = {
  "en-US": {
    aff: "/dictionaries/en-US.aff",
    dic: "/dictionaries/en-US.dic",
    hyph: "/dictionaries/en-US/hyph_en_US.dic",
  },
  "de-DE": {
    aff: "/dictionaries/de-DE.aff",
    dic: "/dictionaries/de-DE.dic",
  },
}

/** Lazy-loaded WASM module reference. */
let wasmModule:
  | typeof import("../../../../../../core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm")
  | null = null
let wasmLoadPromise: Promise<
  typeof import("../../../../../../core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm")
> | null = null

async function loadWasm(): Promise<
  typeof import("../../../../../../core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm")
> {
  if (wasmModule) return wasmModule
  if (!wasmLoadPromise) {
    wasmLoadPromise = import(
      /* @vite-ignore */
      "../../../../../../core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm"
    ) as Promise<
      typeof import("../../../../../../core/crates/wo-renderer-wasm/pkg/wo_renderer_wasm")
    >
    wasmLoadPromise.then((mod) => {
      wasmModule = mod
    })
  }
  return wasmLoadPromise
}

export function useSpellchecker(): SpellcheckerState {
  const [language, setLanguage] = useState("en-US")
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const checkerRef = useRef<WasmSpellCheckerFull | null>(null)

  const loadDictionary = useCallback(
    async (lang: string) => {
      const dict = DICTIONARIES[lang]
      if (!dict) return

      setLoading(true)
      try {
        const wasm = await loadWasm()

        // Load spell dictionary.
        const [affResp, dicResp] = await Promise.all([fetch(dict.aff), fetch(dict.dic)])
        const aff = new Uint8Array(await affResp.arrayBuffer())
        const dic = new Uint8Array(await dicResp.arrayBuffer())

        // Release previous dictionary for this language if already loaded.
        wasm.spell_release(lang)

        wasm.spell_load_dictionary(aff, dic, lang)

        // Optionally load hyphenation patterns.
        if (dict.hyph) {
          try {
            const hyphResp = await fetch(dict.hyph)
            const hyph = new Uint8Array(await hyphResp.arrayBuffer())
            wasm.spell_load_hyphenation(hyph, lang)
          } catch {
            // Hyphenation is optional — don't block spellchecking if it fails.
          }
        }

        checkerRef.current = {
          check: (word: string) => {
            if (!enabled) return true
            return wasm.spell_check_word(word, lang)
          },
          suggest: (word: string) => {
            try {
              const json = wasm.spell_suggest(word, lang)
              return JSON.parse(json)
            } catch {
              return []
            }
          },
          checkText: (text: string) => {
            if (!enabled) return []
            try {
              const json = wasm.spell_check_text(text, lang)
              return JSON.parse(json)
            } catch {
              return []
            }
          },
          addToDictionary: (word: string) => {
            wasm.spell_add_to_user_dict(word, lang)
          },
          hyphenate: (word: string) => {
            try {
              const json = wasm.spell_hyphenate(word, lang)
              return JSON.parse(json)
            } catch {
              return []
            }
          },
          isEnabled: () => enabled,
          setEnabled: (v: boolean) => setEnabled(v),
          setLanguage: (l: string) => setLanguage(l),
          getLanguage: () => lang,
          destroy: () => {
            wasm.spell_release(lang)
            checkerRef.current = null
          },
        }
      } catch (err) {
        console.error(`Failed to load WASM spellchecker for ${lang}:`, err)
      } finally {
        setLoading(false)
      }
    },
    [enabled],
  )

  useEffect(() => {
    loadDictionary(language)
  }, [language, loadDictionary])

  const switchLanguage = useCallback((lang: string) => {
    setLanguage(lang)
  }, [])

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => !prev)
  }, [])

  const addToDictionary = useCallback((word: string) => {
    checkerRef.current?.addToDictionary(word)
  }, [])

  return {
    spellchecker: checkerRef.current,
    language,
    enabled,
    loading,
    switchLanguage,
    toggleEnabled,
    addToDictionary,
    availableLanguages: Object.keys(DICTIONARIES),
  }
}
