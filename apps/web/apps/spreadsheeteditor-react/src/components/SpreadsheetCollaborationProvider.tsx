import type {
	ParticipantUpdate,
	SpreadsheetOperation,
} from "@world-office/collaboration-client";
import { useSpreadsheetCollaboration } from "@world-office/collaboration-react";
import { useEffect, useRef } from "react";
import {
	COAUTHORING_API_URL,
	COAUTHORING_WS_URL,
} from "../lib/collaboration-config";
import { getActiveUniverAPI, onUniverChange } from "../lib/univer-command";
import { spreadsheetStore } from "../stores/SpreadsheetStore";

const SESSION_STORAGE_KEY = "sheet-collab-session";

function getOrCreateUser(): { id: string; name: string } {
	const stored = sessionStorage.getItem("sheet-collab-user");
	if (stored) {
		try {
			return JSON.parse(stored) as { id: string; name: string };
		} catch {
			/* ignore */
		}
	}
	const user = {
		id: `user-${crypto.randomUUID().slice(0, 8)}`,
		name: `User-${Math.random().toString(36).slice(2, 6)}`,
	};
	sessionStorage.setItem("sheet-collab-user", JSON.stringify(user));
	return user;
}

/**
 * Apply a remote spreadsheet operation to the local Univer instance.
 */
function applyRemoteOp(op: SpreadsheetOperation): void {
	const api = getActiveUniverAPI();
	if (!api) return;
	const workbook = api.getActiveWorkbook();
	if (!workbook) return;

	try {
		switch (op.action) {
			case "set_cell_value":
			case "set_cell_style":
			case "set_cell_formula":
				spreadsheetStore.isModified = true;
				break;
			case "sheet_action": {
				const { sheet_name, action, new_name } = op.payload;
				switch (action) {
					case "add":
						workbook.addSheet(sheet_name);
						break;
					case "delete":
						workbook.deleteSheet(sheet_name);
						break;
					case "rename":
						if (new_name) workbook.renameSheet(sheet_name, new_name);
						break;
				}
				break;
			}
			case "merge_cells":
				workbook.getActiveSheet()?.getSelection()?.getActiveRange()?.merge();
				break;
			case "insert_row":
			case "delete_row":
			case "insert_column":
			case "delete_column": {
				const sheet = workbook.getActiveSheet();
				if (!sheet) break;
				const rowIndex =
					op.action === "insert_row" || op.action === "delete_row" ? op.row : 0;
				const colIndex =
					op.action === "insert_column" || op.action === "delete_column"
						? op.col
						: 0;
				const count = op.count ?? 1;
				try {
					if (
						op.action === "insert_row" &&
						typeof sheet.insertRow === "function"
					) {
						sheet.insertRow(rowIndex, count);
					} else if (
						op.action === "delete_row" &&
						typeof sheet.deleteRow === "function"
					) {
						sheet.deleteRow(rowIndex, count);
					} else if (
						op.action === "insert_column" &&
						typeof sheet.insertColumn === "function"
					) {
						sheet.insertColumn(colIndex, count);
					} else if (
						op.action === "delete_column" &&
						typeof sheet.deleteColumn === "function"
					) {
						sheet.deleteColumn(colIndex, count);
					}
				} catch (err) {
					console.warn(`[collab] ${op.action} failed:`, err);
				}
				break;
			}
		}
	} catch (err) {
		console.warn("[collab] Failed to apply remote spreadsheet op:", err);
	}
}

/** Mark sheet as modified when a remote cell operation arrives. */
export function SpreadsheetCollaborationProvider(): null {
	const user = getOrCreateUser();
	const sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined;
	const pendingOpsRef = useRef<SpreadsheetOperation[]>([]);
	const isApplyingRemoteRef = useRef(false);

	const collab = useSpreadsheetCollaboration({
		wsUrl: COAUTHORING_WS_URL,
		userId: user.id,
		username: user.name,
		sessionId,
		coauthoringServiceUrl: COAUTHORING_API_URL,
		onSpreadsheetOp(op: SpreadsheetOperation) {
			// Apply remote operations — ignore our own echo
			isApplyingRemoteRef.current = true;
			try {
				applyRemoteOp(op);
			} finally {
				isApplyingRemoteRef.current = false;
			}
		},
		onParticipantUpdate(_update: ParticipantUpdate) {
			// Cursor tracking to be wired when Univer exposes selection API
		},
	});

	// Track the last known cell values to detect actual changes
	const lastCellValuesRef = useRef<Map<string, unknown>>(new Map());

	// Subscribe to local Univer changes and broadcast them
	useEffect(() => {
		const unsub = onUniverChange(() => {
			if (isApplyingRemoteRef.current) return;

			const api = getActiveUniverAPI();
			if (!api) return;
			const workbook = api.getActiveWorkbook();
			if (!workbook) return;
			const sheet = workbook.getActiveSheet();
			if (!sheet) return;

			// Broadcast a generic "cell changed" operation
			// The server relays this to all other participants
			const range = sheet.getSelection().getActiveRange();
			const cellRef = range?.getCellRef();
			if (cellRef) {
				const value = range?.getValue() ?? undefined;
				const key = `${sheet.getSheetName()}!${cellRef}`;
				const prevValue = lastCellValuesRef.current.get(key);

				// Only broadcast if the value actually changed (filters out
				// navigation events that fire onUniverChange without editing)
				if (prevValue === value) return;
				lastCellValuesRef.current.set(key, value);

				const op: SpreadsheetOperation = {
					action: "set_cell_value",
					payload: {
						sheet_name: sheet.getSheetName(),
						cell: cellRef,
						value,
					},
				};
				// Debounce: queue ops and send the last one
				pendingOpsRef.current.push(op);
				if (pendingOpsRef.current.length > 10) {
					pendingOpsRef.current = pendingOpsRef.current.slice(-10);
				}
			}
		});

		return () => {
			unsub();
		};
	}, []);

	// Flush pending ops on an interval
	useEffect(() => {
		const interval = setInterval(() => {
			if (pendingOpsRef.current.length > 0) {
				const op = pendingOpsRef.current[pendingOpsRef.current.length - 1];
				pendingOpsRef.current = [];
				collab.sendSpreadsheetOp(op);
			}
		}, 500);
		return () => clearInterval(interval);
	}, [collab.sendSpreadsheetOp]);

	useEffect(() => {
		collab.connect();
	}, [collab.connect]);

	return null;
}
