# Track Changes Design Document

## Overview

This document describes the data model and architecture for implementing Track Changes functionality in the World Office (WO) document editor, achieving parity with OnlyOffice's track changes feature.

## Goals

1. Track insertions, deletions, and formatting changes with author metadata
2. Render revisions with visual markup (colored underlines/strikethrough)
3. Support accepting and rejecting changes individually or in bulk
4. Maintain change history for document collaboration
5. Provide navigation between tracked changes

## Data Model

### Core Types

#### TrackChangeMetadata
Represents metadata for a single tracked change:
- `id: string` - Unique identifier (UUID)
- `type: TrackChangeType` - Type of change: "insert", "delete", or "format"
- `authorId: string` - Unique identifier for the author
- `authorName: string` - Display name of the author
- `authorColor: string` - Color associated with the author for visual distinction
- `timestamp: string` - ISO 8601 timestamp when the change was made
- `accepted: boolean` - Whether the change has been accepted

#### TrackChangesState
Global state of the track changes feature:
- `isTracking: boolean` - Whether track changes is currently enabled
- `changes: TrackChangeMetadata[]` - Array of all tracked changes in the document
- `currentAuthor: {id, name, color}` - Information about the current user

### DOM Representation

Tracked changes are rendered in the document using HTML elements with specific classes:

- **Insertions**: `<ins class="track-insert" data-change-id="...">text</ins>`
- **Deletions**: `<del class="track-delete" data-change-id="...">text</del>`
- **Formatting changes**: `<span class="track-format" data-change-id="...">text</span>`

Each tracked element includes:
- `data-change-id` - Reference to the change metadata
- `data-author-id` - Author identifier
- `data-timestamp` - When the change was made
- `style="--author-color: #{hex}"` - CSS variable for author color

### Author Information

Authors are identified by a unique ID with associated metadata:
- Each collaborator in a document session has a unique author ID
- Author colors are pre-defined or generated deterministically from the author ID
- The current user's author information is set at session start

## Command Interface

The following commands are exposed via the `wo-command` event bus:

### toggleTrackChanges
Toggles the track changes feature on/off. When enabled, all subsequent edits are tracked.

**Event**: `wo-command` with detail `{command: "toggleTrackChanges"}`

**Behavior**:
- Toggles `trackChangesOn` state
- Updates UI (button aria-pressed, active class)
- Opens the track changes dialog for additional options

### acceptTrackedChange
Accepts the tracked change at the current selection/caret position.

**Event**: `wo-command` with detail `{command: "acceptTrackedChange"}`

**Behavior**:
- Finds the closest tracked change element (ins/del) to the selection
- Removes the tracking markup
- Marks the change as accepted in the state
- Updates the document

### rejectTrackedChange
Rejects the tracked change at the current selection/caret position.

**Event**: `wo-command` with detail `{command: "rejectTrackedChange"}`

**Behavior**:
- Finds the closest tracked change element
- For insertions: removes the inserted content
- For deletions: restores the deleted content
- Removes the change from the state
- Updates the document

### acceptAllTrackedChanges / rejectAllTrackedChanges
Accepts or rejects all tracked changes in the document at once.

**Event**: `wo-command` with detail `{command: "acceptAllTrackedChanges"}` or `{command: "rejectAllTrackedChanges"}`

### prevTrackedChange / nextTrackedChange
Navigates to the previous/next tracked change in the document.

**Event**: `wo-command` with detail `{command: "prevTrackedChange"}` or `{command: "nextTrackedChange"}`

## Visual Rendering

### Insertions
- Underlined with author's color
- Background highlight (optional, based on display mode)
- Tooltip showing author and timestamp

### Deletions
- Strikethrough with author's color
- Text remains visible but marked as deleted
- Tooltip showing author and timestamp

### Formatting Changes
- Special markers or highlights indicating format changes
- Less common than insert/delete, may use different visual treatment

## Display Modes

The editor supports different display modes for tracked changes:

1. **Simple Markup**: Shows insertions as underlined, deletions as strikethrough
2. **All Markup**: Shows all changes with maximum detail
3. **Final**: Shows the document as it will appear if all changes are accepted
4. **Original**: Shows the document as it was before any changes

## Integration with Existing Code

### Existing Infrastructure
The editor already has partial Track Changes support:
- `trackChangesOn` global state variable
- `setTrackChanges(on)` function to enable/disable tracking
- `btn-track-changes` button in the Collaboration tab
- `trackchanges-dialog` with enable/disable checkbox
- CSS classes `track-insert`, `track-delete`
- Status bar button (`sb-track-changes`)

### Required Additions
1. Create `lib/word-commands.ts` with command definitions
2. Add `toggleTrackChanges` handler in `runCommand()` in editor.js
3. Wire button to dispatch wo-command event (or keep existing dialog wiring)
4. Enhance change tracking to capture metadata (author, timestamp)
5. Render tracked changes with proper markup
6. Implement accept/reject logic with full state management

## Event Flow

```
User clicks Track Changes button
    ↓
Button dispatches wo-command event with toggleTrackChanges
    ↓
runCommand() handles toggleTrackChanges
    ↓
setTrackChanges(!currentState) is called
    ↓
State updated, UI refreshed, dialog opened
```

## State Persistence

Track changes state and metadata should be:
1. Maintained in memory during the editing session
2. Saved with the document (in a separate metadata layer)
3. Restored when the document is re-opened
4. Synced between collaborators in real-time

## Future Enhancements

1. Comparison between document versions
2. Combining multiple authors' changes
3. Locking track changes to prevent accidental edits
4. Change history panel with detailed view
5. Comments attached to specific changes
