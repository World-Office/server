/**
 * History controller — manages document version history state.
 *
 * Tracks the currently selected revision, stores version history data,
 * and coordinates between the document server gateway and the editor API
 * via events. Replaces the Backbone-based Common.Controllers.History from
 * the legacy codebase.
 *
 * Events emitted on the local `historyBus`:
 *   - "revision-select"   — when a revision is selected for viewing
 *   - "restore"           — when a revision restore is requested
 *   - "close"             — when the user returns to the live document
 *   - "expand-toggle"     — when the expand/collapse all button is clicked
 *   - "highlight-toggle"  — when deleted-text highlighting is toggled
 *   - "hash-error"        — when incompatible changes are detected
 *   - "error"             — when history data loading fails
 *   - "data-request"      — when history data needs fetching from the server
 *
 * Events consumed from the global `notificationCenter`:
 *   - "sethistorydata"    — server response with revision URLs
 *   - "mentions:setusers" — user avatar updates
 */

import { type EventBus, createEventBus, notificationCenter } from "../core/event-bus"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single history revision record (mirrors the Backbone model fields). */
export interface HistoryRevision {
  revision: number
  changeid?: number
  arrColors?: unknown[]
  docId: string
  docIdPrev: string
  serverVersion: number
  userid: string
  username: string
  usercolor: string
  created: string
  documentSha256?: string
  url: string
  urlDiff?: string
  urlGetTime?: Date
  token?: string
  fileType?: string
  hasParent?: boolean
  hasSubItems?: boolean
  isExpanded?: boolean
  level?: number
  avatar?: string
}

/** Payload for `revision-select` event. */
export interface RevisionSelectEvent {
  revision: HistoryRevision
  /** When true the revision was selected programmatically (no URL yet). */
  requestNeeded: boolean
}

/** Payload for `restore` event. */
export interface RestoreEvent {
  revision: number
  url?: string
  fileType?: string
}

/** Payload for `error` event. */
export interface HistoryErrorEvent {
  title: string
  message: string
}

/** Events emitted by the history controller. */
export interface HistoryEvents {
  "revision-select": RevisionSelectEvent
  restore: RestoreEvent
  close: undefined
  "expand-toggle": boolean
  "highlight-toggle": boolean
  "hash-error": number
  error: HistoryErrorEvent
  "data-request": number
}

// ---------------------------------------------------------------------------
// Module-scoped state
// ---------------------------------------------------------------------------

/** Current revision tracking state (mirrors `initialize()` fields). */
let currentChangeId = -1
let currentArrColors: unknown[] = []
let currentDocId = ""
let currentDocIdPrev = ""
let currentRev = 0
let currentServerVersion = 0
let currentUserId = ""
let currentUserName = ""
let currentUserColor = ""
let currentDateCreated = ""
let currentDocumentSha256: string | undefined

/** Mode flags — set via `setMode()`. */
let canUseHistory = true
let canHistoryClose = true

/** In-flight revision restore tracking. */
let isFromSelectRevision: number | undefined

/** Throttle timer for history data requests. */
let timerId: ReturnType<typeof setTimeout> | 0 = 0

/** Stored revision records (replaces Backbone HistoryVersions collection). */
let revisions: HistoryRevision[] = []

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `str` is null, undefined, or empty.
 */
function isEmpty(str: string | undefined | null): boolean {
  return str == null || str.length === 0
}

/**
 * Finds all revision records matching a given revision number.
 */
function findRevisions(revision: number): HistoryRevision[] {
  return revisions.filter((r) => r.revision === revision)
}

/**
 * Checks whether the store contains at least one revision with sub-items
 * (i.e. change-tracking diffs).
 */
function hasChanges(): boolean {
  return revisions.some((r) => !!r.hasParent)
}

/**
 * Checks whether any top-level revision is collapsed.
 */
function hasCollapsed(): boolean {
  return revisions.some((r) => !!r.hasSubItems && !r.isExpanded)
}

// ---------------------------------------------------------------------------
// Event handlers — bridge from notification center
// ---------------------------------------------------------------------------

/**
 * Handles the `sethistorydata` event from the gateway.
 *
 * Processes the server response containing URLs for a requested revision,
 * updates the store, and emits the `revision-select` event so the editor
 * API can display the revision.
 */
