import { Button, Divider, makeStyles, mergeClasses, tokens } from "@fluentui/react-components"
import type { ReactElement } from "react"
import { useTranslation } from "react-i18next"
import { openFile } from "../../bridge/file-operations"
import { documentStore } from "../../stores/DocumentStore"
import type { FileMenuAction } from "../../types/document"

interface FileMenuItemsProps {
  onMenuClick: (action: string, hasPanel: boolean) => void
  onBack: () => void
}

interface MenuItem {
  action: FileMenuAction | "close-editor" | "save"
  caption: string
  hasPanel: boolean
  icon: string
}

interface MenuGroup {
  group: string
  items: MenuItem[]
}

// Ordered/generated to mirror the OnlyOffice backstage layout:
//   Back · Create New / Open Recent / Open · Save / Save Copy as / Download as …
//   · Print · Document Info / Access Rights / Protect / Share / Version History
//   · Advanced Settings · Help / Suggest · Exit.
const MENU_GROUPS: MenuGroup[] = [
  {
    group: "open",
    items: [
      { action: "create-new", caption: "Create New", hasPanel: true, icon: "filePlus" },
      { action: "open-recent", caption: "Open Recent", hasPanel: false, icon: "history" },
      { action: "browse", caption: "Browse Files", hasPanel: true, icon: "folder" },
    ],
  },
  {
    group: "save",
    items: [
      { action: "save", caption: "Save", hasPanel: false, icon: "save" },
      { action: "save-copy", caption: "Save Copy as...", hasPanel: true, icon: "copy" },
      { action: "save-desktop", caption: "Save as...", hasPanel: false, icon: "drive" },
      { action: "saveas", caption: "Download as...", hasPanel: true, icon: "download" },
      { action: "export", caption: "Export Wizard...", hasPanel: true, icon: "wand" },
    ],
  },
  {
    group: "print",
    items: [
      { action: "print", caption: "Print", hasPanel: false, icon: "printer" },
      { action: "printpreview", caption: "Print with Preview", hasPanel: true, icon: "eye" },
    ],
  },
  {
    group: "manage",
    items: [
      { action: "info", caption: "Document Info...", hasPanel: true, icon: "info" },
      { action: "rights", caption: "Access Rights...", hasPanel: true, icon: "shield" },
      { action: "protect", caption: "Protect Document", hasPanel: true, icon: "lock" },
      { action: "share", caption: "Share...", hasPanel: true, icon: "share" },
      { action: "history", caption: "Version History...", hasPanel: true, icon: "versions" },
    ],
  },
  {
    group: "settings",
    items: [
      { action: "opts", caption: "Advanced Settings...", hasPanel: true, icon: "gear" },
      { action: "rename", caption: "Rename...", hasPanel: false, icon: "pencil" },
    ],
  },
  {
    group: "help",
    items: [
      { action: "help", caption: "Help...", hasPanel: true, icon: "question" },
      { action: "external-help", caption: "External Help", hasPanel: false, icon: "globe" },
      { action: "suggest", caption: "Suggest Feature", hasPanel: false, icon: "bulb" },
    ],
  },
  {
    group: "exit",
    items: [
      { action: "exit", caption: "Go to Documents", hasPanel: false, icon: "home" },
      { action: "close-editor", caption: "Close Editor", hasPanel: false, icon: "x" },
    ],
  },
]

const ICONS: Record<string, ReactElement> = {
  filePlus: <path d="M14 3v4a1 1 0 0 0 1 1h4M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-4-4h-2zM12 11v6M9 14h6" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  save: <path d="M5 3h11l3 3v15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v5h6V3M5 21v-7h14v7" />,
  copy: <path d="M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />,
  drive: <path d="M5 15l2.5-7A2 2 0 0 1 9.4 6.5h5.2a2 2 0 0 1 1.9 1.5L19 15M3 15h18a1 1 0 0 1 .9 1.4l-1.6 3.6A2 2 0 0 1 18.4 21H5.6a2 2 0 0 1-1.9-1l-1.6-3.6A1 1 0 0 1 3 15z" />,
  download: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  wand: <path d="M6 3l.8 2.2L9 6l-2.2.8L6 9l-.8-2.2L3 6l2.2-.8L6 3zM15 8l.8 2.2L18 11l-2.2.8L15 14l-.8-2.2L12 11l2.2-.8L15 8zM8.5 13.5l7-7 1.5 1.5-7 7-2.5.5.5-2.5z" />,
  printer: <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7z" />,
  eye: <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  info: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6l8-3zM9.5 12l1.8 1.8L15 10" />,
  lock: <path d="M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3M12 15v2" />,
  share: <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 16V3m0 0L8 7m4-4l4 4" />,
  versions: <path d="M3 12a9 9 0 1 0 9-9M3 12a9 9 0 0 1 9-9M3 12h9l6-6" />,
  gear: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
  pencil: <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1zM13.5 6.5l3 3" />,
  question: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.9 2.1c-.9.6-1.4 1.2-1.4 2.4M12 17.5v.5" />,
  globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.8.6 1.2 1.2 1.3 2.1h4.4c.1-.9.5-1.5 1.3-2.1A6 6 0 0 0 12 3z" />,
  home: <path d="M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
}

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
    gap: "10px",
    borderRadius: 0,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: "nowrap",
    ":hover": {
      backgroundColor: tokens.colorSubtleBackgroundHover,
    },
  },
  icon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
  },
  chevron: {
    "::after": {
      content: "\"›\"",
      marginLeft: "auto",
      color: tokens.colorNeutralForeground3,
      fontSize: "12px",
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

    if (action === "save") {
      window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: "save" } }))
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
      <Button appearance="subtle" className={styles.item} onClick={handleBack} aria-label={t("Back")}>
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
      {MENU_GROUPS.map((group, gi) => (
        <li key={group.group}>
          {gi > 0 && <Divider className={styles.divider} />}
          {group.items.map((item) => (
            <Button
              key={item.action}
              appearance="subtle"
              className={mergeClasses(
                styles.item,
                activePanel === item.action ? styles.active : undefined,
                item.hasPanel ? styles.chevron : undefined,
              )}
              onClick={() => handleDesktopAction(item.action)}
            >
              <span className={styles.icon}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-hidden="true"
                >
                  {ICONS[item.icon] ?? ICONS.filePlus}
                </svg>
              </span>
              {t(item.caption)}
            </Button>
          ))}
        </li>
      ))}
    </ul>
  )
}
