import { useTranslation } from "react-i18next"
import i18n from "i18next"

export function SettingsPanel({ visible }: { visible: boolean }) {
	const { t } = useTranslation()

	return (
		<div
			className="se-file-menu-content-box"
			style={{ display: visible ? "block" : "none", padding: "0 0 0 20px" }}
		>
			<div className="se-file-menu-header">{t("Advanced Settings")}</div>
			<table className="se-file-menu-settings-table">
				<tbody>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">{t("Language")}</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select
								className="se-file-menu-select"
								value={i18n.language?.substring(0, 2) || "en"}
								onChange={(e) => i18n.changeLanguage(e.target.value)}
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
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">{t("Macros")}</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="enabled">{t("Enabled")}</option>
								<option value="disabled">{t("Disabled")}</option>
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">{t("Show Formula Bar")}</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="show">{t("Show")}</option>
								<option value="hide">{t("Hide")}</option>
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">{t("Show Headings")}</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="show">{t("Show")}</option>
								<option value="hide">{t("Hide")}</option>
							</select>
						</td>
					</tr>
					<tr className="se-file-menu-settings-divider">
						<td colSpan={2} />
					</tr>
					<tr className="se-file-menu-settings-group">
						<td className="se-file-menu-settings-left">
							<span className="se-file-menu-label">{t("Show Gridlines")}</span>
						</td>
						<td className="se-file-menu-settings-right">
							<select className="se-file-menu-select">
								<option value="show">{t("Show")}</option>
								<option value="hide">{t("Hide")}</option>
							</select>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
