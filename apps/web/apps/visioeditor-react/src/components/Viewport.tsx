import type { ReactNode } from "react";
import { visioStore } from "../stores/VisioStore";
import { DocumentHolder } from "./DocumentHolder";
import { FileMenu } from "./LeftMenu/FileMenu/FileMenu";
import { LeftMenu } from "./LeftMenu/LeftMenu";
import { RightMenu } from "./RightMenu/RightMenu";
import { StatusBar } from "./StatusBar/StatusBar";
import type { MonacoCommand } from "./Toolbar/MonacoCommand";
import { Toolbar } from "./Toolbar/Toolbar";

interface ViewportProps {
	toolbarVisible: boolean;
	statusbarVisible: boolean;
	leftMenuVisible: boolean;
	isCompactToolbar: boolean;
	onMonacoCommand: (command: MonacoCommand) => void;
}

export function Viewport({
	toolbarVisible,
	statusbarVisible,
	leftMenuVisible,
	isCompactToolbar,
	onMonacoCommand,
}: ViewportProps): ReactNode {
	const toolbarHeight = isCompactToolbar
		? "var(--wo-visio-toolbar-height-compact, 34px)"
		: "var(--wo-visio-toolbar-height, 40px)";

	return (
		<div className="visio-viewport">
			{/* File menu panel — full-screen overlay */}
			<section
				className="visio-file-menu-panel"
				style={{ display: visioStore.isFileMenuOpen ? "block" : "none" }}
			>
				<FileMenu />
			</section>

			{/* Vertical layout: toolbar → body → statusbar */}
			<div className="visio-viewport-vbox">
				{/* Toolbar row */}
				{toolbarVisible && (
					<div
						className="visio-viewport-toolbar"
						style={{ height: toolbarHeight }}
						role="toolbar"
					>
						<Toolbar
							isEdit={visioStore.mode?.isEdit ?? false}
							onMonacoCommand={onMonacoCommand}
						/>
					</div>
				)}

				{/* Body row: left-menu | about-panel | editor */}
				<div className="visio-viewport-body">
					{leftMenuVisible && (
						<div
							className="visio-viewport-left-menu"
							style={{ width: "var(--wo-visio-leftmenu-width, 40px)" }}
						>
							<LeftMenu />
						</div>
					)}

					{/* About panel (overlay when about button is toggled) */}
					<div
						className="visio-about-menu-panel"
						style={{
							display:
								visioStore.activeLeftPanel === "about" ? "block" : "none",
						}}
					/>

					{/* Editor container */}
					<div className="visio-viewport-editor">
						<DocumentHolder />
					</div>

					{/* Right menu */}
					<div
						className="visio-viewport-right-menu"
						style={{ width: "var(--wo-visio-rightmenu-width, 40px)" }}
					>
						<RightMenu />
					</div>
				</div>

				{/* Statusbar row */}
				{statusbarVisible && (
					<div className="visio-viewport-statusbar">
						<StatusBar />
					</div>
				)}
			</div>
		</div>
	);
}
