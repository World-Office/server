import { Divider, makeStyles, tokens } from "@fluentui/react-components"
import { visioStore } from "../../../../stores/VisioStore"

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
	table: {
		width: "100%",
		borderCollapse: "collapse",
		marginTop: "8px",
	},
	row: {
		"& td": {
			padding: "10px 0",
			fontSize: tokens.fontSizeBase100,
			verticalAlign: "top",
		},
	},
	leftCell: {
		"& label, & span": {
			color: tokens.colorNeutralForeground3,
			fontSize: tokens.fontSizeBase100,
		},
	},
	rightCell: {
		"& span": {
			color: tokens.colorNeutralForeground1,
			fontSize: tokens.fontSizeBase100,
		},
	},
})

export function DocumentInfoPanel({ visible }: { visible: boolean }) {
	const styles = useStyles()
	const doc = visioStore.document

	return (
		<div
			className={styles.wrapper}
			style={{ display: visible ? "block" : "none", padding: "0 30px" }}
		>
			<div className={styles.header}>Document Info</div>
			<table className={styles.table}>
				<tbody>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>Title</span>
						</td>
						<td className={styles.rightCell}>
							<span>{doc?.title ?? "Untitled"}</span>
						</td>
					</tr>
					<tr>
						<td colSpan={2}>
							<Divider />
						</td>
					</tr>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>Author</span>
						</td>
						<td className={styles.rightCell}>
							<span>{doc?.info?.author ?? "—"}</span>
						</td>
					</tr>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>Created</span>
						</td>
						<td className={styles.rightCell}>
							<span>{doc?.info?.created ?? "—"}</span>
						</td>
					</tr>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>Modified</span>
						</td>
						<td className={styles.rightCell}>
							<span>{doc?.info?.modified ?? "—"}</span>
						</td>
					</tr>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>Format</span>
						</td>
						<td className={styles.rightCell}>
							<span>{doc?.fileType?.toUpperCase() ?? "—"}</span>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}
