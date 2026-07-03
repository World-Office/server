import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { setActiveRichTextEditor } from "../lib/rte-command"

export interface RichTextEditorHandle {
  getHTML(): string
  setHTML(html: string): void
}

interface RichTextEditorProps {
  html: string
  onChange?: (html: string) => void
  readOnly?: boolean
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ html, onChange, readOnly }, ref) {
    const onChangeRef = useRef(onChange)
    const lastSetHtmlRef = useRef(html)

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    const editor = useEditor({
      extensions: [
        StarterKit,
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Link.configure({ openOnClick: true }),
        Image,
      ],
      content: html,
      editable: !readOnly,
      autofocus: false,
      onUpdate({ editor }) {
        const currentHtml = editor.getHTML()
        onChangeRef.current?.(currentHtml)
      },
      onCreate({ editor }) {
        setActiveRichTextEditor(editor)
      },
    })

    useImperativeHandle(
      ref,
      () => ({
        getHTML() {
          return editor?.getHTML() ?? ""
        },
        setHTML(h: string) {
          editor?.commands.setContent(h)
        },
      }),
      [editor],
    )

    useEffect(() => {
      if (!editor) return
      if (html !== lastSetHtmlRef.current && html !== editor.getHTML()) {
        lastSetHtmlRef.current = html
        editor.commands.setContent(html)
      }
    }, [html, editor])

    useEffect(() => {
      return () => {
        setActiveRichTextEditor(null)
      }
    }, [])

    return (
      <div
        className="rich-text-editor"
        style={{
          width: "100%",
          height: "100%",
          minHeight: "100%",
          background: "#fff",
          fontFamily: "'Aptos', 'Calibri', 'Segoe UI', Roboto, sans-serif",
          fontSize: 14,
          lineHeight: 1.6,
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px" }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    )
  },
)
