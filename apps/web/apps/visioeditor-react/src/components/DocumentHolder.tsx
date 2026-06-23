import { loadDocument } from "@world-office/wopi-client";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { init, renderPage } from "../lib/wasm-renderer";
import { visioStore } from "../stores/VisioStore";
import { FlowchartCanvas } from "./FlowchartCanvas";

function VsdxCanvas() {
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
		renderPage(visioStore.currentPageIndex, visioStore.zoomLevel);
	}, []);

	// Re-render when page or zoom changes
	const { currentPageIndex, zoomLevel } = visioStore;
	useEffect(() => {
		if (!initialized.current) return;
		renderPage(currentPageIndex, zoomLevel);
	}, [currentPageIndex, zoomLevel]);

	// Load SVG when format=svg is requested
	const {
		format: vsdxFormat,
		isDocReady,
		wopiFileId,
		wopiAccessToken,
		docserverBase,
	} = visioStore;
	useEffect(() => {
		if (vsdxFormat !== "svg" || !isDocReady || !wopiFileId) return;

		setIsSvgLoading(true);
		setSvgContent(null);

		const loadSvg = async () => {
			try {
				const conn =
					wopiFileId && wopiAccessToken && docserverBase
						? {
								wopiFileId,
								wopiAccessToken,
								docserverBase,
							}
						: null;
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
	}, [vsdxFormat, isDocReady, wopiFileId, wopiAccessToken, docserverBase]);

	return (
		<div
			className="visio-document-holder"
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				overflow: "auto",
				height: "100%",
				backgroundColor: "#e8e8e8",
			}}
		>
			{visioStore.format === "svg" ? (
				<div
					style={{
						margin: "16px auto",
						flexShrink: 0,
						display: "flex",
						justifyContent: "center",
					}}
				>
					{isSvgLoading ? (
						<div className="visio-document-canvas">Loading SVG...</div>
					) : svgContent ? (
						<div
							ref={svgRef}
							className="visio-document-canvas"
							style={{
								boxShadow:
									"0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
								width: "100%",
								height: "100%",
							}}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG content from own server, not user input
							dangerouslySetInnerHTML={{ __html: svgContent }}
						/>
					) : (
						<div className="visio-document-canvas">No SVG content</div>
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
						className="visio-document-canvas"
						style={{
							boxShadow:
								"0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
						}}
					/>
				</div>
			)}
		</div>
	);
}

const ObservedDocumentHolder = observer(function ObservedDocumentHolder() {
	if (visioStore.editorMode === "flowchart") {
		return <FlowchartCanvas />;
	}
	return <VsdxCanvas />;
});

export { ObservedDocumentHolder as DocumentHolder };
