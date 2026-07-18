import i18n from "i18next";
import { useTranslation } from "react-i18next";

export function SettingsPanel({ visible }: { visible: boolean }) {
	const { t } = useTranslation();

	return (
		<div
			className="visio-file-menu-content-box"
			style={{
				display: visible ? "block" : "none",
				padding: 0,
				flexDirection: "column",
			}}
		>
			<div className="visio-file-menu-header">{t("Advanced Settings")}</div>
			<table className="visio-file-menu-settings-table">
				<tbody>
					<tr className="visio-file-menu-settings-group">
						<td className="visio-file-menu-settings-left">
							<span>{t("Language")}</span>
						</td>
						<td className="visio-file-menu-settings-right">
							<select
								className="visio-file-menu-select"
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
					<tr className="visio-file-menu-settings-divider" />
					<tr className="visio-file-menu-settings-group">
						<td className="visio-file-menu-settings-left">
							<span>{t("Interface Theme")}</span>
						</td>
						<td className="visio-file-menu-settings-right">
							<select className="visio-file-menu-select" defaultValue="default">
								<option value="default">{t("Standard")}</option>
								<option value="light">{t("Light")}</option>
								<option value="dark">{t("Dark")}</option>
								<option value="dark-contrast">{t("Dark")} Contrast</option>
							</select>
						</td>
					</tr>
					<tr className="visio-file-menu-settings-divider" />
					<tr className="visio-file-menu-settings-group">
						<td className="visio-file-menu-settings-left">
							<span>{t("Spell Checking")}</span>
						</td>
						<td className="visio-file-menu-settings-right">
							<input type="checkbox" defaultChecked />
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
