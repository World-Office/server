import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { Button, Input, makeStyles, tokens } from "@fluentui/react-components"
import { useTranslation } from "react-i18next"
import { pdfStore } from "../../../stores/PdfStore"

/**
 * File → Save Copy as... — the menu entry declared a panel
 * (`hasPanel: true`) but the pdf FileMenu never rendered one, so the click was
 * a no-op: no pane, no dialog, nothing. This pane names a local copy of the
 * current document (annotations included) and downloads it — the web build has
 * no server-side "copy" target, so the browser download IS the copy.
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
  destination: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalS,
  },
  footer: {
    display: "flex",
    gap: "8px",
    padding: "20px 0",
  },
})

export function SaveCopyPanel({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  const styles = useStyles()
  const inputRef = useRef<HTMLInputElement>(null)

  const title = pdfStore.document?.title ?? "document"
  const baseName = title.replace(/\.[^.]+$/, "") || "document"

  const [name, setName] = useState(`${baseName}-copy`)

  // re-seed the input whenever the pane is (re)opened or the document changes
  useEffect(() => {
    if (!visible) return
    setName(`${baseName}-copy`)
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

  function handleSaveCopy(): void {
    const clean = name.trim()
    if (!clean) return
    void pdfStore.saveCopyAs(clean)
    handleClose()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault()
      handleSaveCopy()
    } else if (event.key === "Escape") {
      event.preventDefault()
      handleClose()
    }
  }

  const canSave = name.trim().length > 0

  return (
    <div className={styles.wrapper} style={{ display: visible ? "block" : "none" }}>
      <div className={styles.header}>{t("Save Copy as")}</div>
      <div className={styles.body}>
        <p className={styles.instruction}>
          Save a copy of the current document (annotations included) to your device.
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
          <span className={styles.ext}>.pdf</span>
        </div>
        <div className={styles.destination}>{t("Destination")}: {t("Downloads")}</div>
        <div className={styles.footer}>
          <Button appearance="primary" disabled={!canSave} onClick={handleSaveCopy}>
            {t("Save Copy")}
          </Button>
          <Button appearance="secondary" onClick={handleClose}>
            {t("Cancel")}
          </Button>
        </div>
      </div>
    </div>
  )
}
