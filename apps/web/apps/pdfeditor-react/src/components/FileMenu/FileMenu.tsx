import {
	type EmailConfig,
	type ExportFormat,
	ExportWizard,
	makeStyles,
	tokens,
} from "@fluentui/react-components"
import { useCallback } from "react"
import { pdfStore } from "../../stores/PdfStore"
import { FileMenuItems } from "./FileMenuItems"
import { CreateNewPanel } from "./panels/CreateNewPanel"
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel"
import { HelpPanel } from "./panels/HelpPanel"
import { SaveAsPanel } from "./panels/SaveAsPanel"
import { SettingsPanel } from "./panels/SettingsPanel"

const useStyles = makeStyles({
	root: {
		display: "flex",
		width: "100%",
		height: "100%",
		backgroundColor: tokens.colorNeutralBackground1,
	},
	list: {
		display: "flex",
		flexDirection: "column",
		width: "260px",
		flexShrink: 0,
		backgroundColor: tokens.colorNeutralBackground1,
		borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
		overflowY: "auto",
		userSelect: "none",
	},
	panelContainer: {
		width: "100%",
		paddingLeft: "260px",
		backgroundColor: tokens.colorNeutralBackground1,
	},
	panelBox: {
		height: "100%",
		padding: "0 20px",
		position: "relative",
		overflow: "hidden",
		display: "none",
	},
})

export function FileMenu() {
	const styles = useStyles()
	const activePanel = pdfStore.activeFileMenuPanel

	function handleMenuClick(action: string, hasPanel: boolean): void {
		if (hasPanel) {
			const newPanel = pdfStore.activeFileMenuPanel === action ? null : action
			pdfStore.setActiveFileMenuPanel(newPanel)
		}
	}

	function handleBack(): void {
		pdfStore.setActiveFileMenuPanel(null)
		pdfStore.setFileMenuOpen(false)
	}

	const PDF_FORMATS: ExportFormat[] = [
		{
			id: "pdf",
			label: "PDF",
			description: "Portable Document Format",
			extension: ".pdf",
			mimeType: "application/pdf",
		},
	]

	const handleExport = useCallback(async (_format: ExportFormat): Promise<boolean> => {
		try {
			await pdfStore.exportAsDownload()
			return true
		} catch {
			return false
		}
	}, [])

	const emailConfig: EmailConfig = {
		endpoint: "/api/send-email-attachment",
		async produceAttachment(_formatId: string) {
			const blob = await pdfStore.buildDocumentBlob()
			if (!blob || blob.size === 0) return null
			const fileName = pdfStore.document?.title
				? `${pdfStore.document.title.replace(/\.[^.]+$/, "")}.pdf`
				: "document.pdf"
			return { blob, fileName, mimeType: "application/pdf" }
		},
		defaultSubject: "Document: {{fileName}}",
	}

	return (
		<div className={styles.root}>
			<div className={styles.list} role="menubar" aria-label="File menu">
				<FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
			</div>
			<div className={styles.panelContainer}>
				<div className={styles.panelBox}>
					<CreateNewPanel visible={activePanel === "new"} />
					<SaveAsPanel visible={activePanel === "saveas"} />
					<SettingsPanel visible={activePanel === "opts"} />
					<DocumentInfoPanel visible={activePanel === "info"} />
					<HelpPanel visible={activePanel === "help"} />
					<PrintPreviewPanel visible={activePanel === "printpreview"} />
				</div>
			</div>

			{activePanel === "export" && (
				<ExportWizard
					visible
					groups={[{ heading: "PDF", formats: PDF_FORMATS }]}
					onExport={handleExport}
					emailConfig={emailConfig}
					onClose={() => pdfStore.setActiveFileMenuPanel(null)}
				/>
			)}
		</div>
	)
}

const usePrintPreviewStyles = makeStyles({
	wrapper: {
		height: "100%",
		padding: 0,
		position: "relative",
		overflow: "hidden",
	},
	header: {
		fontSize: tokens.fontSizeHero800,
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground1,
		padding: "24px 20px 20px 0",
		whiteSpace: "nowrap",
	},
})

function PrintPreviewPanel({ visible }: { visible: boolean }) {
	const styles = usePrintPreviewStyles()
	return (
		<div className={styles.wrapper} style={{ display: visible ? "block" : "none" }}>
			<div className={styles.header}>Print Preview</div>
		</div>
	)
}
