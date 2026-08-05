import { useEffect, useMemo } from "react"

function getEmbeddedConfig(): { embedded?: boolean } {
  const cfg = (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ as
    | { embedded?: boolean }
    | undefined
  return cfg ?? {}
}

export function isEmbeddedMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get("embedded") === "true" || getEmbeddedConfig().embedded === true
}

export function useEmbeddedMode(
  setToolbarVisible: (visible: boolean) => void,
  setStatusbarVisible: (visible: boolean) => void,
  setLeftMenuVisible: (visible: boolean) => void,
  setRightMenuVisible: (visible: boolean) => void,
): { embedded: boolean } {
  const embedded = useMemo(() => isEmbeddedMode(), [])

  useEffect(() => {
    if (embedded) {
      setToolbarVisible(false)
      setStatusbarVisible(false)
      setLeftMenuVisible(false)
      setRightMenuVisible(false)
    }
  }, [embedded, setToolbarVisible, setStatusbarVisible, setLeftMenuVisible, setRightMenuVisible])

  return { embedded }
}
