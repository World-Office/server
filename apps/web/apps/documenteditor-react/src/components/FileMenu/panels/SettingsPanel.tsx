import { useTranslation } from "react-i18next"
import i18n from "i18next"
import { observer } from "mobx-react-lite"
import { documentStore } from "../../../stores/DocumentStore"

const ObservedSettingsPanel = observer(function ObservedSettingsPanel({ visible }: { visible: boolean }) {
  const { t } = useTranslation()

  function handleClose(): void {
    documentStore.setActiveFileMenuPanel(null)
    documentStore.setFileMenuOpen(false)
  }

  return (
    <div
      className="de-file-menu-content-box"
      style={{ display: visible ? "block" : "none", padding: "0", flexDirection: "column" }}
    >
      <div className="de-file-menu-header">{t("Advanced Settings")}</div>
      <div className="de-file-menu-settings-table">
        <tbody>
          <tr className="de-file-menu-row">
            <td className="de-file-menu-group td">
              <span className="de-file-menu-label">{t("Language")}</span>
            </td>
            <td className="de-file-menu-right">
              <select
                className="de-file-menu-select"
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
          <tr className="de-file-menu-row">
            <td className="de-file-menu-group td">
              <span className="de-file-menu-label">{t("Font Rendering")}</span>
            </td>
            <td className="de-file-menu-right">
              <select className="de-file-menu-select" defaultValue="auto">
                <option value="auto">{t("Automatic")}</option>
                <option value="windows">Windows GDI</option>
                <option value="gdi">GDI</option>
                <option value="mac">macOS</option>
                <option value="linux">Linux X11</option>
              </select>
            </td>
          </tr>
          <tr className="de-file-menu-row">
            <td className="de-file-menu-group td">
              <span className="de-file-menu-label">{t("Spell Checking")}</span>
            </td>
            <td className="de-file-menu-right">
              <label className="de-file-menu-checkbox">
                <input
                  type="checkbox"
                  checked={documentStore.spellingEnabled}
                  onChange={(e) => documentStore.setSpellingEnabled(e.target.checked)}
                />
                <span>{t("Spell Check as you type")}</span>
              </label>
            </td>
          </tr>
          <tr className="de-file-menu-row">
            <td className="de-file-menu-group td">
              <span className="de-file-menu-label">{t("Track Changes")}</span>
            </td>
            <td className="de-file-menu-right">
              <label className="de-file-menu-checkbox">
                <input
                  type="checkbox"
                  checked={documentStore.trackChanges}
                  onChange={(e) => documentStore.setTrackChanges(e.target.checked)}
                />
                <span>{t("Enable change tracking")}</span>
              </label>
            </td>
          </tr>
          <tr className="de-file-menu-row">
            <td className="de-file-menu-group td">
              <span className="de-file-menu-label">{t("Compact Toolbar")}</span>
            </td>
            <td className="de-file-menu-right">
              <label className="de-file-menu-checkbox">
                <input
                  type="checkbox"
                  checked={documentStore.isCompactToolbar}
                  onChange={(e) => documentStore.setCompactToolbar(e.target.checked)}
                />
                <span>{t("Reduce toolbar height")}</span>
              </label>
            </td>
          </tr>
          <tr className="de-file-menu-row">
            <td className="de-file-menu-group td">
              <span className="de-file-menu-label">{t("Compact Statusbar")}</span>
            </td>
            <td className="de-file-menu-right">
              <label className="de-file-menu-checkbox">
                <input
                  type="checkbox"
                  checked={documentStore.isCompactStatusbar}
                  onChange={(e) => documentStore.setCompactStatusbar(e.target.checked)}
                />
                <span>{t("Reduce status bar height")}</span>
              </label>
            </td>
          </tr>
        </tbody>
      </div>
      <div className="de-file-menu-footer">
        <button type="button" onClick={handleClose}>
          {t("Close")}
        </button>
      </div>
    </div>
  )
})

export { ObservedSettingsPanel as SettingsPanel }
