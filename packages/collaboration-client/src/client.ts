/**
 * WebSocketManager — manages a single WebSocket connection to the coauthoring-service.
 *
 * Responsibilities:
 * - Open/close connection
 * - Send EditOperations (insert, delete)
 * - Receive remote EditOperations and emit them via event callbacks
 * - Queue messages when disconnected
 * - Expose connection state
 */

import {
  type EditOperation,
  type ParticipantUpdate,
  type InitialState,
  type CommentEventData,
  type WsMessage,
  createInsertOp,
  createDeleteOp,
  parseServerMessage,
  isRemoteMessage,
} from "./protocol"
import { BackoffStrategy } from "./reconnection"

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting"

export interface WebSocketManagerEvents {
  open: () => void
  close: (event: { code: number; reason: string; wasClean: boolean }) => void
  error: (event: Event) => void
  operation: (op: EditOperation) => void
  participantUpdate: (update: ParticipantUpdate) => void
  initialState: (state: InitialState) => void
  commentEvent: (data: CommentEventData) => void
  stateChange: (state: ConnectionState) => void
}

export interface WebSocketManagerOptions {
  url: string
  userId: string
  sessionId?: string
  /** Auto-reconnect on disconnect. Default: true */
  autoReconnect?: boolean
  /** Backoff options for reconnection. */
  backoff?: ConstructorParameters<typeof BackoffStrategy>[0]
}

/** WebSocket readyState constants (avoid reliance on browser-only WebSocket global). */
const WS_CONNECTING = 0
const WS_OPEN = 1


type EventCallback = (...args: unknown[]) => void

export class WebSocketManager {
  private readonly url: string
  private readonly userId: string
  private readonly sessionId: string
  private autoReconnect: boolean
  private backoff: BackoffStrategy

  private ws: WebSocket | null = null
  private _state: ConnectionState = "disconnected"
  private messageQueue: string[] = []
  private listeners = new Map<string, Set<EventCallback>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private token: string | null = null

  constructor(options: WebSocketManagerOptions) {
    this.url = options.url
    this.userId = options.userId
    this.sessionId = options.sessionId ?? this.extractSessionId(options.url)
    this.autoReconnect = options.autoReconnect ?? true
    this.backoff = new BackoffStrategy(options.backoff)
  }

  get state(): ConnectionState {
    return this._state
  }

  private setState(newState: ConnectionState): void {
    if (this._state === newState) return
    this._state = newState
    this.emit("stateChange", newState)
  }

  /** Extract session ID from WebSocket URL like ws://host/ws/{session_id} */
  private extractSessionId(url: string): string {
    const match = url.match(/\/ws\/([^/?#]+)/)
    return match?.[1] ?? ""
  }

  // ── Event emitter ──

  on<K extends keyof WebSocketManagerEvents>(event: K, callback: WebSocketManagerEvents[K]): this {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(callback as EventCallback)
    return this
  }

  off<K extends keyof WebSocketManagerEvents>(event: K, callback: WebSocketManagerEvents[K]): this {
    this.listeners.get(event)?.delete(callback as EventCallback)
    return this
  }

  private emit<K extends keyof WebSocketManagerEvents>(
    event: K,
    ...args: Parameters<WebSocketManagerEvents[K]>
  ): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of set) {
      fn(...args as unknown[])
    }
  }

  // ── Connection ──

  connect(token?: string): void {
    if (this.ws && (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING)) {
      return
    }

    if (token !== undefined) {
      this.token = token
    }

    this.setState("connecting")

    const actualUrl = this.token
      ? `${this.url}${this.url.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.token)}`
      : this.url
    this.ws = new WebSocket(actualUrl)

    this.ws.addEventListener("open", () => {
      this.setState("connected")
      this.backoff.reset()
      this.flushQueue()
      this.emit("open")
    })

    this.ws.addEventListener("message", (event: MessageEvent) => {
      this.handleMessage(event.data as string)
    })

    this.ws.addEventListener("close", (event: CloseEvent) => {
      this.setState("disconnected")
      this.emit("close", { code: event.code, reason: event.reason, wasClean: event.wasClean })

      if (this.autoReconnect && event.code !== 1000) {
        this.scheduleReconnect()
      }
    })

    this.ws.addEventListener("error", (event: Event) => {
      this.emit("error", event)
    })
  }

  disconnect(): void {
    this.autoReconnect = false
    this.clearReconnectTimer()

    if (this.ws) {
      this.ws.close(1000, "Client disconnect")
      this.ws = null
    }

    this.setState("disconnected")
  }

  // ── Send operations ──

  sendInsert(position: number, text: string, revision = 0): void {
    const op = createInsertOp({
      session_id: this.sessionId,
      user_id: this.userId,
      position,
      text,
      revision,
    })
    this.send(op)
  }

  sendDelete(position: number, length: number, revision = 0): void {
    const op = createDeleteOp({
      session_id: this.sessionId,
      user_id: this.userId,
      position,
      length,
      revision,
    })
    this.send(op)
  }

  sendParticipantUpdate(update: ParticipantUpdate): void {
    const msg: WsMessage = {
      type: "participant_update",
      update,
    }
    const json = JSON.stringify(msg)
    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.ws.send(json)
    } else {
      this.messageQueue.push(json)
    }
  }

  /** Broadcast a comment event to other participants. */
  sendCommentEvent(data: CommentEventData): void {
    const msg: WsMessage = { type: "comment_event", data }
    const json = JSON.stringify(msg)
    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.ws.send(json)
    } else {
      this.messageQueue.push(json)
    }
  }

  /** Send a raw EditOperation. */
  send(op: EditOperation): void {
    const json = JSON.stringify(op)
    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.ws.send(json)
    } else {
      this.messageQueue.push(json)
    }
  }

  // ── Receive ──

  private handleMessage(data: string): void {
    const serverMsg = parseServerMessage(data)
    if (!serverMsg) return

    if (serverMsg.type === "edit") {
      if (!isRemoteMessage(serverMsg.operation, this.userId)) return
      this.emit("operation", serverMsg.operation)
    } else if (serverMsg.type === "participant_update") {
      this.emit("participantUpdate", serverMsg.update)
    } else if (serverMsg.type === "initial_state") {
      this.emit("initialState", serverMsg.state)
    } else if (serverMsg.type === "comment_event") {
      // Skip our own comment events (echo from server)
      if (serverMsg.data.author_id === this.userId) return
      this.emit("commentEvent", serverMsg.data)
    }
  }

  // ── Reconnection ──

  private scheduleReconnect(): void {
    const delay = this.backoff.next()
    if (delay < 0) {
      // Retries exhausted
      return
    }

    this.setState("reconnecting")
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private flushQueue(): void {
    if (this.ws && this.ws.readyState === WS_OPEN) {
      for (const msg of this.messageQueue) {
        this.ws.send(msg)
      }
      this.messageQueue = []
    }
  }
}
