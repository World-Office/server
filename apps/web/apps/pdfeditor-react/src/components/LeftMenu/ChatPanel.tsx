/**
 * ChatPanel — left-menu "Chat" toggle target (PDF editor).
 *
 * A working message surface (list, input, send, clear) backed by PdfStore and
 * mirrored to sessionStorage for the document session. With a co-authoring
 * service configured (PdfCollaborationProvider) the same store is the relay
 * point for remote messages; without one the panel stays a local scratchpad
 * and says so.
 */
import { observer } from "mobx-react-lite"
import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { isCollaborationConfigured } from "../../lib/collaboration-config"
import { pdfStore } from "../../stores/PdfStore"
import type { PanelChatMessage } from "../../types/pdf"

const STORAGE_KEY = "pdf-panel-chat"

function storageId(): string {
  return `${STORAGE_KEY}:${pdfStore.document?.title ?? "untitled"}`
}

function loadMessages(): PanelChatMessage[] {
  try {
    const raw = sessionStorage.getItem(storageId())
    if (!raw) return []
    const parsed = JSON.parse(raw) as PanelChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMessages(messages: PanelChatMessage[]): void {
  try {
    sessionStorage.setItem(storageId(), JSON.stringify(messages))
  } catch {
    // storage full / disabled — messages stay in memory
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

function ChatPanelInner({ active }: { active: boolean }): JSX.Element {
  const [text, setText] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const messages = pdfStore.chatMessages
  const connected = isCollaborationConfigured()

  // load the session log once, then keep the store persisted on change
  useEffect(() => {
    pdfStore.setChatMessages(loadMessages())
  }, [])
  useEffect(() => {
    saveMessages(messages)
  }, [messages])
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, active])

  function send(): void {
    if (!pdfStore.addChatMessage(text)) return
    setText("")
  }

  return (
    <div
      className="pdf-left-panel pdf-chat-panel"
      style={{ display: active ? "flex" : "none" }}
      data-panel="chat"
    >
      <div className="pdf-left-panel-header">
        <span>Chat</span>
        {messages.length > 0 && <span className="pdf-left-panel-count">{messages.length}</span>}
      </div>
      <div className="pdf-chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="pdf-left-panel-muted">
            {connected
              ? "Co-authoring chat — say hello to your collaborators."
              : "Session chat. Messages stay in this editor session."}
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`pdf-chat-message${message.self ? " self" : ""}`}>
            <div className="pdf-chat-message-meta">
              <span className="pdf-comment-author">{message.author}</span>
              <span className="pdf-left-panel-muted">{formatTime(message.createdAt)}</span>
            </div>
            <div className="pdf-chat-message-text">{message.text}</div>
          </div>
        ))}
      </div>
      <div className="pdf-chat-input-row">
        <input
          className="pdf-left-panel-input"
          type="text"
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send()
          }}
          data-action="chat-text"
        />
        <button
          type="button"
          className="pdf-left-panel-btn pdf-left-panel-btn-primary"
          onClick={send}
          data-action="chat-send"
        >
          Send
        </button>
      </div>
      {messages.length > 0 && (
        <div className="pdf-chat-footer">
          <button
            type="button"
            className="pdf-left-panel-btn pdf-left-panel-btn-danger"
            onClick={() => pdfStore.clearChatMessages()}
            data-action="chat-clear"
          >
            Clear chat
          </button>
        </div>
      )}
    </div>
  )
}

export const ChatPanel = observer(ChatPanelInner)
