import { useCallback, useMemo, useState } from "react"
import type { RibbonCommandDispatch, RibbonContext, RibbonSpec } from "../types"
import { RibbonPanel } from "./RibbonPanel"
import { RibbonTabBar } from "./RibbonTabBar"

interface RibbonProps {
  spec: RibbonSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
  /** Optional content to render before the tab buttons (e.g. File button) */
  beforeTabs?: React.ReactNode
  /** Optional extra content to render in the tab bar's right area (e.g. collaboration status) */
  tabBarExtra?: React.ReactNode
}

export function Ribbon({ spec, context, dispatch, beforeTabs, tabBarExtra }: RibbonProps) {
  const visibleTabs = useMemo(
    () => spec.tabs.filter((t) => !t.visible || t.visible(context)),
    [spec.tabs, context],
  )

  const initialTab = visibleTabs.length > 0 ? visibleTabs[0].id : ""
  const [activeTabId, setActiveTabId] = useState(initialTab)

  const activeTab = useMemo(
    () => visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0],
    [visibleTabs, activeTabId],
  )

  const handleTabChange = useCallback((tabId: string) => setActiveTabId(tabId), [])

  const enrichedContext: RibbonContext = { ...context, activeTab: activeTab?.id ?? "" }

  return (
    <div className="de-toolbar">
      <RibbonTabBar
        tabs={visibleTabs}
        activeTabId={activeTab?.id ?? ""}
        onTabChange={handleTabChange}
        beforeTabs={beforeTabs}
        extra={tabBarExtra}
      />
      {activeTab && (
        <RibbonPanel
          key={activeTab.id}
          tab={activeTab}
          context={enrichedContext}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}