function onSetHistoryData(opts: {
  data: {
    error?: string
    version?: number
    changesUrl?: string
    previous?: { url?: string; fileType?: string; key?: string }
    url?: string
    fileType?: string
    key?: string
    token?: string
  } | null
}): void {
  if (!canUseHistory) return

  if (timerId) {
    clearTimeout(timerId)
    timerId = 0
  }

  if (!opts.data || opts.data.error) {
    const message = opts.data?.error ? opts.data.error : "Failed to load version history"
    historyBus.emit("error", { title: "History Error", message })
    return
  }

  // Hide comments when switching revisions
  notificationCenter.emit("mentions:setusers", { type: "info", users: [] })

  const data = opts.data
  if (data == null) return

  const version = data.version ?? 0
  const matched = findRevisions(version)
  const urlGetTime = new Date()

  const diff = !data.previous || currentChangeId === undefined ? null : (data.changesUrl ?? null)
  const url = !isEmpty(diff) && data.previous ? (data.previous.url ?? "") : (data.url ?? "")
  const fileType = !isEmpty(diff) && data.previous ? data.previous.fileType : data.fileType
  const docId = data.key || currentDocId
  const docIdPrev = data.previous?.key || currentDocIdPrev
  const token = data.token

  // Update matched revision records with fetched URLs
  for (let i = 0; i < matched.length; i++) {
    const rev = matched[i]
    rev.url = url
    rev.urlDiff = diff ?? undefined
    rev.urlGetTime = urlGetTime
    if (data.key) {
      rev.docId = docId
      rev.docIdPrev = docIdPrev
    }
    rev.token = token ?? undefined
    if (fileType) rev.fileType = fileType
  }

  // Emit select event with all revision metadata
  historyBus.emit("revision-select", {
    revision: {
      revision: version,
      changeid: currentChangeId,
      arrColors: currentArrColors,
      docId,
      docIdPrev,
      serverVersion: currentServerVersion,
      userid: currentUserId,
      username: currentUserName,
      usercolor: currentUserColor,
      created: currentDateCreated,
      documentSha256: currentDocumentSha256,
      url,
      urlDiff: diff ?? undefined,
      token: token ?? undefined,
    },
    requestNeeded: false,
  })

  currentRev = version
}

/**
 * Updates avatar URLs on revision records when user info becomes available.
 */
