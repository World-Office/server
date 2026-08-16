import { makeStyles, tokens } from "@fluentui/react-components"

const useStyles = makeStyles({
	wrapper: {
		height: "100%",
		padding: 0,
		overflowY: "hidden",
		position: "relative",
	},
	header: {
		fontSize: tokens.fontSizeHero800,
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground1,
		padding: "24px 20px 20px 0",
		whiteSpace: "nowrap",
	},
	helpContent: {
		padding: "8px 20px 20px 0",
		fontSize: tokens.fontSizeBase100,
		lineHeight: 1.6,
		color: tokens.colorNeutralForeground3,
	},
})

export function HelpPanel({ visible }: { visible: boolean }) {
	const styles = useStyles()

	return (
		<div className={styles.wrapper} style={{ display: visible ? "block" : "none" }}>
			<div className={styles.header}>Help</div>
			<div className={styles.helpContent}>
				<p>Visit the World Office documentation for detailed guides and tutorials.</p>
			</div>
		</div>
	)
}
