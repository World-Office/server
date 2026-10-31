/**
 * Word Commands Module
 * Track Changes and other Word-specific commands for the WO editor.
 *
 * This module defines command types and handlers for Word-like features
 * such as Track Changes, which are exposed via the wo-command event bus.
 */

/**
 * Represents a track change operation type
 */
export type TrackChangeType = "insert" | "delete" | "format"

/**
 * Metadata for a tracked change
 */
export interface TrackChangeMetadata {
  /** Unique identifier for this change */
  id: string
  /** Type of change: insert, delete, or format */
  type: TrackChangeType
  /** Author identifier */
  authorId: string
  /** Author display name */
  authorName: string
  /** Author color for visual distinction */
  authorColor: string
  /** Timestamp when the change was made (ISO string) */
  timestamp: string
  /** Whether this change has been accepted */
  accepted: boolean
}

/**
 * State of the track changes feature
 */
export interface TrackChangesState {
  /** Whether track changes is currently enabled */
  isTracking: boolean
  /** List of all tracked changes in the document */
  changes: TrackChangeMetadata[]
  /** Current author information */
  currentAuthor: {
    id: string
    name: string
    color: string
  }
}

/**
 * Command interface for Word-specific commands
 */
export interface WordCommand {
  /** Command name */
  name: string
  /** Optional value parameter */
  value?: unknown
}

/**
 * Command to toggle track changes on/off
 */
export const toggleTrackChanges: WordCommand = {
  name: "toggleTrackChanges",
}

/**
 * Command to accept all tracked changes
 */
export const acceptAllTrackedChanges: WordCommand = {
  name: "acceptAllTrackedChanges",
}

/**
 * Command to reject all tracked changes
 */
export const rejectAllTrackedChanges: WordCommand = {
  name: "rejectAllTrackedChanges",
}

/**
 * Command to insert a Table of Figures
 */
export const insertTableOfFigures: WordCommand = {
  name: "insertTableOfFigures",
}

/**
 * All Word command names
 */
export const WORD_COMMANDS = [
  "toggleTrackChanges",
  "acceptAllTrackedChanges",
  "rejectAllTrackedChanges",
  "acceptTrackedChange",
  "rejectTrackedChange",
  "prevTrackedChange",
  "nextTrackedChange",
  "insertTableOfFigures",
] as const

/**
 * Type representing all available Word command names
 */
export type WordCommandName = (typeof WORD_COMMANDS)[number]
