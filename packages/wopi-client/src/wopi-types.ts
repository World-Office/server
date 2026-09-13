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
  ReadOnly?: boolean
  UserId?: string
  UserFriendlyName?: string
}

/**
 * Decide editability from CheckFileInfo.
 *
 * OpenCloud mints VIEW_MODE_VIEW_ONLY for documents opened by click and then
 * omits UserCanWrite entirely (its CheckFileInfo sets the field only for
 * VIEW_MODE_READ_WRITE). Saving is NOT view-mode-gated server-side — the
 * underlying CS3 token carries the user's real permissions — so default to
 * editable unless the file info explicitly denies it (parity with the
 * pre-355af0f8 behavior, where isEditMode stayed false and editors were
 * always interactive).
 */
export function isEditable(info: WopiFileInfo): boolean {
  if (info.UserCanWrite !== undefined) {
    return info.UserCanWrite
  }
  return !(info.ReadOnly ?? false)
}
