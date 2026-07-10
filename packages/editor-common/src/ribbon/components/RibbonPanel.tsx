import type { RibbonCommandDispatch, RibbonContext, RibbonTabSpec } from "../types"
import { RibbonGroup } from "./RibbonGroup"

interface RibbonPanelProps {
  tab: RibbonTabSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
}

export function RibbonPanel({ tab, context, dispatch }: RibbonPanelProps) {
  const visibleGroups = tab.groups.filter((g) => !g.visible || g.visible(context))

  if (visibleGroups.length === 0) return null

  return (
    <section className={`de-${tab.id}-tab-panel`} data-tab={tab.id} role="tabpanel">
      {visibleGroups.map((group) => (
        <RibbonGroup key={group.id} group={group} context={context} dispatch={dispatch} />
      ))}
    </section>
  )
}
