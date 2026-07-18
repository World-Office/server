import {
  LocalStorageUserDict,
  PreloadedDictionaryStore,
  SpellChecker,
} from "@world-office/spellchecker"
import { useCallback, useEffect, useRef, useState } from "react"

const DICTIONARIES: Record<string, { aff: string; dic: string }> = {
  "en-US": { aff: "/dictionaries/en-US.aff", dic: "/dictionaries/en-US.dic" },
  "de-DE": { aff: "/dictionaries/de-DE.aff", dic: "/dictionaries/de-DE.dic" },
}

const userDict = new LocalStorageUserDict()

export function useSpellchecker() {
  const [spellchecker, setSpellchecker] = useState<SpellChecker | null>(null)
  const [language, setLanguage] = useState("en-US")
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const storeRef = useRef(new PreloadedDictionaryStore())

  const loadDictionary = useCallback(async (lang: string) => {
    const dict = DICTIONARIES[lang]
    if (!dict) return

    setLoading(true)
    try {
      const [affResp, dicResp] = await Promise.all([fetch(dict.aff), fetch(dict.dic)])
      const aff = await affResp.arrayBuffer()
      const dic = await dicResp.arrayBuffer()

      storeRef.current.add(lang, aff, dic)

      const checker = new SpellChecker({ language: lang })
      await checker.loadDictionary(aff, dic)
      setSpellchecker(checker)
    } catch (err) {
      console.error(`Failed to load dictionary ${lang}:`, err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDictionary(language)
  }, [language, loadDictionary])

  const switchLanguage = useCallback((lang: string) => {
    setLanguage(lang)
  }, [])

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => !prev)
  }, [])

  useEffect(() => {
    if (spellchecker) {
      spellchecker.setEnabled(enabled)
    }
  }, [spellchecker, enabled])

  const addToDictionary = useCallback(
    (word: string) => {
      userDict.add(word)
      if (spellchecker) {
        spellchecker.addToDictionary(word)
      }
    },
    [spellchecker],
  )

  return {
    spellchecker,
    language,
    enabled,
    loading,
    switchLanguage,
    toggleEnabled,
    addToDictionary,
    availableLanguages: Object.keys(DICTIONARIES),
  }
}
