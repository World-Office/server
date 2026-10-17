import { makeStyles, tokens } from "@fluentui/react-components";
import {
	type EmailConfig,
	type ExportFormat,
	ExportWizard,
} from "@world-office/editor-common";
import { observer } from "mobx-react-lite";
import { useCallback } from "react";
import { visioStore } from "../../../stores/VisioStore";
import { FileMenuItems } from "./FileMenuItems";
import { CreateNewPanel } from "./panels/CreateNewPanel";
import { DocumentInfoPanel } from "./panels/DocumentInfoPanel";
import { HelpPanel } from "./panels/HelpPanel";
import { RenamePanel } from "./panels/RenamePanel";
import { SaveAsPanel } from "./panels/SaveAsPanel";
import { SaveCopyPanel } from "./panels/SaveCopyPanel";
import { SettingsPanel } from "./panels/SettingsPanel";

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
		// NOT display:none — every pane below carries its own
		// `display: visible ? "block" : "none"`, so hiding the container here
		// starves each pane (w=0/h=0) even when its entry activated it: the
		// pane was mounted but no pointer could ever reach its controls.
		display: "block",
	},
});

function FileMenuInner() {
	const styles = useStyles();
	const activePanel = visioStore.activeFileMenuPanel;

	function handleMenuClick(action: string, hasPanel: boolean): void {
		if (hasPanel) {
			const newPanel =
				visioStore.activeFileMenuPanel === action ? null : action;
			visioStore.setActiveFileMenuPanel(newPanel);
			return;
		}
		// Entries without a pane of their own still have to do something real:
		// "Go to Documents" hands control back to the host's document list.
		if (action === "exit") {
			visioStore.goToDocuments();
			return;
		}
		visioStore.setFileMenuOpen(false);
	}

	function handleBack(): void {
		visioStore.setActiveFileMenuPanel(null);
		visioStore.setFileMenuOpen(false);
	}

	const VISIO_FORMATS: ExportFormat[] = [
		{
			id: "wo-flowchart",
			label: "WO Flowchart",
			description: "World-Office Diagram",
			extension: ".wo-flowchart",
			mimeType: "application/json",
		},
		{
			id: "vsdx",
			label: "VSDX",
			description: "Visio Drawing",
			extension: ".vsdx",
			mimeType: "application/vnd.ms-visio.drawing",
		},
		{
			id: "pdf",
			label: "PDF",
			description: "Portable Document Format",
			extension: ".pdf",
			mimeType: "application/pdf",
		},
	];

	const produceVisioBlob = useCallback(
		async (
			formatId: string,
		): Promise<{ blob: Blob; fileName: string; mimeType: string } | null> => {
			try {
				if (formatId === "wo-flowchart") {
					const blob = await visioStore.buildDocumentBlob();
					const fileName = visioStore.document?.title
						? `${visioStore.document.title.replace(/\.[^.]+$/, "")}.wo-flowchart`
						: "diagram.wo-flowchart";
					return { blob, fileName, mimeType: "application/json" };
				}
				const visioBlob = await visioStore.buildDocumentBlob();
				const json = await visioBlob.text();
				const res = await fetch(
					import.meta.env?.VITE_CONVERSION_API_URL ??
						"http://localhost:8003/convert",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							input_format: "wo-visio-diagram",
							output_format: formatId,
							data: btoa(json),
						}),
					},
				);
				if (!res.ok) return null;
				const result = await res.json();
				const outputB64: string | undefined =
					result?.data ?? result?.job?.output_data;
				if (!outputB64) return null;
				const bin = atob(outputB64);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				const fmt = VISIO_FORMATS.find((f) => f.id === formatId);
				const mime = fmt?.mimeType ?? "application/octet-stream";
				const blob = new Blob([bytes], { type: mime });
				return {
					blob,
					fileName: `diagram${fmt?.extension ?? `.${formatId}`}`,
					mimeType: mime,
				};
			} catch {
				return null;
			}
		},
		[],
	);

	const handleExport = useCallback(
		async (format: ExportFormat): Promise<boolean> => {
			const result = await produceVisioBlob(format.id);
			if (!result) return false;
			const url = URL.createObjectURL(result.blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = result.fileName;
			a.click();
			URL.revokeObjectURL(url);
			return true;
		},
		[produceVisioBlob],
	);

	const emailConfig: EmailConfig = {
		endpoint: "/api/send-email-attachment",
		produceAttachment: produceVisioBlob,
		defaultSubject: "Diagram: {{fileName}}",
	};

	return (
		<div className={styles.root}>
			<div className={styles.list} role="menubar" aria-label="File menu">
				<FileMenuItems onMenuClick={handleMenuClick} onBack={handleBack} />
			</div>
			<div className={styles.panelContainer}>
				<div className={styles.panelBox}>
					<CreateNewPanel visible={activePanel === "new"} />
					<SaveAsPanel visible={activePanel === "saveas"} />
					<SaveCopyPanel visible={activePanel === "save-copy"} />
					<SettingsPanel visible={activePanel === "opts"} />
					<DocumentInfoPanel visible={activePanel === "info"} />
					<HelpPanel visible={activePanel === "help"} />
					<RenamePanel visible={activePanel === "rename"} />
					<PrintPreviewPanel visible={activePanel === "printpreview"} />
				</div>
			</div>

			{activePanel === "export" && (
				<ExportWizard
					visible
					groups={[{ heading: "Diagram", formats: VISIO_FORMATS }]}
					onExport={handleExport}
					emailConfig={emailConfig}
					onClose={() => visioStore.setActiveFileMenuPanel(null)}
				/>
			)}
		</div>
	);
}

// FileMenu reads visioStore.activeFileMenuPanel inline — without the mobx
// observer a menu-entry click flipped the store yet the pane never switched
// (and the ExportWizard's own ✕ could never unmount the dialog: the modal was
// impossible to close for the user).
export const FileMenu = observer(FileMenuInner);

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
});

function PrintPreviewPanel({ visible }: { visible: boolean }) {
	const styles = usePrintPreviewStyles();
	return (
		<div
			className={styles.wrapper}
			style={{ display: visible ? "block" : "none" }}
		>
			<div className={styles.header}>Print Preview</div>
		</div>
	);
}
