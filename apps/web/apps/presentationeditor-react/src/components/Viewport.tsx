import type { ReactNode } from "react";
import { presentationStore } from "../stores/PresentationStore";
import { DocumentHolder } from "./DocumentHolder";
import { FileMenu } from "./FileMenu/FileMenu";
import { LeftMenu } from "./LeftMenu/LeftMenu";
import { RightMenu } from "./RightMenu/RightMenu";
import { StatusBar } from "./StatusBar/StatusBar";
import { Toolbar } from "./Toolbar/Toolbar";

interface ViewportProps {
	toolbarVisible: boolean;
	statusbarVisible: boolean;
	leftMenuVisible: boolean;
	rightMenuVisible: boolean;
	isCompactToolbar: boolean;
}

export function Viewport({
	toolbarVisible,
	statusbarVisible,
	leftMenuVisible,
	rightMenuVisible,
	isCompactToolbar,
}: ViewportProps): ReactNode {
	const toolbarHeight = isCompactToolbar
		? "var(--wo-prese-toolbar-height-compact, 34px)"
		: "var(--wo-prese-toolbar-height, 40px)";

	return (
		<div className="prese-viewport">
			{/* File menu panel — full-screen overlay */}
			<section
				className="prese-file-menu-panel"
				style={{ display: presentationStore.isFileMenuOpen ? "block" : "none" }}
			>
				<FileMenu />
			</section>

			{/* Vertical layout: toolbar → body → statusbar */}
			<div className="prese-viewport-vbox">
				{/* Toolbar row */}
				{toolbarVisible && (
					<div
						className="prese-viewport-toolbar"
						style={{ height: toolbarHeight }}
						role="toolbar"
					>
						<Toolbar />
					</div>
				)}

				{/* Body row: left-menu | about-panel | editor | right-menu */}
				<div className="prese-viewport-body">
					{leftMenuVisible && (
						<div
							className="prese-viewport-left-menu"
							style={{ width: "var(--wo-prese-leftmenu-width, 40px)" }}
						>
							<LeftMenu />
						</div>
					)}

					{/* About panel (overlay when about button is toggled) */}
					<div
						className="prese-about-menu-panel"
						style={{
							display:
								presentationStore.activeLeftPanel === "about"
									? "block"
									: "none",
						}}
					/>

					{/* Editor container */}
					<div className="prese-viewport-editor">
						<DocumentHolder />
					</div>

					{rightMenuVisible && (
						<div
							className="prese-viewport-right-menu"
							style={{ width: "var(--wo-prese-rightmenu-width, 40px)" }}
						>
							<RightMenu />
						</div>
					)}
				</div>

				{/* Statusbar row */}
				{statusbarVisible && (
					<div className="prese-viewport-statusbar">
						<StatusBar />
					</div>
				)}
			</div>
		</div>
	);
}
