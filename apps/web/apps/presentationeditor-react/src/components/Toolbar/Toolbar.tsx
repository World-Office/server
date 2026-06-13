import { observer } from "mobx-react-lite";
import { presentationStore } from "../../stores/PresentationStore";
import { AnimationTab } from "./AnimationTab";
import { DesignTab } from "./DesignTab";
import { FileTab } from "./FileTab";
import { HomeTab } from "./HomeTab";
import { InsertTab } from "./InsertTab";
import { TransitionsTab } from "./TransitionsTab";

const ObservedToolbar = observer(function ObservedToolbar() {
	const isEditMode = presentationStore.isEditMode;

	return (
		<div className="prese-toolbar">
			<div className="prese-toolbar-tabs">
				<div className="prese-toolbar-extra-left" />
				<FileTab />
				<HomeTab />
				{isEditMode && <InsertTab />}
				{isEditMode && <DesignTab />}
				<TransitionsTab />
				<AnimationTab />
				<div className="prese-toolbar-extra-right" />
			</div>
			<section className="prese-toolbar-controls" role="tabpanel">
				<section className="prese-toolbar-static" />
				<section className="prese-toolbar-panels" />
			</section>
		</div>
	);
});

export { ObservedToolbar as Toolbar };
