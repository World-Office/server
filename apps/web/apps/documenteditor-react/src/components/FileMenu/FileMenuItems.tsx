import { Button, Divider, makeStyles, mergeClasses, tokens } from "@fluentui/react-components"
import { useTranslation } from "react-i18next"
import { openFile } from "../../bridge/file-operations"
import { documentStore } from "../../stores/DocumentStore"
import type { FileMenuAction } from "../../types/document"

interface FileMenuItemsProps {
  onMenuClick: (action: string, hasPanel: boolean) => void
  onBack: () => void
}

interface MenuItem {
  action: FileMenuAction | "close-editor"
  caption: string
  hasPanel: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { action: "saveas", caption: "Download as...", hasPanel: true },
  { action: "export", caption: "Export Wizard...", hasPanel: true },
  { action: "save-copy", caption: "Save Copy as...", hasPanel: true },
  { action: "save-desktop", caption: "Save as...", hasPanel: false },
  { action: "print", caption: "Print", hasPanel: false },
  { action: "printpreview", caption: "Print with Preview", hasPanel: true },
  { action: "rename", caption: "Rename...", hasPanel: false },
  { action: "info", caption: "Document Info...", hasPanel: true },
  { action: "rights", caption: "Access Rights...", hasPanel: true },
  { action: "share", caption: "Share...", hasPanel: true },
  { action: "history", caption: "Version History...", hasPanel: true },
  { action: "opts", caption: "Advanced Settings...", hasPanel: true },
  { action: "help", caption: "Help...", hasPanel: true },
  { action: "exit", caption: "Go to Documents", hasPanel: false },
  { action: "close-editor", caption: "Close Editor", hasPanel: false },
  { action: "external-help", caption: "External Help", hasPanel: false },
  { action: "suggest", caption: "Suggest Feature", hasPanel: false },
  { action: "create-new", caption: "Create New", hasPanel: true },
  { action: "open-recent", caption: "Open Recent", hasPanel: false },
  { action: "browse", caption: "Browse Files", hasPanel: false },
  { action: "protect", caption: "Protect Document", hasPanel: true },
]

const useStyles = makeStyles({
  root: {
    display: "block",
    listStyle: "none",
    margin: 0,
    padding: "8px 0",
  },
  backIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    marginRight: "10px",
    fontSize: "16px",
  },
  item: {
    minHeight: "36px",
    width: "100%",
    padding: "0 20px",
    justifyContent: "flex-start",
    borderRadius: 0,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: "nowrap",
    ":hover": {
      backgroundColor: tokens.colorSubtleBackgroundHover,
    },
  },
  active: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ":hover": {
      backgroundColor: tokens.colorBrandBackgroundHover,
    },
  },
  divider: {
    margin: "4px 12px",
  },
})

export function FileMenuItems({ onMenuClick, onBack }: FileMenuItemsProps) {
  const { t } = useTranslation()
  const activePanel = documentStore.activeFileMenuPanel
  const styles = useStyles()

  function handleBack(): void {
    onBack()
  }

  async function handleDesktopAction(action: string): Promise<void> {
    if (action === "browse") {
      documentStore.setActiveFileMenuPanel("browse")
      documentStore.setActiveTab("file")
      return
    }

    if (!documentStore.isDesktop) {
      onMenuClick(action, false)
      return
    }
    switch (action) {
      case "save-desktop": {
        if (documentStore.filePath) {
          onMenuClick(action, false)
        } else {
          onMenuClick("saveas", true)
        }
        break
      }
      case "open-recent": {
        const result = await openFile()
        if (result) {
          documentStore.setFilePath(result.path)
          documentStore.setDirty(false)
          documentStore.setFileMenuOpen(false)
          documentStore.setActiveFileMenuPanel(null)
        }
        break
      }
      default:
        onMenuClick(action, false)
    }
  }

  return (
    <ul className={styles.root}>
      <Button
        appearance="subtle"
        className={styles.item}
        onClick={handleBack}
        aria-label={t("Back")}
      >
        <span className={styles.backIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="ArrowLeft"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </span>
        {t("Back")}
      </Button>
      <Divider className={styles.divider} />
      {MENU_ITEMS.map((item) => (
        <Button
          key={item.action}
          appearance="subtle"
          className={mergeClasses(
            styles.item,
            activePanel === item.action ? styles.active : undefined,
          )}
          onClick={() => handleDesktopAction(item.action)}
        >
          {t(item.caption)}
        </Button>
      ))}
    </ul>
  )
}
