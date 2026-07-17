import type { ReactNode } from "react";
import { spreadsheetStore } from "../stores/SpreadsheetStore";
import { DocumentHolder } from "./DocumentHolder";
import { FileMenu } from "./FileMenu/FileMenu";
import { FormulaBar } from "./FormulaBar";
import { LeftMenu } from "./LeftMenu/LeftMenu";
import { RightMenu } from "./RightMenu/RightMenu";
import { SheetTabBar } from "./SheetTabBar";
import { StatusBar } from "./StatusBar/StatusBar";
import type { MonacoCommand } from "./Toolbar/MonacoCommand";
import { Toolbar } from "./Toolbar/Toolbar";

interface ViewportProps {
	toolbarVisible: boolean;
	statusbarVisible: boolean;
	leftMenuVisible: boolean;
	rightMenuVisible: boolean;
	isCompactToolbar: boolean;
	onMonacoCommand: (command: MonacoCommand) => void;
}

export function Viewport({
	toolbarVisible,
	statusbarVisible,
	leftMenuVisible,
	rightMenuVisible,
	isCompactToolbar,
	onMonacoCommand,
}: ViewportProps): ReactNode {
	const toolbarHeight = isCompactToolbar
		? "var(--wo-se-toolbar-height-compact, 34px)"
		: "var(--wo-se-toolbar-height, 40px)";

	return (
		<div className="se-viewport">
			{/* File menu panel — full-screen overlay */}
			<section
				className="se-file-menu-panel"
				style={{ display: spreadsheetStore.isFileMenuOpen ? "block" : "none" }}
			>
				<FileMenu />
			</section>

			{/* Vertical layout: toolbar → formula bar → body → sheet tabs → statusbar */}
			<div className="se-viewport-vbox">
				{/* Toolbar row */}
				{toolbarVisible && (
					<div
						className="se-viewport-toolbar"
						style={{ height: toolbarHeight }}
						role="toolbar"
					>
						<Toolbar onMonacoCommand={onMonacoCommand} />
					</div>
				)}

				{/* Formula bar row */}
				<FormulaBar />

				{/* Body row: left-menu | about-panel | editor | right-menu */}
				<div className="se-viewport-body">
					{leftMenuVisible && (
						<div
							className="se-viewport-left-menu"
							style={{ width: "var(--wo-se-leftmenu-width, 40px)" }}
						>
							<LeftMenu />
						</div>
					)}

					{/* About panel (overlay when about button is toggled) */}
					<div
						className="se-about-menu-panel"
						style={{
							display:
								spreadsheetStore.activeLeftPanel === "about" ? "block" : "none",
						}}
					/>

					{/* Editor container */}
					<div className="se-viewport-editor">
						<DocumentHolder />
					</div>

					{rightMenuVisible && (
						<div
							className="se-viewport-right-menu"
							style={{ width: "var(--wo-se-rightmenu-width, 40px)" }}
						>
							<RightMenu />
						</div>
					)}
				</div>

				{/* Sheet tab bar row */}
				<SheetTabBar />

				{/* Statusbar row */}
				{statusbarVisible && (
					<div className="se-viewport-statusbar">
						<StatusBar />
					</div>
				)}
			</div>
		</div>
	);
}
