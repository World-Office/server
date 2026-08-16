import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components"
import { useTranslation } from "react-i18next"
import type { RibbonCommandDispatch, RibbonContext, RibbonGroupSpec } from "../types"
import { ControlRenderer } from "./ControlRenderer"

const useStyles = makeStyles({
  group: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    padding: "0 8px",
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    minHeight: "100%",
  },
  groupLast: {
    borderRight: "none",
  },
  elset: {
    display: "flex",
    alignItems: "center",
    gap: "1px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  label: {
    display: "block",
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    padding: "0 2px",
    marginTop: "1px",
    maxWidth: "64px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
})

interface RibbonGroupProps {
  group: RibbonGroupSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
  isLast?: boolean
}

export function RibbonGroup({ group, context, dispatch, isLast }: RibbonGroupProps) {
  const { t } = useTranslation()
  const styles = useStyles()

  return (
    <div className={mergeClasses(styles.group, isLast ? styles.groupLast : undefined)}>
      <div className={styles.elset}>
        {group.controls.map((control) => (
          <ControlRenderer
            key={control.id}
            control={control}
            context={context}
            dispatch={dispatch}
          />
        ))}
      </div>
      <span className={styles.label}>{t(group.label)}</span>
    </div>
  )
}
