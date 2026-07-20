import { useState } from "react";
import { presentationStore } from "../../../stores/PresentationStore";

interface TemplateInfo {
	id: string;
	name: string;
	description: string;
	icon: string;
}

const TEMPLATES: TemplateInfo[] = [
	{ id: "blank", name: "Blank", description: "Empty presentation", icon: "📄" },
	{ id: "pitch-deck", name: "Pitch Deck", description: "Startup presentation template", icon: "🚀" },
	{ id: "business-review", name: "Business Review", description: "Quarterly review template", icon: "📊" },
	{ id: "education", name: "Education", description: "Educational presentation", icon: "🎓" },
];

export function CreateNewPanel({ visible }: { visible: boolean }) {
	const [preview, setPreview] = useState<string | null>(null);
	const [previewJson, setPreviewJson] = useState<string>("");

	function handleUseTemplate(id: string): void {
		presentationStore.setFileMenuOpen(false);
		if (id === "blank") {
			presentationStore.resetToDefaults();
		} else {
			fetch(`/templates/${id}.json`)
				.then((r) => r.text())
				.then((text) => presentationStore.fromJSON(text))
				.catch(() => presentationStore.resetToDefaults());
		}
	}

	return (
		<div
			className="prese-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0", flexDirection: "column" }}
		>
			<div className="prese-file-menu-header">Create New</div>
			<div className="prese-file-menu-formats">
				{TEMPLATES.map((tpl) => (
					<div
						key={tpl.id}
						className="prese-template-card"
						onMouseEnter={() => setPreview(tpl.id)}
						onMouseLeave={() => setPreview(null)}
						onClick={() => handleUseTemplate(tpl.id)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleUseTemplate(tpl.id);
							}
						}}
					>
						<div className="prese-template-icon">{tpl.icon}</div>
						<div className="prese-template-info">
							<div className="prese-template-name">{tpl.name}</div>
							<div className="prese-template-desc">{tpl.description}</div>
						</div>
					</div>
				))}
			</div>
			{preview && previewJson && (
				<div className="prese-template-preview">
					<div className="prese-template-preview-header">Preview</div>
					<div className="prese-template-preview-body">{previewJson}</div>
				</div>
			)}
		</div>
	);
}
