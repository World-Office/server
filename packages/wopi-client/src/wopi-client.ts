import type { WopiConnection, WopiFileInfo } from "./wopi-types"

const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
})

/** Call CheckFileInfo to get document metadata. */
export async function checkFileInfo(conn: WopiConnection): Promise<WopiFileInfo> {
  const url = `${conn.docserverBase}/wopi/files/${conn.wopiFileId}`
  const res = await fetch(url, { headers: authHeaders(conn.wopiAccessToken) })
  if (!res.ok) {
    throw new Error(`WOPI CheckFileInfo failed: ${res.status}`)
  }
  return res.json() as Promise<WopiFileInfo>
}

/** Call GetFile to download document content as a Blob. */
export async function getFile(conn: WopiConnection): Promise<Blob> {
  let url = `${conn.docserverBase}/wopi/files/${conn.wopiFileId}/contents`
  if (conn.format) {
    url += `?format=${encodeURIComponent(conn.format)}`
  }
  const res = await fetch(url, { headers: authHeaders(conn.wopiAccessToken) })
  if (!res.ok) {
    throw new Error(`WOPI GetFile failed: ${res.status}`)
  }
  return res.blob()
}

/** Call PutFile to upload document content. */
export async function putFile(conn: WopiConnection, blob: Blob): Promise<void> {
  const url = `${conn.docserverBase}/wopi/files/${conn.wopiFileId}/contents`
  const headers: Record<string, string> = {
    ...authHeaders(conn.wopiAccessToken),
    "Content-Type": "application/octet-stream",
    "X-WOPI-Override": "PUT",
  }
  const res = await fetch(url, { method: "POST", headers, body: blob })
  if (!res.ok) {
    throw new Error(`WOPI PutFile failed: ${res.status}`)
  }
}

/**
 * Full load flow: CheckFileInfo + GetFile.
 * Returns metadata and the file blob.
 */
export async function loadDocument(conn: WopiConnection): Promise<{
  info: WopiFileInfo
  content: Blob
}> {
  const info = await checkFileInfo(conn)
  const content = await getFile(conn)
  return { info, content }
}
