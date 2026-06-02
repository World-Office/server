import { useState, useRef, type KeyboardEvent, type ChangeEvent } from "react"

export interface CommentInputProps {
  onSubmit: (text: string) => void
  placeholder?: string
  agentNames?: string[]
  onCancel?: () => void
}

function extractMention(text: string, cursorPos: number): string | null {
  const beforeCursor = text.slice(0, cursorPos)
  const atMatch = beforeCursor.match(/@(\w*)$/)
  return atMatch ? atMatch[1] : null
}

function replaceMention(text: string, cursorPos: number, agentName: string): string {
  const beforeCursor = text.slice(0, cursorPos)
  const afterCursor = text.slice(cursorPos)
  const atMatch = beforeCursor.match(/@(\w*)$/)
  if (!atMatch) return text
  const prefix = beforeCursor.slice(0, atMatch.index)
  return `${prefix}@${agentName} ${afterCursor}`
}

export function CommentInput({
  onSubmit,
  placeholder = "Add a comment...",
  agentNames = [],
  onCancel,
}: CommentInputProps) {
  const [text, setText] = useState("")
  const [cursorPos, setCursorPos] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const mentionQuery = extractMention(text, cursorPos)
  const matchingAgents = mentionQuery !== null
    ? agentNames.filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    setCursorPos(e.target.selectionStart ?? 0)
  }

  function selectAgent(agent: string) {
    const newText = replaceMention(text, cursorPos, agent)
    setText(newText)
    setCursorPos(newText.length)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const trimmed = text.trim()
      if (trimmed) {
        onSubmit(trimmed)
        setText("")
      }
    }
    if (e.key === "Escape" && onCancel) {
      onCancel()
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Mention dropdown */}
      {matchingAgents.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {matchingAgents.map((agent) => (
            <button
              key={agent}
              type="button"
              onClick={() => selectAgent(agent)}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f0f0")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              @{agent}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <textarea
        ref={inputRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          padding: "6px 8px",
          border: "1px solid #ccc",
          borderRadius: 6,
          resize: "none",
          fontSize: 13,
          fontFamily: "inherit",
          lineHeight: 1.4,
          boxSizing: "border-box",
        }}
      />

      {/* Actions row */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "4px 12px",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
