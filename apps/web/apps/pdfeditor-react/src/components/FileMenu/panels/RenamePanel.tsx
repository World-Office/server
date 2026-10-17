import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { Button, Input, makeStyles, tokens } from "@fluentui/react-components"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../../stores/PdfStore"

/**
 * File → Rename... — a dialog-declaring File-menu entry that had no surface of
 * its own (the click did nothing at all: no pane, no dialog). Edits the
 * document title (the ".pdf" extension is kept); the new name drives Document
 * Info and every export / download file name. The WOPI host exposes no rename
 * endpoint, so the change is local to the editor session.
 */
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
  body: {
    padding: "0 20px 0 20px",
    maxWidth: "520px",
  },
  instruction: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginTop: 0,
    marginBottom: tokens.spacingVerticalS,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
  },
  ext: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  footer: {
    display: "flex",
    gap: "8px",
    padding: "20px 0",
  },
})

export function RenamePanel({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const styles = useStyles()
  const inputRef = useRef<HTMLInputElement>(null)

  // current title split into base name + extension (".pdf" when none)
  const title = pdfStore.document?.title ?? ""
  const match = title.match(/^(.*?)(\.[^.]+)$/)
  const baseName = match ? match[1] : title || "Untitled"
  const extension = match ? match[2] : ".pdf"

  const [name, setName] = useState(baseName)

  // re-seed the input whenever the pane is (re)opened or the document changes
  useEffect(() => {
    if (!visible) return
    setName(baseName)
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
    return () => window.clearTimeout(id)
  }, [visible, baseName])

  function handleClose(): void {
    pdfStore.setActiveFileMenuPanel(null)
    pdfStore.setFileMenuOpen(false)
  }

  function handleRename(): void {
    const clean = name.trim()
    if (!clean) return
    pdfStore.renameDocument(`${clean}${extension}`)
    handleClose()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault()
      handleRename()
    } else if (event.key === "Escape") {
      event.preventDefault()
      handleClose()
    }
  }

  const canRename = name.trim().length > 0

  return (
    <div className={styles.wrapper} style={{ display: visible ? "block" : "none" }}>
      <div className={styles.header}>{t("Rename")}</div>
      <div className={styles.body}>
        <p className={styles.instruction}>
          Enter a new name for the document. The file extension is kept.
        </p>
        <div className={styles.row}>
          <Input
            ref={inputRef}
            className={styles.input}
            type="text"
            aria-label={t("File name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          <span className={styles.ext}>{extension}</span>
        </div>
        <div className={styles.footer}>
          <Button appearance="primary" disabled={!canRename} onClick={handleRename}>
            {t("Save")}
          </Button>
          <Button appearance="secondary" onClick={handleClose}>
            {t("Cancel")}
          </Button>
        </div>
      </div>
    </div>
  )
}
