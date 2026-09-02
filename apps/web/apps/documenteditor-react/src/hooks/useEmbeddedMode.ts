import { useEffect, useMemo } from "react"

function getEmbeddedConfig(): { embedded?: boolean } {
  const cfg = (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ as
    | { embedded?: boolean }
    | undefined
  return cfg ?? {}
}

export function isEmbeddedMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (params.get("embedded") === "true" || getEmbeddedConfig().embedded === true) {
    return true
  }
  // A WOPI session (access_token + file_id, as minted by the OpenCloud
  // collaboration service) is inherently an embedded editing session:
  // without this, autosave/Ctrl+S never arm and edits are lost on reload.
  return Boolean(params.get("access_token") && params.get("file_id"))
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
