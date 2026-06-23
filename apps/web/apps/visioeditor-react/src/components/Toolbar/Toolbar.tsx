import { FileTab } from "./FileTab";
import { ViewTab } from "./ViewTab";

interface ToolbarProps {
	isEdit: boolean;
}

export function Toolbar({ isEdit }: ToolbarProps) {
	return (
		<div className="visio-toolbar">
			<div className="visio-toolbar-tabs">
				<div className="visio-toolbar-extra-left" />
				<FileTab />
				{isEdit && <ViewTab />}
				<div className="visio-toolbar-extra-right" />
			</div>
			<section className="visio-toolbar-controls" role="tabpanel">
				<section className="visio-toolbar-static" />
				<section className="visio-toolbar-panels" />
			</section>
		</div>
	);
}
