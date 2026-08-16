import { Button, makeStyles, tokens } from "@fluentui/react-components"
import { visioStore } from "../../../../stores/VisioStore"

const FLOWCHART_FORMATS = [
	{
		id: "wo-flowchart",
		label: "WO Flowchart",
		description: "World-Office Diagram (JSON)",
	},
]

const VSDX_FORMATS = [
	{ id: "vsdx", label: "VSDX", description: "Visio Drawing" },
]

const useStyles = makeStyles({
	wrapper: {
		height: "100%",
		overflowY: "auto",
		position: "relative",
	},
	header: {
		fontSize: tokens.fontSizeHero800,
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground1,
		padding: "24px 20px 20px 0",
		whiteSpace: "nowrap",
	},
	body: {
		padding: "0 0 0 20px",
	},
	instruction: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		marginBottom: tokens.spacingVerticalS,
	},
	formats: {
		display: "flex",
		flexWrap: "wrap",
		gap: "12px",
		paddingTop: "8px",
	},
	formatBtn: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "90px",
		height: "70px",
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		borderRadius: tokens.borderRadiusSmall,
		backgroundColor: tokens.colorNeutralBackground1,
		cursor: "pointer",
		":hover": {
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
	formatIcon: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		fontWeight: tokens.fontWeightSemibold,
	},
	footer: {
		display: "flex",
		justifyContent: "flex-end",
		padding: "12px 0",
	},
})

export function SaveAsPanel({ visible }: { visible: boolean }) {
	const styles = useStyles()

	function handleClose(): void {
		visioStore.setFileMenuOpen(false)
		visioStore.setActiveFileMenuPanel(null)
	}

	async function handleExport(format: string): Promise<void> {
		if (format === "wo-flowchart" || format === "vsdx") {
			await visioStore.exportAsDownload()
			handleClose()
			return
		}

		alert(`Export to ${format.toUpperCase()} is not yet supported`)
	}

	return (
		<div
			className={styles.wrapper}
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className={styles.header}>Download as</div>
			<div className={styles.body}>
				<p className={styles.instruction}>Select a format to export the diagram.</p>
			</div>
			<div className={styles.formats}>
				{FLOWCHART_FORMATS.map((format) => (
					<Button
						key={format.id}
						appearance="subtle"
						className={styles.formatBtn}
						onClick={() => handleExport(format.id)}
					>
						<div className={styles.formatIcon}>
							<span>{format.label}</span>
						</div>
					</Button>
				))}
				{VSDX_FORMATS.map((format) => (
					<Button
						key={format.id}
						appearance="subtle"
						className={styles.formatBtn}
						onClick={() => handleExport(format.id)}
					>
						<div className={styles.formatIcon}>
							<span>{format.label}</span>
						</div>
					</Button>
				))}
				{["PDF", "PDF/A", "PNG", "JPG"].map((format) => (
					<Button
						key={format}
						appearance="subtle"
						className={styles.formatBtn}
						disabled
						style={{ opacity: 0.5 }}
					>
						<div className={styles.formatIcon}>
							<span>{format}</span>
						</div>
					</Button>
				))}
			</div>
			<div className={styles.footer}>
				<Button appearance="secondary" onClick={handleClose}>
					Cancel
				</Button>
			</div>
		</div>
	)
}
