import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import { useEffect, useRef } from "react"
import { documentStore } from "../stores/DocumentStore"

interface HeaderFooterProps {
	region: "header" | "footer"
}

export function HeaderFooterEditor({ region }: HeaderFooterProps) {
	const html = region === "header" ? documentStore.headerHtml : documentStore.footerHtml
	const onChangeRef = useRef<(html: string) => void>(undefined as unknown as (html: string) => void)

	onChangeRef.current = (newHtml: string) => {
		if (region === "header") {
			documentStore.headerHtml = newHtml
		} else {
			documentStore.footerHtml = newHtml
		}
	}

	const editor = useEditor({
		extensions: [
			StarterKit.configure({ heading: { levels: [1, 2] } }),
			TextAlign.configure({ types: ["heading", "paragraph"] }),
		],
		content: html || `<p>${region === "header" ? "Header" : "Footer"}</p>`,
		editable: documentStore.headerFooterMode === region,
		autofocus: false,
		onUpdate({ editor: ed }) {
			onChangeRef.current?.(ed.getHTML())
		},
	})

	useEffect(() => {
		if (editor && html !== editor.getHTML()) {
			editor.commands.setContent(html || `<p>${region === "header" ? "Header" : "Footer"}</p>`)
		}
	}, [html, editor])

	return (
		<div
			data-header-footer-region={region}
			style={{
				borderBottom: region === "header" ? "1px dashed #ccc" : "none",
				borderTop: region === "footer" ? "1px dashed #ccc" : "none",
				minHeight: 40,
				padding: "4px 8px",
				opacity: documentStore.headerFooterMode === region ? 1 : 0.5,
				cursor: documentStore.headerFooterMode === region ? "text" : "default",
				fontSize: 11,
				color: "#666",
			}}
		>
			<EditorContent editor={editor} />
		</div>
	)
}
