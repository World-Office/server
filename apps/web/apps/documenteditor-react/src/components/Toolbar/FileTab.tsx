import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components"
import { observer } from "mobx-react-lite"
import { documentStore } from "../../stores/DocumentStore"

const useStyles = makeStyles({
  tab: {
    height: "100%",
    minWidth: "auto",
    padding: "0 14px",
    borderBottom: "2px solid transparent",
    marginBottom: "-1px",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    ":hover": {
      color: tokens.colorNeutralForeground1,
    },
  },
  active: {
    color: tokens.colorBrandForeground1,
    borderBottomColor: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
})

const ObservedFileTab = observer(function ObservedFileTab() {
  const isActive = documentStore.isFileMenuOpen
  const styles = useStyles()

  function handleClick() {
    if (isActive) {
      documentStore.setFileMenuOpen(false)
    } else {
      documentStore.setActiveTab("file")
    }
  }

  return (
    <Button
      appearance="subtle"
      className={mergeClasses(styles.tab, isActive && styles.active)}
      data-tab="file"
      onClick={handleClick}
      aria-label="File"
    >
      File
    </Button>
  )
})

export { ObservedFileTab as FileTab }
