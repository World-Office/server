import { makeStyles, tokens } from "@fluentui/react-components"
import type { RibbonCommandDispatch, RibbonContext, RibbonTabSpec } from "../types"
import { RibbonGroup } from "./RibbonGroup"

interface RibbonPanelProps {
  tab: RibbonTabSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
}

const useStyles = makeStyles({
  panel: {
    display: "flex",
    alignItems: "stretch",
    gap: "0px",
    padding: "6px 8px",
    background: tokens.colorNeutralBackground2,
    minHeight: "84px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
})

export function RibbonPanel({ tab, context, dispatch }: RibbonPanelProps) {
  const visibleGroups = tab.groups.filter((g) => !g.visible || g.visible(context))
  const styles = useStyles()

  if (visibleGroups.length === 0) return null

  return (
    <section className={styles.panel} data-tab={tab.id} role="tabpanel">
      {visibleGroups.map((group, idx) => (
        <RibbonGroup
          key={group.id}
          group={group}
          context={context}
          dispatch={dispatch}
          isLast={idx === visibleGroups.length - 1}
        />
      ))}
    </section>
  )
}
