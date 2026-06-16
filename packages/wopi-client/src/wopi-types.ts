/** Raw WOPI connection parameters extracted from URL or window config */
export interface WopiConnection {
  wopiFileId: string
  wopiAccessToken: string
  docserverBase: string
  format?: string
}

/** Response from WOPI CheckFileInfo endpoint */
export interface WopiFileInfo {
  BaseFileName?: string
  OwnerId?: string
  Size?: number
  Version?: string
  UserCanWrite?: boolean
  UserId?: string
  UserFriendlyName?: string
}
