import { useEffect, useRef, useState } from "react"
import { useApi } from "../hooks/useApi"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface ChatHistory {
  messages: ChatMessage[]
}

export function AiChat() {
  const { data: history, loading, error } = useApi<ChatHistory>("/ai/chat/history")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (history?.messages) {
      setMessages(history.messages)
    }
  }, [history])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setSending(true)

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const reply = (await res.json()) as ChatMessage
      setMessages((prev) => [...prev, reply])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, an error occurred while getting a response.",
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>AI Chat</h2>

      {loading && <p>Loading...</p>}

      {error && (
        <div
          style={{
            border: "1px solid var(--wo-red-500)",
            borderRadius: 8,
            padding: "1rem",
            backgroundColor: "#fef2f2",
            color: "var(--wo-red-500)",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {!loading && (
        <div
          style={{
            border: "1px solid var(--wo-gray-200)",
            borderRadius: 8,
            backgroundColor: "white",
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 12rem)",
          }}
        >
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {messages.length === 0 && !sending && (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--wo-gray-500)",
                  marginTop: "3rem",
                }}
              >
                <p>Start a conversation by sending a message below.</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "0.75rem 1rem",
                    borderRadius: 12,
                    backgroundColor:
                      msg.role === "user" ? "var(--wo-blue-500)" : "var(--wo-gray-100)",
                    color: msg.role === "user" ? "white" : "var(--wo-gray-900)",
                    borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                    borderBottomLeftRadius: msg.role === "assistant" ? 4 : 12,
                  }}
                >
                  <p style={{ fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {msg.content}
                  </p>
                  <p
                    style={{
                      fontSize: "0.625rem",
                      marginTop: "0.375rem",
                      opacity: 0.7,
                      textAlign: "right",
                    }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: 12,
                    backgroundColor: "var(--wo-gray-100)",
                    color: "var(--wo-gray-500)",
                    borderBottomLeftRadius: 4,
                  }}
                >
                  <span style={{ fontSize: "0.875rem" }}>Thinking...</span>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--wo-gray-200)",
              padding: "1rem 1.5rem",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              disabled={sending}
              style={{
                flex: 1,
                padding: "0.625rem 0.875rem",
                border: "1px solid var(--wo-gray-200)",
                borderRadius: 6,
                fontSize: "0.875rem",
                outline: "none",
                backgroundColor: sending ? "var(--wo-gray-50)" : "white",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              style={{
                padding: "0.625rem 1.25rem",
                border: "none",
                borderRadius: 6,
                backgroundColor:
                  !input.trim() || sending ? "var(--wo-gray-300)" : "var(--wo-blue-500)",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: !input.trim() || sending ? "not-allowed" : "pointer",
                transition: "background-color 0.15s",
              }}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
