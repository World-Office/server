import { observer } from "mobx-react-lite";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import { DataTableTab } from "./DataTableTab";
import { FileTab } from "./FileTab";
import { FormulaTab } from "./FormulaTab";
import { HomeTab } from "./HomeTab";
import { InsertTab } from "./InsertTab";
import { LayoutTab } from "./LayoutTab";
import type { MonacoCommand } from "./MonacoCommand";

interface ToolbarProps {
	onMonacoCommand: (command: MonacoCommand) => void;
}

const ObservedToolbar = observer(function ObservedToolbar({
	onMonacoCommand,
}: ToolbarProps) {
	const isEditMode = spreadsheetStore.isEditMode;
	const isTableSelected = false; // Placeholder for conditional DataTableTab

	return (
		<div className="se-toolbar">
			<div className="se-toolbar-tabs">
				<div className="se-toolbar-extra-left" />
				<FileTab />
				<HomeTab onMonacoCommand={onMonacoCommand} />
				{isEditMode && <InsertTab />}
				{isEditMode && <LayoutTab />}
				<FormulaTab />
				{isEditMode && isTableSelected && <DataTableTab />}
				<div className="se-toolbar-extra-right" />
			</div>
			<section className="se-toolbar-controls" role="tabpanel">
				<section className="se-toolbar-static" />
				<section className="se-toolbar-panels" />
			</section>
		</div>
	);
});

export { ObservedToolbar as Toolbar };
