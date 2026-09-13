import { useEffect, useMemo } from "react"

function getEmbeddedConfig(): { embedded?: boolean } {
  const cfg = (window as unknown as Record<string, unknown>).__WORLD_OFFICE_CONFIG__ as
    | { embedded?: boolean }
    | undefined
  return cfg ?? {}
}

export function explicitlyEmbedded(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get("embedded") === "true" || getEmbeddedConfig().embedded === true
}

export function isEmbeddedMode(): boolean {
  if (explicitlyEmbedded()) {
    return true
  }
  // A WOPI session (access_token + file_id, as minted by the OpenCloud
  // collaboration service) is inherently an embedded editing session:
  // without this, autosave/Ctrl+S never arm and edits are lost on reload.
  const params = new URLSearchParams(window.location.search)
  return Boolean(params.get("access_token") && params.get("file_id"))
}

export function useEmbeddedMode(
  setToolbarVisible: (visible: boolean) => void,
  setStatusbarVisible: (visible: boolean) => void,
  setLeftMenuVisible: (visible: boolean) => void,
  setRightMenuVisible: (visible: boolean) => void,
): { embedded: boolean } {
  const embedded = useMemo(() => isEmbeddedMode(), [])
  // Chrome is hidden only when the embedder explicitly opts out of the
  // editor-provided UI (embedded=true / config). A plain WOPI session keeps
  // the full chrome: the host (OpenCloud web) renders no toolbar of its own.
  const chromeless = useMemo(() => explicitlyEmbedded(), [])

  useEffect(() => {
    if (chromeless) {
      setToolbarVisible(false)
      setStatusbarVisible(false)
      setLeftMenuVisible(false)
      setRightMenuVisible(false)
    }
  }, [chromeless, setToolbarVisible, setStatusbarVisible, setLeftMenuVisible, setRightMenuVisible])

  return { embedded }
}
