import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { LocaleType, createUniver, mergeLocales } from "@univerjs/presets";
import { useEffect, useRef } from "react";

import "@univerjs/preset-sheets-core/lib/index.css";

interface SpreadsheetGridProps {
	data: ArrayBuffer | null;
}

export function SpreadsheetGrid({ data }: SpreadsheetGridProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const disposeRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const container = containerRef.current;

		let workbookData: Record<string, unknown> = {};
		if (data) {
			try {
				const text = new TextDecoder().decode(data);
				try {
					workbookData = JSON.parse(text) as Record<string, unknown>;
				} catch {
					workbookData = {
						name: "Spreadsheet",
						sheetOrder: ["sheet1"],
						sheets: {
							sheet1: {
								id: "sheet1",
								name: "Sheet 1",
								rowCount: 200,
								columnCount: 26,
								cellData: {},
							},
						},
					};
				}
			} catch {
				workbookData = {};
			}
		}

		try {
			const { univerAPI } = createUniver({
				locale: LocaleType.EN_US,
				locales: {
					[LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
				},
				presets: [
					UniverSheetsCorePreset({
						container,
					}),
				],
			});

			univerAPI.createWorkbook(workbookData);
			disposeRef.current = () => univerAPI.dispose();
		} catch (err) {
			console.error("Failed to initialize Univer:", err);
		}

		return () => {
			disposeRef.current?.();
			disposeRef.current = null;
		};
	}, [data]);

	return (
		<div
			className="spreadsheet-grid"
			style={{
				width: "100%",
				height: "100%",
				overflow: "hidden",
			}}
		>
			<div
				ref={containerRef}
				style={{
					width: "100%",
					height: "100%",
				}}
			/>
		</div>
	);
}
