import * as monaco from "monaco-editor"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import { useEffect, useRef, useState } from "react"

if (typeof self !== "undefined") {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === "typescript" || label === "javascript") {
        return new TsWorker()
      }
      if (label === "json") {
        return new JsonWorker()
      }
      if (label === "css" || label === "scss" || label === "less") {
        return new CssWorker()
      }
      if (label === "html" || label === "handlebars") {
        return new HtmlWorker()
      }
      return new EditorWorker()
    },
  }
}

let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null

export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor
}

interface MonacoEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  theme?: string
  editorType?: string
  readOnly?: boolean
}

export function MonacoEditor({
  value,
  onChange,
  language = "typescript",
  theme = "vs",
  editorType,
  readOnly,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // biome-ignore lint/correctness/useExhaustiveDependencies: editor is recreated only on language/theme/editorType change; initial `value` seeds the model, subsequent updates applied via setValue in the effect below
  useEffect(() => {
    if (!containerRef.current) return

    try {
      const editor = monaco.editor.create(containerRef.current, {
        value,
        language,
        theme,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineHeight: 20,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: "on",
        readOnly: readOnly ?? (editorType === "presentation" || editorType === "pdf"),
      })

      editorRef.current = editor
      activeEditor = editor
      setIsReady(true)
      setLoadError(null)

      const disposable = editor.onDidChangeModelContent(() => {
        const newValue = editor.getValue()
        onChangeRef.current?.(newValue)
      })

      return () => {
        disposable.dispose()
        if (activeEditor === editor) {
          activeEditor = null
        }
        editor.dispose()
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to initialize Monaco Editor")
    }
  }, [language, theme, editorType])

  useEffect(() => {
    if (editorRef.current && isReady) {
      const currentValue = editorRef.current.getValue()
      if (currentValue !== value) {
        editorRef.current.setValue(value)
      }
    }
  }, [value, isReady])

  if (loadError) {
    return (
      <div
        className="monaco-editor-error"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
          color: "#666",
          fontSize: 14,
          background: "#fafafa",
        }}
      >
        <span style={{ fontSize: 24, color: "#c00" }}>&#9888;</span>
        <p style={{ margin: 0 }}>Editor failed to load</p>
        <code style={{ fontSize: 12, color: "#999", maxWidth: "80%", textAlign: "center" }}>
          {loadError}
        </code>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
      className="monaco-editor-container"
    />
  )
}
