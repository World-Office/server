import { useTranslation } from "react-i18next"
import type { RibbonTabSpec } from "../types"

interface RibbonTabBarProps {
  tabs: RibbonTabSpec[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  beforeTabs?: React.ReactNode
  extra?: React.ReactNode
}

export function RibbonTabBar({
  tabs,
  activeTabId,
  onTabChange,
  beforeTabs,
  extra,
}: RibbonTabBarProps) {
  const { t } = useTranslation()

  return (
    <div className="de-toolbar-tabs">
      <div className="de-toolbar-extra-left" />
      {beforeTabs}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`de-toolbar-tab ${tab.id === activeTabId ? "active" : ""}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={tab.id === activeTabId}
        >
          {t(tab.label)}
        </button>
      ))}
      <div className="de-toolbar-extra-right">{extra}</div>
    </div>
  )
}
