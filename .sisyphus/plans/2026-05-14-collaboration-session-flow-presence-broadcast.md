# Collaboration Session Flow & Presence Broadcast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the end-to-end session flow (AuthClient → session creation → WebSocket connect) and add ParticipantUpdate message protocol with server-side presence broadcast on connect/disconnect/cursor-move.

**Architecture:** Add `ParticipantUpdate` / `InitialState` message types to both client and server. On the server, track per-session presence broadcast channels and send initial CRDT state to new clients. On the client, wire the session creation REST calls before WebSocket connect and handle incoming presence events.

**Tech Stack:** TypeScript (collaboration-client, collaboration-react), Rust (coauthoring-service), diamond-types CRDT

---

## Task 1: Add ParticipantUpdate types to TypeScript protocol

**Files:**
- Modify: `packages/collaboration-client/src/protocol.ts`

- [ ] **Step 1: Add ParticipantUpdate interface and helpers**

Add after the existing `Participant` interface (around line 26):

```typescript
/** Participant update event types. */
export type ParticipantEvent = "joined" | "left" | "cursor_moved"

/**
 * A presence update sent over WebSocket when a participant joins, leaves,
 * or moves their cursor.
 */
export interface ParticipantUpdate {
  event: ParticipantEvent
  user_id: string
  username: string
  color: string
  cursor_position?: CursorPosition
}

/**
 * Initial state sent to a new WebSocket client upon connect, containing
 * the current CRDT document bytes and all current participants.
 */
export interface InitialState {
  crdt_bytes: Uint8Array
  participants: Participant[]
}

/**
 * Discriminated union for all messages received from the server over WebSocket.
 */
export type ServerMessage =
  | { type: "edit"; operation: EditOperation }
  | { type: "participant_update"; update: ParticipantUpdate }
  | { type: "initial_state"; state: InitialState }
```

- [ ] **Step 2: Add parseServerMessage helper**

Add after the existing `parseMessage` function (after line 135):

```typescript
/** Parse a JSON string into a ServerMessage, or return null if invalid. */
export function parseServerMessage(json: string): ServerMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const obj = parsed as Record<string, unknown>

  if (obj.type === "edit" && typeof obj.operation === "object") {
    return { type: "edit", operation: obj.operation as EditOperation }
  }
  if (obj.type === "participant_update" && typeof obj.update === "object") {
    return { type: "participant_update", update: obj.update as ParticipantUpdate }
  }
  if (obj.type === "initial_state" && typeof obj.state === "object") {
    return { type: "initial_state", state: obj.state as InitialState }
  }

  return null
}

/** Create a participant update for cursor movement. */
export function createCursorUpdate(params: {
  session_id: string
  user_id: string
  username: string
  color: string
  cursor_position: CursorPosition
}): ParticipantUpdate {
  return {
    event: "cursor_moved",
    user_id: params.user_id,
    username: params.username,
    color: params.color,
    cursor_position: params.cursor_position,
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/weiss/git/World-Office/server && pnpm typecheck --filter collaboration-client 2>&1 | tail -20`

Expected: PASS (no new errors)

- [ ] **Step 4: Commit**

```bash
cd /home/weiss/git/World-Office/server
git add packages/collaboration-client/src/protocol.ts
git commit -m "feat(collaboration): add ParticipantUpdate and InitialState protocol types"
```

---

## Task 2: Add participant events to WebSocketManager

**Files:**
- Modify: `packages/collaboration-client/src/client.ts`

- [ ] **Step 1: Add participant_update to WebSocketManagerEvents**

Replace the existing `WebSocketManagerEvents` interface (around line 23):

```typescript
export interface WebSocketManagerEvents {
  open: () => void
  close: (event: { code: number; reason: string; wasClean: boolean }) => void
  error: (event: Event) => void
  operation: (op: EditOperation) => void
  participantUpdate: (update: ParticipantUpdate) => void
  initialState: (state: InitialState) => void
  stateChange: (state: ConnectionState) => void
}
```

Also add imports at the top:
```typescript
import {
  type EditOperation,
  createInsertOp,
  createDeleteOp,
  parseMessage,
  isRemoteMessage,
  type ParticipantUpdate,
  type InitialState,
  parseServerMessage,
} from "./protocol"
```

- [ ] **Step 2: Update handleMessage to route participant_update and initial_state**

