import { loadDocument } from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { init, renderPage } from "../lib/wasm-renderer";
import { spreadsheetStore } from "../stores/SpreadsheetStore";

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const svgRef = useRef<HTMLDivElement>(null);
	const initialized = useRef(false);
	const [svgContent, setSvgContent] = useState<string | null>(null);
	const [isSvgLoading, setIsSvgLoading] = useState(false);

	// Initialize renderer once on mount
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || initialized.current) return;
		initialized.current = true;

		init(canvas);
		renderPage(0, spreadsheetStore.zoomLevel);
	}, []);

	// Re-render when zoom changes
	const { zoomLevel } = spreadsheetStore;
	useEffect(() => {
		if (!initialized.current) return;
		renderPage(0, zoomLevel);
	}, [zoomLevel]);

	// Load SVG when format=svg is requested
	// biome-ignore lint/correctness/useExhaustiveDependencies: MobX observable — store properties trigger re-render via observer()
	useEffect(() => {
		if (
			spreadsheetStore.format !== "svg" ||
			!spreadsheetStore.isDocReady ||
			!spreadsheetStore.wopiConnection
		)
			return;

		setIsSvgLoading(true);
		setSvgContent(null);

		const loadSvg = async () => {
			try {
				const conn = spreadsheetStore.wopiConnection;
				if (!conn) return;
				const { content } = await loadDocument({
					wopiFileId: conn.wopiFileId,
					wopiAccessToken: conn.wopiAccessToken,
					docserverBase: conn.docserverBase,
					format: "svg",
				});
				const text = await content.text();
				setSvgContent(text);
			} catch (err) {
				console.error("Failed to load SVG:", err);
			} finally {
				setIsSvgLoading(false);
			}
		};

		loadSvg();
	}, [
		spreadsheetStore.format,
		spreadsheetStore.isDocReady,
		spreadsheetStore.wopiConnection,
	]);

	return (
		<div
			className="se-document-holder"
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				overflow: "auto",
				height: "100%",
				backgroundColor: "#e8e8e8",
			}}
		>
			{spreadsheetStore.format === "svg" ? (
				<div
					style={{
						margin: "16px auto",
						flexShrink: 0,
						display: "flex",
						justifyContent: "center",
					}}
				>
					{isSvgLoading ? (
						<div className="se-document-canvas">Loading SVG...</div>
					) : svgContent ? (
						<div
							ref={svgRef}
							className="se-document-canvas"
							style={{
								boxShadow:
									"0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
								width: "100%",
								height: "100%",
							}}
							dangerouslySetInnerHTML={{ __html: svgContent }}
						/>
					) : (
						<div className="se-document-canvas">No SVG content</div>
					)}
				</div>
			) : (
				<div
					style={{
						margin: "16px auto",
						flexShrink: 0,
						display: "flex",
						justifyContent: "center",
					}}
				>
					<canvas
						ref={canvasRef}
						className="se-document-canvas"
						style={{
							boxShadow:
								"0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
						}}
					/>
				</div>
			)}
		</div>
	);
});

export { ObservedDocumentHolder as DocumentHolder };
