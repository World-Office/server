import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { spreadsheetStore } from "../stores/SpreadsheetStore";
import { getActiveUniverAPI, onUniverChange } from "../lib/univer-command";

interface ContextMenuState {
	x: number;
	y: number;
	sheetIndex: number;
	sheetName: string;
}

export const SheetTabBar = observer(function SheetTabBar() {
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editValue, setEditValue] = useState("");
	const editInputRef = useRef<HTMLInputElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const unsub = onUniverChange(() => {
			try {
				const api = getActiveUniverAPI();
				if (!api) return;
				const workbook = api.getActiveWorkbook();
				if (!workbook) return;

				const sheetNames = safeCall(() => workbook.getSheetNames(), []);
				const sheetInfos = safeCall(() => workbook.getSheets(), []);
				const activeId = safeCall(() => workbook.getActiveSheetId(), "");

				if (sheetInfos.length > 0) {
					spreadsheetStore.sheets = sheetInfos.map((s, i) => ({
						index: i,
						name: s.name,
						active: s.id === activeId,
					}));
				} else if (sheetNames.length > 0) {
					spreadsheetStore.sheets = sheetNames.map((name, i) => ({
						index: i,
						name,
						active: i === spreadsheetStore.activeSheetIndex,
					}));
				}
			} catch {
				/* read errors are safe to ignore */
			}
		});
		return unsub;
	}, []);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setContextMenu(null);
			}
		}
		if (contextMenu) {
			document.addEventListener("mousedown", handleClickOutside);
			return () =>
				document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [contextMenu]);

	useEffect(() => {
		if (editingIndex !== null && editInputRef.current) {
			editInputRef.current.focus();
			editInputRef.current.select();
		}
	}, [editingIndex]);

	const handleTabClick = useCallback((index: number) => {
		spreadsheetStore.setActiveSheetIndex(index);
		try {
			const api = getActiveUniverAPI();
			if (!api) return;
			const workbook = api.getActiveWorkbook();
			if (!workbook) return;
			const sheets = safeCall(() => workbook.getSheets(), []);
			if (sheets[index]) {
				workbook.setActiveSheet(sheets[index].id);
			}
		} catch {
			/* navigation errors are safe to ignore */
		}
	}, []);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent, index: number) => {
			e.preventDefault();
			const sheet = spreadsheetStore.sheets[index];
			if (!sheet) return;
			setContextMenu({ x: e.clientX, y: e.clientY, sheetIndex: index, sheetName: sheet.name });
		},
		[],
	);

	const handleAddSheet = useCallback(() => {
		const baseName = "Sheet";
		const existingNames = spreadsheetStore.sheets.map((s) => s.name);
		let counter = existingNames.length + 1;
		let name = `${baseName} ${counter}`;
		while (existingNames.includes(name)) {
			counter++;
			name = `${baseName} ${counter}`;
		}
		spreadsheetStore.addSheet(name);
		try {
			const api = getActiveUniverAPI();
			if (!api) return;
			const workbook = api.getActiveWorkbook();
			if (!workbook) return;
			workbook.addSheet(name);
		} catch {
			/* add errors are safe to ignore */
		}
	}, []);

	const handleRename = useCallback(() => {
		if (!contextMenu) return;
		setEditingIndex(contextMenu.sheetIndex);
		setEditValue(contextMenu.sheetName);
		setContextMenu(null);
	}, [contextMenu]);

	const commitRename = useCallback(() => {
		if (editingIndex === null) return;
		const newName = editValue.trim();
		if (newName) {
			spreadsheetStore.renameSheet(editingIndex, newName);
			try {
				const api = getActiveUniverAPI();
				if (!api) return;
				const workbook = api.getActiveWorkbook();
				if (!workbook) return;
				const sheets = safeCall(() => workbook.getSheets(), []);
				if (sheets[editingIndex]) {
					workbook.renameSheet(sheets[editingIndex].id, newName);
				}
			} catch {
				/* rename errors are safe to ignore */
			}
		}
		setEditingIndex(null);
	}, [editingIndex, editValue]);

	const handleDelete = useCallback(() => {
		if (!contextMenu) return;
		const index = contextMenu.sheetIndex;
		if (spreadsheetStore.sheets.length <= 1) return;
		spreadsheetStore.deleteSheet(index);
		try {
			const api = getActiveUniverAPI();
			if (!api) return;
			const workbook = api.getActiveWorkbook();
			if (!workbook) return;
			const sheets = safeCall(() => workbook.getSheets(), []);
			if (sheets[index]) {
				workbook.deleteSheet(sheets[index].id);
			}
		} catch {
			/* delete errors are safe to ignore */
		}
		setContextMenu(null);
	}, [contextMenu]);

	const handleDuplicate = useCallback(() => {
		if (!contextMenu) return;
		const index = contextMenu.sheetIndex;
		const original = spreadsheetStore.sheets[index];
		if (!original) return;

		const newName = `${original.name} (2)`;
		spreadsheetStore.addSheet(newName);
		try {
			const api = getActiveUniverAPI();
			if (!api) return;
			const workbook = api.getActiveWorkbook();
			if (!workbook) return;
			const sheets = safeCall(() => workbook.getSheets(), []);
			if (sheets[index]) {
				workbook.duplicateSheet(sheets[index].id);
			}
		} catch {
			/* duplicate errors are safe to ignore */
		}
		setContextMenu(null);
	}, [contextMenu]);

	const handleRenameKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commitRename();
			} else if (e.key === "Escape") {
				e.preventDefault();
				setEditingIndex(null);
			}
		},
		[commitRename],
	);

	const tabBarStyle: Record<string, string | number> = {
		display: "flex",
		alignItems: "center",
		height: "var(--wo-se-sheettabbar-height, 28px)",
		backgroundColor: "var(--wo-color-bg-secondary, #f0f0f0)",
		borderTop: "1px solid var(--wo-color-border, #d1d1d1)",
		overflow: "hidden",
	};

	const tabsContainerStyle: Record<string, string | number> = {
		display: "flex",
		alignItems: "center",
		flex: 1,
		overflowX: "auto",
		overflowY: "hidden",
		gap: "1px",
	};

	const tabStyle = (active: boolean): Record<string, string | number> => ({
		display: "inline-flex",
		alignItems: "center",
		height: "24px",
		padding: "0 12px",
		fontSize: "11px",
		fontFamily: "var(--wo-font-ui, 'Segoe UI', sans-serif)",
		cursor: "pointer",
		whiteSpace: "nowrap",
		userSelect: "none",
		color: active
			? "var(--wo-color-text-primary, #333)"
			: "var(--wo-color-text-secondary, #666)",
		backgroundColor: active
			? "var(--wo-color-bg-primary, #fff)"
			: "transparent",
		borderTop: active
			? "2px solid var(--wo-color-accent, #1a73e8)"
			: "2px solid transparent",
		borderLeft: "1px solid transparent",
		borderRight: "1px solid transparent",
		fontWeight: active ? 600 : 400,
	});

	const addBtnStyle: Record<string, string | number> = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "24px",
		height: "24px",
		border: "none",
		background: "transparent",
		cursor: "pointer",
		color: "var(--wo-color-text-secondary, #666)",
		borderRadius: "3px",
		marginLeft: "4px",
	};

	const contextMenuStyle: Record<string, string | number> = {
		position: "fixed",
		top: `${contextMenu?.y ?? 0}px`,
		left: `${contextMenu?.x ?? 0}px`,
		backgroundColor: "var(--wo-color-bg-primary, #fff)",
		border: "1px solid var(--wo-color-border, #d1d1d1)",
		borderRadius: "6px",
		boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
		zIndex: 9999,
		padding: "4px 0",
		minWidth: "140px",
	};

	const menuItemStyle: Record<string, string | number> = {
		display: "flex",
		alignItems: "center",
		width: "100%",
		padding: "6px 16px",
		border: "none",
		background: "transparent",
		cursor: "pointer",
		fontSize: "12px",
		fontFamily: "var(--wo-font-ui, 'Segoe UI', sans-serif)",
		color: "var(--wo-color-text-primary, #333)",
		textAlign: "left",
	};

	return (
		<div style={tabBarStyle}>
			<div style={tabsContainerStyle} role="tablist" aria-label="Sheet tabs">
				{spreadsheetStore.sheets.map((sheet, index) => (
					<div key={sheet.index}>
						{editingIndex === index ? (
							<input
								ref={editInputRef}
								style={{
									...tabStyle(sheet.active),
									border: "1px solid var(--wo-color-accent, #1a73e8)",
									outline: "none",
								}}
								value={editValue}
								onChange={(e) => setEditValue(e.target.value)}
								onBlur={commitRename}
								onKeyDown={handleRenameKeyDown}
								aria-label="Rename sheet"
							/>
						) : (
							<div
								style={tabStyle(sheet.active)}
								role="tab"
								aria-selected={sheet.active}
								tabIndex={0}
								onClick={() => handleTabClick(index)}
								onContextMenu={(e) => handleContextMenu(e, index)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleTabClick(index);
									}
								}}
							>
								{sheet.name}
							</div>
						)}
					</div>
				))}
			</div>

			<button
				type="button"
				style={addBtnStyle}
				onClick={handleAddSheet}
				title="Add sheet"
				aria-label="Add sheet"
			>
				<Plus size={14} />
			</button>

			{contextMenu && (
				<div ref={menuRef} style={contextMenuStyle} role="menu">
					<button
						type="button"
						style={menuItemStyle}
						onClick={handleRename}
						role="menuitem"
					>
						Rename
					</button>
					<button
						type="button"
						style={menuItemStyle}
						onClick={handleDelete}
						role="menuitem"
						disabled={spreadsheetStore.sheets.length <= 1}
					>
						Delete
					</button>
					<button
						type="button"
						style={menuItemStyle}
						onClick={handleDuplicate}
						role="menuitem"
					>
						Duplicate
					</button>
				</div>
			)}
		</div>
	);
});

function safeCall<T>(fn: () => T, fallback: T): T {
	try {
		const result = fn();
		return result ?? fallback;
	} catch {
		return fallback;
	}
}
