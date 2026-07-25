import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { spreadsheetStore } from "../../../stores/SpreadsheetStore";

interface TemplateInfo {
	id: string;
	name: string;
	description: string;
	icon: string;
}

const TEMPLATES: TemplateInfo[] = [
	{
		id: "blank",
		name: "Blank Workbook",
		description: "Empty spreadsheet",
		icon: "📊",
	},
	{
		id: "budget",
		name: "Budget Tracker",
		description: "Personal budget template",
		icon: "💰",
	},
	{
		id: "invoice",
		name: "Invoice",
		description: "Billing spreadsheet",
		icon: "📋",
	},
	{
		id: "schedule",
		name: "Schedule",
		description: "Project timeline",
		icon: "📅",
	},
];

export function CreateNewPanel({ visible }: { visible: boolean }) {
	const { t } = useTranslation();
	const [preview, setPreview] = useState<string | null>(null);
	const [previewHtml, setPreviewHtml] = useState("");

	useEffect(() => {
		if (preview) {
			fetch(`/templates/${preview}.html`)
				.then((r) => r.text())
				.then(setPreviewHtml)
				.catch(() => setPreviewHtml(""));
		}
	}, [preview]);

	function handleCreateNew(_id: string): void {
		spreadsheetStore.setFileMenuOpen(false);
		spreadsheetStore.setActiveFileMenuPanel(null);
	}

	return (
		<div
			className="se-file-menu-content-box"
			style={{
				display: visible ? "block" : "none",
				padding: "0",
				flexDirection: "column",
			}}
		>
			<div className="se-file-menu-header">{t("Create New")}</div>
			<div className="se-file-menu-formats">
				{TEMPLATES.map((tpl) => (
					<button
						type="button"
						key={tpl.id}
						className="se-template-card"
						onMouseEnter={() => setPreview(tpl.id)}
						onMouseLeave={() => setPreview(null)}
						onClick={() => handleCreateNew(tpl.id)}
					>
						<div className="se-template-icon">{tpl.icon}</div>
						<div className="se-template-info">
							<div className="se-template-name">{tpl.name}</div>
							<div className="se-template-desc">{t(tpl.description)}</div>
						</div>
					</button>
				))}
			</div>
			{preview && previewHtml && (
				<div className="se-template-preview">
					<div className="se-template-preview-header">Preview</div>
					<div
						className="se-template-preview-body"
						dangerouslySetInnerHTML={{ __html: previewHtml }}
					/>
				</div>
			)}
		</div>
	);
}