function avatarsUpdate(type: string, users: Array<{ id: string; image?: string }>): void {
  if (type !== "info") return
  if (!users || users.length === 0) return

  for (const item of revisions) {
    const user = users.find((u) => u.id === item.userid)
    if (user && user.image !== undefined && user.image !== item.avatar) {
      item.avatar = user.image
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Local event bus for history-specific events. */
export const historyBus: EventBus<HistoryEvents> = createEventBus<HistoryEvents>()

/**
 * Initialises the history controller — subscribes to gateway events.
 *
 * Call this once during application startup.
 */
export function init(): void {
  notificationCenter.on("sethistorydata", onSetHistoryData as (...args: unknown[]) => void)
  notificationCenter.on("mentions:setusers", avatarsUpdate as (...args: unknown[]) => void)
}

/**
 * Resets all module state to initial values.
 */
export function reset(): void {
  currentChangeId = -1
  currentArrColors = []
  currentDocId = ""
  currentDocIdPrev = ""
  currentRev = 0
  currentServerVersion = 0
  currentUserId = ""
  currentUserName = ""
  currentUserColor = ""
  currentDateCreated = ""
  currentDocumentSha256 = undefined
  isFromSelectRevision = undefined
  timerId = 0
  revisions = []
}

/**
 * Sets the history mode flags.
 */
export function setMode(options: {
  canUseHistory?: boolean
  canHistoryClose?: boolean
}): void {
  if (options.canUseHistory !== undefined) canUseHistory = options.canUseHistory
  if (options.canHistoryClose !== undefined) canHistoryClose = options.canHistoryClose
}

/**
 * Replaces the stored revision list (e.g. after a store reset).
 */
export function updateHistory(newRevisions: HistoryRevision[]): void {
  revisions = newRevisions
}

/**
 * Requests history data from the server for a given revision number.
 *
 * Emits a `data-request` event on `historyBus` that the gateway layer
 * should listen to and translate into a `requestHistoryData()` call.
 */
export function requestHistoryData(revision: number): void {
  historyBus.emit("data-request", revision)
}

/**
 * Selects a revision for viewing.
 *
 * If the revision has no cached URL (or the cache is older than 5 minutes),
 * a data request is emitted. Otherwise a `revision-select` event is emitted
 * immediately with all metadata so the editor API can render it.
 */
export function selectRevision(record: HistoryRevision, fromButtonClick?: boolean): void {
  // Handle restore button click
  if (fromButtonClick && !record.hasParent) {
    historyBus.emit("restore", {
      revision: record.revision,
      url: undefined,
      fileType: record.fileType,
    })
    return
  }

  if (fromButtonClick && record.hasParent) {
    isFromSelectRevision = record.revision
    historyBus.emit("restore", {
      revision: record.revision,
      url: undefined,
      fileType: record.fileType,
    })
    return
  }

  const url = record.url
  const rev = record.revision
  const urlGetTime = new Date()

  // Persist current revision state
  currentChangeId = record.changeid ?? -1
  currentArrColors = record.arrColors ?? []
  currentDocId = record.docId
  currentDocIdPrev = record.docIdPrev
  currentRev = rev
  currentServerVersion = record.serverVersion
  currentUserId = record.userid
  currentUserName = record.username
  currentUserColor = record.usercolor
  currentDateCreated = record.created
  currentDocumentSha256 = record.documentSha256

  if (isEmpty(url) || urlGetTime.getTime() - (record.urlGetTime?.getTime() ?? 0) > 5 * 60000) {
    if (!timerId) {
      timerId = setTimeout(() => {
        timerId = 0
      }, 30000)
      setTimeout(() => {
        requestHistoryData(rev)
      }, 10)
    }
  } else {
    // Hide comments when switching revisions
    notificationCenter.emit("mentions:setusers", { type: "info", users: [] })

    historyBus.emit("revision-select", {
      revision: {
        ...record,
        changeid: currentChangeId,
        arrColors: currentArrColors,
        documentSha256: currentDocumentSha256,
      },
      requestNeeded: false,
    })
  }
}

/**
 * Handles the download URL callback from the editor API.
 *
 * If a revision restore is in flight, forwards the URL via the `restore` event.
 */
export function onDownloadUrl(url: string, fileType: string): void {
  if (isFromSelectRevision !== undefined) {
    historyBus.emit("restore", {
      revision: isFromSelectRevision,
      url,
      fileType,
    })
  }
  isFromSelectRevision = undefined
}

/**
 * Requests closing the history panel and returning to the live document.
 */
export function closeHistory(): void {
  historyBus.emit("close", undefined)
}

/**
 * Toggles expand/collapse all in the history list.
 *
 * @returns `true` if revisions are now expanded, `false` if collapsed.
 */
export function toggleExpandAll(): boolean {
  const needExpand = hasCollapsed()
  for (const r of revisions) {
    if (r.hasSubItems) r.isExpanded = needExpand
  }
  historyBus.emit("expand-toggle", needExpand)
  return needExpand
}

/**
 * Toggles deleted-text highlighting in version history.
 */
export function toggleHighlightDeleted(show: boolean): void {
  historyBus.emit("highlight-toggle", show)
}

/**
 * Handles hash mismatch errors — removes the incompatible sub-items
 * and re-selects the parent revision.
 */
export function onHashError(): void {
  revisions = revisions.filter((r) => !(r.revision === currentRev && r.level === 1))

  const rec = revisions.find((r) => r.revision === currentRev)
  if (rec) {
    rec.hasSubItems = false
    rec.changeid = undefined
    rec.documentSha256 = undefined
    rec.url = ""
    selectRevision(rec)
  }
  historyBus.emit("hash-error", currentRev)
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Returns the currently tracked revision number. */
export function getCurrentRev(): number {
  return currentRev
}

/** Returns the currently tracked document ID. */
export function getCurrentDocId(): string {
  return currentDocId
}

/** Returns whether history mode is enabled. */
export function getCanUseHistory(): boolean {
  return canUseHistory
}

/** Returns whether the close-history button should be shown. */
export function getCanHistoryClose(): boolean {
  return canHistoryClose
}

/** Returns a copy of the stored revisions array. */
export function getRevisions(): HistoryRevision[] {
  return [...revisions]
}

/** Returns whether any revision has change-tracking sub-items. */
export function getHasChanges(): boolean {
  return hasChanges()
}

/** Returns whether any top-level revision is currently collapsed. */
export function getHasCollapsed(): boolean {
  return hasCollapsed()
}
