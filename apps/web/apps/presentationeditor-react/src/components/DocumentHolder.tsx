import { useState } from "react";
import { MonacoEditor } from "./MonacoEditor";

export function DocumentHolder() {
	const [content, setContent] = useState(
		"// Presentation content will appear here",
	);

	return (
		<div
			className="prese-document-holder"
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				overflow: "auto",
				height: "100%",
				backgroundColor: "#e8e8e8",
			}}
		>
			<MonacoEditor
				value={content}
				onChange={setContent}
				language="typescript"
				editorType="presentation"
			/>
		</div>
	);
}
