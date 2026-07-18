import { useState } from "react"
import { improveWriting, summarizeSelection, translateText } from "../../lib/ai-service"
import { getActiveRichTextEditor } from "../../lib/rte-command"

interface AiAction {
  id: string
  label: string
  description: string
  execute: (text: string) => Promise<string>
}

const AI_ACTIONS: AiAction[] = [
  {
    id: "summarize",
    label: "Summarize",
    description: "Create a concise summary of the selected text",
    execute: summarizeSelection,
  },
  {
    id: "improve",
    label: "Improve Writing",
    description: "Fix grammar, enhance clarity, and professionalize",
    execute: improveWriting,
  },
  {
    id: "translate-de",
    label: "Translate to German",
    description: "Translate selected text to German",
    execute: (text) => translateText(text, "German"),
  },
  {
    id: "translate-fr",
    label: "Translate to French",
    description: "Translate selected text to French",
    execute: (text) => translateText(text, "French"),
  },
  {
    id: "translate-es",
    label: "Translate to Spanish",
    description: "Translate selected text to Spanish",
    execute: (text) => translateText(text, "Spanish"),
  },
]

export function AiAssistantPanel({ visible }: { visible: boolean }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState("")

  function getSelectedText(): string {
    const editor = getActiveRichTextEditor()
    if (!editor) return ""
    const { from, to } = editor.state.selection
    return editor.state.doc.textBetween(from, to, " ")
  }

  function replaceSelection(text: string): void {
    const editor = getActiveRichTextEditor()
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContentAt({ from: editor.state.selection.from, to: editor.state.selection.to }, text)
      .run()
  }

  async function handleAction(action: AiAction): Promise<void> {
    const selectedText = getSelectedText()
    if (!selectedText) {
      setError("Select text in the document first")
      return
    }

    setLoading(action.id)
    setError(null)
    setResult(null)

    try {
      const response = await action.execute(selectedText)
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed")
    } finally {
      setLoading(null)
    }
  }

  async function handleCustomPrompt(): Promise<void> {
    const selectedText = getSelectedText()
    if (!selectedText || !customPrompt.trim()) return

    setLoading("custom")
    setError(null)
    setResult(null)

    try {
      const { callAi } = await import("../../lib/ai-service")
      const response = await callAi(
        `Selected text:\n${selectedText}\n\nInstruction: ${customPrompt.trim()}`,
      )
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed")
    } finally {
      setLoading(null)
    }
  }

  function handleReplace(): void {
    if (result) {
      replaceSelection(result)
      setResult(null)
    }
  }

  function handleInsert(): void {
    if (result) {
      const editor = getActiveRichTextEditor()
      if (editor) {
        editor.chain().focus().insertContent(result).run()
      }
      setResult(null)
    }
  }

  if (!visible) return null

  const hasSelection = getSelectedText().length > 0

  return (
    <div className="de-ai-assistant">
      <div className="de-ai-assistant-header">AI Assistant</div>

      <div className="de-ai-assistant-body">
        {!hasSelection && (
          <p className="de-ai-assistant-hint">Select text in the document to use AI actions.</p>
        )}

        {hasSelection && (
          <div className="de-ai-assistant-actions">
            {AI_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="de-ai-action-btn"
                disabled={loading !== null}
                title={action.description}
                onClick={() => handleAction(action)}
              >
                {loading === action.id ? "Processing…" : action.label}
              </button>
            ))}
          </div>
        )}

        {error && <div className="de-ai-assistant-error">{error}</div>}

        {result && (
          <div className="de-ai-assistant-result">
            <div className="de-ai-assistant-result-header">Result</div>
            <div className="de-ai-assistant-result-text">{result}</div>
            <div className="de-ai-assistant-result-actions">
              <button type="button" onClick={handleReplace}>
                Replace Selection
              </button>
              <button type="button" onClick={handleInsert}>
                Insert Below
              </button>
              <button type="button" onClick={() => setResult(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="de-ai-assistant-custom">
          <textarea
            placeholder="Custom instruction (e.g., 'Make it more formal' or 'Explain this concept')"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="de-ai-action-btn"
            disabled={!hasSelection || !customPrompt.trim() || loading !== null}
            onClick={handleCustomPrompt}
          >
            {loading === "custom" ? "Processing…" : "Apply Custom Prompt"}
          </button>
        </div>
      </div>
    </div>
  )
}
