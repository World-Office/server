import i18n from "i18next";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export function SettingsPanel({ visible }: { visible: boolean }): JSX.Element {
	const { t } = useTranslation();

	return (
		<div
			className="prese-file-menu-content-box"
			style={{
				display: visible ? "block" : "none",
				padding: 0,
				flexDirection: "column",
			}}
		>
			<div className="prese-file-menu-header">{t("Advanced Settings")}</div>
			<table className="prese-file-menu-settings-table">
				<tbody>
					<tr className="prese-file-menu-row">
						<td className="prese-file-menu-left">
							<span className="prese-file-menu-label">{t("Language")}</span>
						</td>
						<td className="prese-file-menu-right">
							<select
								className="prese-file-menu-select"
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
					<tr className="prese-file-menu-row">
						<td className="prese-file-menu-left">
							<span className="prese-file-menu-label">
								{t("Interface Theme")}
							</span>
						</td>
						<td className="prese-file-menu-right">
							<select className="prese-file-menu-select" defaultValue="default">
								<option value="default">{t("Standard")}</option>
								<option value="light">{t("Light")}</option>
								<option value="dark">{t("Dark")}</option>
								<option value="dark-contrast">{t("Dark")} Contrast</option>
							</select>
						</td>
					</tr>
					<tr className="prese-file-menu-row">
						<td className="prese-file-menu-left">
							<span className="prese-file-menu-label">
								{t("Font Rendering")}
							</span>
						</td>
						<td className="prese-file-menu-right">
							<select className="prese-file-menu-select" defaultValue="auto">
								<option value="auto">{t("Automatic")}</option>
								<option value="windows">Windows GDI</option>
								<option value="gdi">GDI</option>
								<option value="mac">macOS</option>
								<option value="linux">Linux X11</option>
							</select>
						</td>
					</tr>
					<tr className="prese-file-menu-row">
						<td className="prese-file-menu-left">
							<span className="prese-file-menu-label">
								{t("Spell Checking")}
							</span>
						</td>
						<td className="prese-file-menu-right">
							<label className="prese-file-menu-checkbox">
								<input type="checkbox" defaultChecked={false} />
								<span>{t("Spell Check as you type")}</span>
							</label>
						</td>
					</tr>
					<tr className="prese-file-menu-row">
						<td className="prese-file-menu-left">
							<span className="prese-file-menu-label">{t("Autosave")}</span>
						</td>
						<td className="prese-file-menu-right">
							<label className="prese-file-menu-checkbox">
								<input type="checkbox" defaultChecked={false} />
								<span>{t("Autosave every 5 min")}</span>
							</label>
						</td>
					</tr>
					<tr className="prese-file-menu-row">
						<td className="prese-file-menu-left">
							<span className="prese-file-menu-label">{t("Co-Authoring")}</span>
						</td>
						<td className="prese-file-menu-right">
							<label className="prese-file-menu-checkbox">
								<input type="checkbox" defaultChecked={false} />
								<span>{t("Track Changes")}</span>
							</label>
						</td>
					</tr>
				</tbody>
			</table>
			<div className="prese-file-menu-footer">
				<button type="button" onClick={() => {}}>
					{t("Close")}
				</button>
			</div>
		</div>
	);
}
