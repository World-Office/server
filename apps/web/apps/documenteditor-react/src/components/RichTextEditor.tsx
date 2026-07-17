import Color from "@tiptap/extension-color"
import Focus from "@tiptap/extension-focus"
import FontFamily from "@tiptap/extension-font-family"
import Highlight from "@tiptap/extension-highlight"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { CommentMark } from "../lib/comment-mark"
import { DatePickerControl, DropdownControl, CheckboxControl, PlainTextControl } from "../lib/content-controls"
import { EndnoteMark } from "../lib/endnote-mark"
import { FootnoteMark } from "../lib/footnote-mark"
import { LineSpacingExtension } from "../lib/line-spacing-extension"
import { SpellcheckExtension } from "../lib/spellcheck-extension"
import { TextDirectionExtension } from "../lib/text-direction-extension"
import { TrackInsertMark, TrackDeleteMark } from "../lib/track-changes"
import { TableOfContents } from "../lib/toc-extension"
import { ParagraphBorders } from "../lib/paragraph-borders"
import { PageNumber } from "../lib/page-number"
import { setActiveRichTextEditor } from "../lib/rte-command"

export interface RichTextEditorHandle {
  getHTML(): string
  setHTML(html: string): void
}

interface RichTextEditorProps {
  html: string
  onChange?: (html: string) => void
  readOnly?: boolean
  spellchecker?: import("@world-office/spellchecker").SpellChecker | null
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ html, onChange, readOnly, spellchecker }, ref) {
    const onChangeRef = useRef(onChange)
    const lastSetHtmlRef = useRef(html)

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          link: { openOnClick: true },
        }),
        TextStyle,
        Color,
        FontFamily,
        Highlight.configure({ multicolor: true }),
        Subscript,
        Superscript,
        TaskList,
        TaskItem.configure({ nested: true }),
        Table,
        TableRow,
        TableCell,
        TableHeader,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Image,
        Typography,
        Focus.configure({ className: "has-focus" }),
        Placeholder.configure({ placeholder: "Start typing\u2026" }),
        CommentMark,
        EndnoteMark,
        FootnoteMark,
        LineSpacingExtension.configure({
          types: ["paragraph", "heading"],
          defaultSpacing: "1.15",
        }),
        TextDirectionExtension.configure({
          types: ["paragraph", "heading", "blockquote", "listItem"],
        }),
        TrackInsertMark,
        TrackDeleteMark,
        TableOfContents,
        ParagraphBorders,
        PageNumber,
        PlainTextControl,
        DropdownControl,
        CheckboxControl,
        DatePickerControl,
        SpellcheckExtension.configure({
          spellchecker: spellchecker ?? null,
          enabled: spellchecker?.isEnabled() ?? true,
        }),
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
          <EditorContent editor={editor} spellCheck="true" />
        </div>
      </div>
    )
  },
)
