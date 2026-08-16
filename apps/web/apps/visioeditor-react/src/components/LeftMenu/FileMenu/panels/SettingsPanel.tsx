import { Checkbox, Divider, makeStyles, Select, tokens } from "@fluentui/react-components"
import i18n from "i18next"
import { useTranslation } from "react-i18next"

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
			padding: "12px 0 4px 0",
			fontSize: tokens.fontSizeBase200,
			fontWeight: tokens.fontWeightSemibold,
			color: tokens.colorNeutralForeground1,
		},
	},
	leftCell: {
		"& label": {
			color: tokens.colorNeutralForeground3,
			fontSize: tokens.fontSizeBase100,
		},
	},
	rightCell: {
		textAlign: "right",
	},
})

export function SettingsPanel({ visible }: { visible: boolean }) {
	const { t } = useTranslation()
	const styles = useStyles()

	return (
		<div className={styles.wrapper} style={{ display: visible ? "block" : "none", padding: 0 }}>
			<div className={styles.header}>{t("Advanced Settings")}</div>
			<table className={styles.table}>
				<tbody>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>{t("Language")}</span>
						</td>
						<td className={styles.rightCell}>
							<Select
								size="small"
								value={i18n.language?.substring(0, 2) || "en"}
								onChange={(e) => i18n.changeLanguage(e.target.value)}
								style={{ minWidth: "120px" }}
							>
								<option value="en">English</option>
								<option value="de">Deutsch</option>
								<option value="fr">Français</option>
								<option value="es">Español</option>
								<option value="it">Italiano</option>
								<option value="pt">Português</option>
								<option value="ru">Русский</option>
								<option value="zh">中文</option>
								<option value="ja">日本語</option>
								<option value="ko">한국어</option>
								<option value="nl">Nederlands</option>
								<option value="pl">Polski</option>
								<option value="tr">Türkçe</option>
								<option value="ar">العربية</option>
							</Select>
						</td>
					</tr>
					<tr>
						<td colSpan={2}>
							<Divider />
						</td>
					</tr>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>{t("Interface Theme")}</span>
						</td>
						<td className={styles.rightCell}>
							<Select
								size="small"
								defaultValue="default"
								style={{ minWidth: "120px" }}
							>
								<option value="default">{t("Standard")}</option>
								<option value="light">{t("Light")}</option>
								<option value="dark">{t("Dark")}</option>
								<option value="dark-contrast">{t("Dark")} Contrast</option>
							</Select>
						</td>
					</tr>
					<tr>
						<td colSpan={2}>
							<Divider />
						</td>
					</tr>
					<tr className={styles.row}>
						<td className={styles.leftCell}>
							<span>{t("Spell Checking")}</span>
						</td>
						<td className={styles.rightCell}>
							<Checkbox defaultChecked label="" />
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	)
}
