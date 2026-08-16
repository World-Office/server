import { Button, makeStyles, tokens } from "@fluentui/react-components"
import { pdfStore } from "../../../stores/PdfStore"

interface TemplateInfo {
	id: string
	name: string
	description: string
	icon: string
}

const TEMPLATES: TemplateInfo[] = [
	{ id: "blank", name: "Blank PDF", description: "Empty PDF document", icon: "📄" },
	{ id: "form", name: "Form", description: "Fillable form template", icon: "📋" },
	{ id: "report", name: "Report", description: "Business report template", icon: "📊" },
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
	formats: {
		display: "flex",
		flexDirection: "column",
		gap: "8px",
		paddingTop: "8px",
	},
	card: {
		display: "flex",
		alignItems: "center",
		gap: "12px",
		padding: "12px",
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		borderRadius: tokens.borderRadiusMedium,
		cursor: "pointer",
		":hover": {
			backgroundColor: tokens.colorNeutralBackground1Hover,
			outline: `1px solid ${tokens.colorBrandStroke1}`,
		},
	},
	icon: {
		fontSize: "28px",
		width: "50px",
		height: "50px",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.colorNeutralBackground2,
		borderRadius: tokens.borderRadiusMedium,
		flexShrink: 0,
	},
	info: {
		flex: 1,
		minWidth: 0,
	},
	name: {
		fontSize: tokens.fontSizeBase200,
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground1,
	},
	desc: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		marginTop: "2px",
	},
})

export function CreateNewPanel({ visible }: { visible: boolean }) {
	const styles = useStyles()

	function handleUseTemplate(_id: string): void {
		pdfStore.setFileMenuOpen(false)
		pdfStore.setActiveFileMenuPanel(null)
	}

	return (
		<div className={styles.wrapper} style={{ display: visible ? "block" : "none", padding: 0 }}>
			<div className={styles.header}>Create New</div>
			<div className={styles.formats}>
				{TEMPLATES.map((tpl) => (
					<Button
						key={tpl.id}
						appearance="subtle"
						className={styles.card}
						onClick={() => handleUseTemplate(tpl.id)}
						aria-label={tpl.name}
					>
						<div className={styles.icon}>{tpl.icon}</div>
						<div className={styles.info}>
							<div className={styles.name}>{tpl.name}</div>
							<div className={styles.desc}>{tpl.description}</div>
						</div>
					</Button>
				))}
			</div>
		</div>
	)
}
