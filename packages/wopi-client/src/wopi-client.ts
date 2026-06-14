import type { WopiFileInfo, WopiConnection } from "./wopi-types"

const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
})

/**
 * Low-level WOPI HTTP client.
 * All methods are static — no state (the caller keeps WopiConnection).
 */
export class WopiClient {
  /**
   * Call CheckFileInfo to get document metadata.
   */
  static async checkFileInfo(conn: WopiConnection): Promise<WopiFileInfo> {
    const url = `${conn.docserverBase}/wopi/files/${conn.wopiFileId}`
    const res = await fetch(url, { headers: authHeaders(conn.wopiAccessToken) })
    if (!res.ok) {
      throw new Error(`WOPI CheckFileInfo failed: ${res.status}`)
    }
    return res.json() as Promise<WopiFileInfo>
  }

  /**
   * Call GetFile to download document content as a Blob.
   */
  static async getFile(conn: WopiConnection): Promise<Blob> {
    const url = `${conn.docserverBase}/wopi/files/${conn.wopiFileId}/contents`
    const res = await fetch(url, { headers: authHeaders(conn.wopiAccessToken) })
    if (!res.ok) {
      throw new Error(`WOPI GetFile failed: ${res.status}`)
    }
    return res.blob()
  }

  /**
   * Call PutFile to upload document content.
   */
  static async putFile(conn: WopiConnection, blob: Blob): Promise<void> {
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
  static async loadDocument(conn: WopiConnection): Promise<{
    info: WopiFileInfo
    content: Blob
  }> {
    const info = await WopiClient.checkFileInfo(conn)
    const content = await WopiClient.getFile(conn)
    return { info, content }
  }
}