Replace the `handleMessage` method (around line 197):

```typescript
private handleMessage(data: string): void {
  const serverMsg = parseServerMessage(data)
  if (!serverMsg) return

  if (serverMsg.type === "edit") {
    // Filter out own messages
    if (!isRemoteMessage(serverMsg.operation, this.userId)) return
    this.emit("operation", serverMsg.operation)
  } else if (serverMsg.type === "participant_update") {
    this.emit("participantUpdate", serverMsg.update)
  } else if (serverMsg.type === "initial_state") {
    this.emit("initialState", serverMsg.state)
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/weiss/git/World-Office/server && pnpm typecheck --filter collaboration-client 2>&1 | tail -20`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /home/weiss/git/World-Office/server
git add packages/collaboration-client/src/client.ts
git commit -m "feat(collaboration): add participant events to WebSocketManager"
```

---

## Task 3: Wire session flow in useCollaboration hook

**Files:**
- Modify: `packages/collaboration-react/src/hooks/useCollaboration.ts`

- [ ] **Step 1: Read the current file to understand exact content**

Read: `packages/collaboration-react/src/hooks/useCollaboration.ts`

- [ ] **Step 2: Add new options and state for session flow**

Replace the `UseCollaborationOptions` and `UseCollaborationResult` interfaces, and update the `useCollaboration` function to:

```typescript
export interface UseCollaborationOptions {
  wsUrl: string
  userId: string
  username: string
  collaborationStore: CollaborationStore | null
  /** Pre-created session ID from storage-service. If not provided, a new session is created. */
  sessionId?: string
  /** REST API base URLs */
  sessionServiceUrl?: string   // e.g. "http://localhost:8001"
  coauthoringServiceUrl?: string // e.g. "http://localhost:8004"
  onRemoteOperation?: (op: EditOperation) => void
  /** Called when a remote participant joins, leaves, or moves cursor. */
  onParticipantUpdate?: (update: ParticipantUpdate) => void
  /** Called when initial state arrives (CRDT bytes + participant list). */
  onInitialState?: (state: InitialState) => void
}
```

Also add import for `AuthClient`:
```typescript
import { WebSocketManager, type ConnectionState, type EditOperation, type ParticipantUpdate, type InitialState } from "@world-office/collaboration-client"
import { AuthClient } from "@world-office/collaboration-client/src/auth"
import type { CollaborationStore } from "@world-office/editor-stores"
```

- [ ] **Step 3: Rewrite the connect function to wire session flow**

Replace the existing `connect` callback (in the `useCollaboration` function):

```typescript
const connect = useCallback(async () => {
  const {
    sessionId: preCreatedSessionId,
    userId,
    username,
    sessionServiceUrl = "http://localhost:8001",
    coauthoringServiceUrl = "http://localhost:8004",
    wsUrl,
  } = options

  try {
    // Step 1: Get or create session via coauthoring-service REST API
    let resolvedSessionId = preCreatedSessionId
    if (!resolvedSessionId) {
      // No pre-created session — create one via coauthoring-service (POST /sessions)
      const createResp = await fetch(`${coauthoringServiceUrl}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: "default-doc" }), // Document ID must come from context in real usage
      })
      if (!createResp.ok) throw new Error("Failed to create session")
      const { session_id } = await createResp.json() as { session_id: string }
      resolvedSessionId = session_id
    }

    // Step 2: Authenticate with session-service to get JWT
    const authClient = new AuthClient(sessionServiceUrl)
    const { accessToken } = await authClient.createSession({
      userId,
      username,
    })

    // Step 3: Join session via coauthoring-service REST (assigns color, registers presence)
    await fetch(`${coauthoringServiceUrl}/sessions/${resolvedSessionId}/join`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, username }),
    })

    // Step 4: Construct WebSocket URL with session_id, connect with token
    // Build the actual WS URL using the session_id
    const wsUrlWithSession = wsUrl.replace("{session_id}", resolvedSessionId)
    const manager = getOrCreateManager(wsUrlWithSession, accessToken)

    // Wire up participant update handler
    manager.on("participantUpdate", (update: ParticipantUpdate) => {
      options.collaborationStore?.setParticipants(
        update.event === "joined"
          ? [...(options.collaborationStore.getState().participants ?? []), { user_id: update.user_id, username: update.username, color: update.color, cursor_position: update.cursor_position ?? null }]
          : (update.event === "left"
              ? (options.collaborationStore.getState().participants ?? []).filter(p => p.user_id !== update.user_id)
              : (options.collaborationStore.getState().participants ?? []).map(p => p.user_id === update.user_id ? { ...p, cursor_position: update.cursor_position ?? null } : p))
      )
      options.onParticipantUpdate?.(update)
    })

    manager.on("initialState", (state: InitialState) => {
      options.onInitialState?.(state)
    })

    manager.connect(resolvedSessionId, accessToken)
  } catch (err) {
    console.error("[useCollaboration] connect failed:", err)
  }
}, [/* deps */])
```

**Note:** The `getOrCreateManager` callback must be updated to accept `accessToken` and pass it to `WebSocketManager`. The `WebSocketManager` must be updated to accept a token.

Also update `getOrCreateManager` to store the token:
```typescript
const getOrCreateManager = useCallback((url: string, token?: string): WebSocketManager => {
  if (!managerRef.current) {
    const manager = new WebSocketManager({
      url,
      userId,
      token,  // NEW: pass token
      autoReconnect: true,
    })
    // ... existing setup
  }
  return managerRef.current
}, [/* deps */])
```

- [ ] **Step 4: Add token field to WebSocketManagerOptions and constructor**

Add to `WebSocketManagerOptions` (around line 31):
```typescript
export interface WebSocketManagerOptions {
  url: string
  userId: string
  sessionId?: string
  token?: string  // NEW: JWT access token
  autoReconnect?: boolean
  backoff?: ConstructorParameters<typeof BackoffStrategy>[0]
}
```

Add to `WebSocketManager` constructor (around line 61):
```typescript
constructor(options: WebSocketManagerOptions) {
  this.url = options.url
  this.userId = options.userId
  this.sessionId = options.sessionId ?? this.extractSessionId(options.url)
  this.token = options.token  // NEW
  this.autoReconnect = options.autoReconnect ?? true
  this.backoff = new BackoffStrategy(options.backoff)
}
```

And add `private readonly token: string | undefined` as a field.

- [ ] **Step 5: Use token when connecting**

In `connect()` method (around line 122), when creating the WebSocket, attach the token as a query parameter (standard browser WebSocket doesn't support custom headers, so use URL query param):

```typescript
connect(sessionId?: string, token?: string): void {
  if (this.ws && ...) return

  this.setState("connecting")

  // Build URL with token as query param if provided
  const actualUrl = token
    ? `${this.url}${this.url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
    : this.url
  this.ws = new WebSocket(actualUrl)
  // ... rest unchanged
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /home/weiss/git/World-Office/server && pnpm typecheck 2>&1 | tail -30`

Expected: PASS (resolve any type errors)

- [ ] **Step 7: Commit**

```bash
cd /home/weiss/git/World-Office/server
git add packages/collaboration-react/src/hooks/useCollaboration.ts
git commit -m "feat(collaboration): wire session flow in useCollaboration hook"
```

---

## Task 4: Add ParticipantUpdate and InitialState types to Rust server

**Files:**
- Modify: `services/coauthoring-service/src/main.rs`

- [ ] **Step 1: Add new message types after the existing EditOperation struct (around line 64)**

```rust
/// A participant update event sent over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ParticipantUpdate {
    #[serde(rename = "type")]
    event: ParticipantEvent,
    user_id: String,
    username: String,
    color: String,
    cursor_position: Option<CursorPos>,
}

/// The event type for a participant update.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ParticipantEvent {
    Joined,
    Left,
    CursorMoved,
}

/// Initial state sent to a new WebSocket client upon connect.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct InitialState {
    crdt_bytes: Vec<u8>,
    participants: Vec<Participant>,
}

/// The top-level WebSocket message enum, replacing the raw-string broadcast.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WsMessage {
    Edit { operation: EditOperation },
    ParticipantUpdate { update: ParticipantUpdate },
}
```

Note: `Participant` and `EditorSession` are already defined (lines 36-42, 25-33). `ParticipantUpdate` references them.

- [ ] **Step 2: Update AppState to track presence channels**

Find `AppState` struct (around line 269) and add:

```rust
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<SessionRepository>>,
    /// Broadcast channels per session for real-time edits (ephemeral, not persisted).
    edit_channels: Arc<Mutex<HashMap<String, broadcast::Sender<String>>>>,
    /// Broadcast channels per session for presence updates (joined/left/cursor).
    presence_channels: Arc<Mutex<HashMap<String, broadcast::Sender<ParticipantUpdate>>>>,
    /// Collaborative documents per session, backed by diamond-types CRDT.
    documents: Arc<Mutex<HashMap<String, Document>>>,
}
```

- [ ] **Step 3: Create presence channel when session is created**

In `create_session` function (around line 369), after creating the edit broadcast channel:

```rust
// Create ephemeral presence broadcast channel for this session
let (presence_tx, _) = broadcast::channel::<ParticipantUpdate>(256);
{
    let mut presence_channels = state.presence_channels.lock().await;
    presence_channels.insert(session_id.clone(), presence_tx);
}
```

And update `main()` where `AppState` is constructed (around line 621):

```rust
let state = Arc::new(AppState {
    sessions: Arc::new(Mutex::new(repo)),
    edit_channels: Arc::new(Mutex::new(HashMap::new())),
    presence_channels: Arc::new(Mutex::new(HashMap::new())),
    documents: Arc::new(Mutex::new(HashMap::new())),
});
```

- [ ] **Step 4: Rewrite handle_ws to support presence events**

The `handle_ws` function (starting at line 523) needs substantial changes. Here is the new implementation:

```rust
async fn handle_ws(mut socket: WebSocket, state: Arc<AppState>, session_id: String, user_id: String, username: String) {
    // Get presence channel subscriber
    let presence_rx = {
        let channels = state.presence_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let mut presence_rx = match presence_rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    // Subscribe to presence updates and forward them to this client
    let rx = {
        let channels = state.edit_channels.lock().await;
        channels.get(&session_id).map(|tx| tx.subscribe())
    };

    let mut rx = match rx {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    format!(r#"{{"error":"Session {} not found"}}"#, session_id).into(),
                ))
                .await;
            return;
        }
    };

    tracing::info!(session_id = %session_id, user_id = %user_id, "WebSocket connected");

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Clone presence_tx for the send task so we can broadcast Joined/Left
    let presence_tx = {
        let channels = state.presence_channels.lock().await;
        channels.get(&session_id).cloned()
    };

    // Send InitialState to new client
    {
        let docs = state.documents.lock().await;
        if let Some(doc) = docs.get(&session_id) {
            let doc_bytes = doc.crdt.oplog.encode(EncodeOptions::default());
            // Get participants from the session repository
            let repo = state.sessions.lock().await;
            if let Ok(Some(session)) = repo.get(&session_id) {
                let initial_state = InitialState {
                    crdt_bytes: doc_bytes,
                    participants: session.participants.clone(),
                };
                let msg = serde_json::to_string(&initial_state).unwrap();
                let _ = ws_sender.send(Message::Text(msg.into())).await;
            }
        }
    }

    // Broadcast Joined to all OTHER clients
    if let Some(ref tx) = presence_tx {
        let joined = ParticipantUpdate {
            event: ParticipantEvent::Joined,
            user_id: user_id.clone(),
            username: username.clone(),
            color: "#E74C3C".to_string(), // TODO: use actual color from join_session result
            cursor_position: None,
        };
        let _ = tx.send(joined);
    }

    // Forward presence updates to this client
    let recv_task = tokio::spawn(async move {
        while let Ok(_) = presence_rx.recv().await {
            // Receive presence updates and forward as WebSocket messages
            if let Ok(presence) = presence_rx.try_recv() {
                let msg = serde_json::to_string(&presence).unwrap();
                if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Also forward edit broadcasts
    let edit_recv_task = tokio::spawn(async move {
        while let Ok(_) = rx.recv().await {
            if let Ok(text) = rx.try_recv() {
                if ws_sender.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Read messages from this client
    while let Some(Ok(msg)) = ws_receiver.next().await {
        if let Message::Text(text) = msg {
            // Try to parse as WsMessage (new structured format) or legacy EditOperation
            if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                match ws_msg {
                    WsMessage::Edit { operation } => {
                        let applied = {
                            let mut docs = state.documents.lock().await;
                            if let Some(doc) = docs.get_mut(&session_id) {
                                doc.apply_edit(&operation).is_ok()
                            } else {
                                false
                            }
                        };
                        if !applied { continue; }
                        // Broadcast to edit channel
                        let channels = state.edit_channels.lock().await;
                        if let Some(tx) = channels.get(&session_id) {
                            let _ = tx.send(text.to_string());
                        }
                    }
                    WsMessage::ParticipantUpdate { update } => {
                        // Broadcast to all OTHER clients via presence channel
                        if let Some(ref tx) = presence_tx {
                            let _ = tx.send(update);
                        }
                    }
                }
            } else {
                // Legacy: try as raw EditOperation JSON (backwards compat)
                if let Ok(edit_op) = serde_json::from_str::<EditOperation>(&text) {
                    let applied = {
                        let mut docs = state.documents.lock().await;
                        if let Some(doc) = docs.get_mut(&session_id) {
                            doc.apply_edit(&edit_op).is_ok()
                        } else {
                            false
                        }
                    };
                    if !applied { continue; }
                    let channels = state.edit_channels.lock().await;
                    if let Some(tx) = channels.get(&session_id) {
                        let _ = tx.send(text.to_string());
                    }
                }
            }
        }
    }

    recv_task.abort();
    edit_recv_task.abort();

    // Broadcast Left to remaining clients
    if let Some(ref tx) = presence_tx {
        let left = ParticipantUpdate {
            event: ParticipantEvent::Left,
            user_id: user_id.clone(),
            username: username.clone(),
            color: "#E74C3C".to_string(),
            cursor_position: None,
        };
        let _ = tx.send(left);
    }

    tracing::info!(session_id = %session_id, user_id = %user_id, "WebSocket disconnected");
}
```

**Important:** The `handle_ws` function signature changes — it now takes `user_id` and `username`. These must be passed from the WebSocket upgrade. For now, extract them from the request (you may need to pass them via query params or headers). The simplest approach for this implementation is to accept them as query parameters `?user_id=xxx&username=yyy` in the WebSocket URL.

Update the `ws_upgrade` handler (around line 514):

```rust
async fn ws_upgrade(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,  // NEW
    ws: WebSocketUpgrade,
) -> impl axum::response::IntoResponse {
    let user_id = params.get("user_id").cloned().unwrap_or_else(|| "anonymous".to_string());
    let username = params.get("username").cloned().unwrap_or_else(|| "Anonymous".to_string());
    ws.on_upgrade(move |socket| handle_ws(socket, state, session_id, user_id, username))
}
```

Add the Query extractor import:
```rust
use axum::extract::Query;
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd /home/weiss/git/World-Office/server && cargo check -p coauthoring-service 2>&1 | tail -30`

Expected: PASS (resolve any compilation errors)

- [ ] **Step 6: Run tests**

Run: `cd /home/weiss/git/World-Office/server && cargo test -p coauthoring-service 2>&1 | tail -30`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/weiss/git/World-Office/server
git add services/coauthoring-service/src/main.rs
git commit -m "feat(coauthoring): add ParticipantUpdate protocol and presence broadcast"
```

---

## Task 5: Verify full stack compiles

- [ ] **Step 1: TypeScript typecheck**

Run: `cd /home/weiss/git/World-Office/server && pnpm typecheck 2>&1 | tail -30`

Expected: PASS

- [ ] **Step 2: Rust check all**

Run: `cd /home/weiss/git/World-Office/server && cargo check --workspace 2>&1 | tail -20`

Expected: PASS (wo-pdf and wo-webdav excluded from clippy as usual)

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## File Summary

| File | Change |
|------|--------|
| `packages/collaboration-client/src/protocol.ts` | Add `ParticipantUpdate`, `ParticipantEvent`, `InitialState`, `ServerMessage` types + `parseServerMessage` + `createCursorUpdate` |
| `packages/collaboration-client/src/client.ts` | Add `participantUpdate` and `initialState` to events, update `handleMessage` routing, add `token` option to `WebSocketManager` |
| `packages/collaboration-react/src/hooks/useCollaboration.ts` | Wire `AuthClient.createSession` → `POST /sessions/{id}/join` → `manager.connect()` flow, add `onParticipantUpdate`/`onInitialState` callbacks |
| `services/coauthoring-service/src/main.rs` | Add `ParticipantUpdate`, `ParticipantEvent`, `InitialState`, `WsMessage` types; add `presence_channels` to `AppState`; update `handle_ws` for presence broadcast and initial state |