import { Tab, TabList, makeStyles, tokens } from "@fluentui/react-components"
import { useTranslation } from "react-i18next"
import type { RibbonTabSpec } from "../types"

const useStyles = makeStyles({
	tabBar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-start",
		padding: "0 4px",
		gap: "0px",
		height: "36px",
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		background: tokens.colorNeutralBackground1,
	},
	extraLeft: {
		flex: 0,
		minWidth: "4px",
	},
	extraRight: {
		flex: 1,
		display: "flex",
		justifyContent: "flex-end",
		alignItems: "center",
		paddingRight: "8px",
		gap: "8px",
	},
	tab: {
		fontSize: tokens.fontSizeBase300,
	},
})

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
	const styles = useStyles()

	return (
		<div className={styles.tabBar}>
			<div className={styles.extraLeft} />
			{beforeTabs}
			<TabList
				selectedValue={activeTabId}
				onTabSelect={(_, data) => {
					if (data.value) onTabChange(String(data.value))
				}}
				size="small"
			>
				{tabs.map((tab) => (
					<Tab
						key={tab.id}
						value={tab.id}
						data-tab-value={tab.id}
						className={styles.tab}
					>
						{t(tab.label)}
					</Tab>
				))}
			</TabList>
			<div className={styles.extraRight}>{extra}</div>
		</div>
	)
}
