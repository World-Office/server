import { makeAutoObservable } from "mobx"
import { toJS } from "mobx"
import type { FlowchartDocument, FlowchartNode, FlowchartEdge, FlowchartShapeType } from "../types/visio"

let nextId = 1
function genId(): string {
	return `fc-${nextId++}`
}

function cloneDoc(doc: FlowchartDocument): FlowchartDocument {
	return toJS(doc, { recurseEverything: true }) as FlowchartDocument
}

export class FlowchartStore {
	document: FlowchartDocument = { nodes: [], edges: [] }
	selectedNodeIds: string[] = []
	selectedEdgeIds: string[] = []
	isDragging = false
	dragNodeId: string | null = null
	connectSourceId: string | null = null
	canvasOffset = { x: 0, y: 0 }

	/* Undo/redo */
	history: FlowchartDocument[] = []
	future: FlowchartDocument[] = []
	maxHistory = 50

	/* Clipboard */
	clipboard: { nodes: FlowchartNode[]; edges: FlowchartEdge[] } | null = null

	/* Grid */
	gridSize = 20
	snapToGridEnabled = true

	constructor() {
		makeAutoObservable(this)
	}

	/* ── Helpers ── */

	private snap(v: number): number {
		if (!this.snapToGridEnabled || this.gridSize <= 1) return v
		return Math.round(v / this.gridSize) * this.gridSize
	}

	private pushHistory(): void {
		this.history.push(cloneDoc(this.document))
		if (this.history.length > this.maxHistory) {
			this.history.shift()
		}
		this.future = []
	}

	/* ── Undo / Redo ── */

	undo(): void {
		if (this.history.length === 0) return
		this.future.push(cloneDoc(this.document))
		const prev = this.history.pop()!
		this.document = prev
		this.clearSelection()
	}

	redo(): void {
		if (this.future.length === 0) return
		this.history.push(cloneDoc(this.document))
		const next = this.future.pop()!
		this.document = next
		this.clearSelection()
	}

	/* ── Node operations ── */

	addNode(shapeType: FlowchartShapeType, x: number, y: number, label?: string): FlowchartNode {
		this.pushHistory()
		const dims = getShapeDimensions(shapeType)
		const node: FlowchartNode = {
			id: genId(),
			shapeType,
			x: this.snap(x),
			y: this.snap(y),
			width: dims.width,
			height: dims.height,
			label: label ?? getDefaultLabel(shapeType),
			fillColor: "#ffffff",
			strokeColor: "#333333",
			strokeWidth: 2,
			fontSize: 14,
		}
		this.document.nodes.push(node)
		return node
	}

	removeNode(nodeId: string): void {
		this.pushHistory()
		this.document.nodes = this.document.nodes.filter((n) => n.id !== nodeId)
		this.document.edges = this.document.edges.filter(
			(e) => e.sourceId !== nodeId && e.targetId !== nodeId,
		)
		this.selectedNodeIds = this.selectedNodeIds.filter((id) => id !== nodeId)
	}

	updateNode(nodeId: string, patch: Partial<FlowchartNode>): void {
		this.pushHistory()
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (node) Object.assign(node, patch)
	}

	moveNode(nodeId: string, dx: number, dy: number): void {
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (node) {
			const nx = node.x + dx
			const ny = node.y + dy
			node.x = this.snap(nx)
			node.y = this.snap(ny)
		}
	}

	setNodeLabel(nodeId: string, label: string): void {
		this.pushHistory()
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (node) node.label = label
	}

	setEdgeLabel(edgeId: string, label: string): void {
		this.pushHistory()
		const edge = this.document.edges.find((e) => e.id === edgeId)
		if (edge) edge.label = label
	}

	/* ── Edge operations ── */

	startConnect(sourceId: string): void {
		this.connectSourceId = sourceId
	}

	cancelConnect(): void {
		this.connectSourceId = null
	}

	finishConnect(targetId: string): FlowchartEdge | null {
		if (!this.connectSourceId || this.connectSourceId === targetId) return null
		this.pushHistory()
		const edge: FlowchartEdge = {
			id: genId(),
			sourceId: this.connectSourceId,
			targetId,
			label: "",
			strokeColor: "#333333",
			strokeWidth: 2,
			strokeStyle: "solid",
		}
		this.document.edges.push(edge)
		this.connectSourceId = null
		return edge
	}

	removeEdge(edgeId: string): void {
		this.pushHistory()
		this.document.edges = this.document.edges.filter((e) => e.id !== edgeId)
		this.selectedEdgeIds = this.selectedEdgeIds.filter((id) => id !== edgeId)
	}

	/* ── Selection ── */

	selectNode(nodeId: string, addToSelection = false): void {
		if (addToSelection) {
			if (this.selectedNodeIds.includes(nodeId)) {
				this.selectedNodeIds = this.selectedNodeIds.filter((id) => id !== nodeId)
			} else {
				this.selectedNodeIds.push(nodeId)
			}
		} else {
			this.selectedNodeIds = [nodeId]
		}
		this.selectedEdgeIds = []
	}

	selectEdge(edgeId: string): void {
		this.selectedEdgeIds = [edgeId]
		this.selectedNodeIds = []
	}

	clearSelection(): void {
		this.selectedNodeIds = []
		this.selectedEdgeIds = []
	}

	selectNodesInRect(x1: number, y1: number, x2: number, y2: number): void {
		const minX = Math.min(x1, x2)
		const minY = Math.min(y1, y2)
		const maxX = Math.max(x1, x2)
		const maxY = Math.max(y1, y2)
		this.selectedNodeIds = this.document.nodes
			.filter(
				(n) =>
					n.x < maxX && n.x + n.width > minX &&
					n.y < maxY && n.y + n.height > minY,
			)
			.map((n) => n.id)
		this.selectedEdgeIds = []
	}

	/* ── Drag ── */

	startDrag(nodeId: string): void {
		this.isDragging = true
		this.dragNodeId = nodeId
	}

	endDrag(): void {
		if (this.isDragging) {
			this.pushHistory()
		}
		this.isDragging = false
		this.dragNodeId = null
	}

	/* ── Canvas offset (pan) ── */

	setCanvasOffset(x: number, y: number): void {
		this.canvasOffset = { x, y }
	}

	/* ── Copy / Paste / Duplicate ── */

	copySelection(): void {
		const selectedNodes = this.document.nodes.filter((n) =>
			this.selectedNodeIds.includes(n.id),
		)
		if (selectedNodes.length === 0) return
		const selectedIds = new Set(selectedNodes.map((n) => n.id))
		const connectedEdges = this.document.edges.filter(
			(e) => selectedIds.has(e.sourceId) && selectedIds.has(e.targetId),
		)
		this.clipboard = { nodes: toJS(selectedNodes) as FlowchartNode[], edges: toJS(connectedEdges) as FlowchartEdge[] }
	}

	cutSelection(): void {
		this.copySelection()
		this.pushHistory()
		for (const nodeId of [...this.selectedNodeIds]) {
			this.removeNode(nodeId)
		}
	}

	paste(): void {
		if (!this.clipboard || this.clipboard.nodes.length === 0) return
		this.pushHistory()
		const idMap = new Map<string, string>()
		const offset = 20
		const pastedIds: string[] = []
		for (const src of this.clipboard.nodes) {
			const newId = genId()
			idMap.set(src.id, newId)
			const node: FlowchartNode = { ...src, id: newId, x: src.x + offset, y: src.y + offset }
			this.document.nodes.push(node)
			pastedIds.push(newId)
		}
		for (const src of this.clipboard.edges) {
			const newSource = idMap.get(src.sourceId)
			const newTarget = idMap.get(src.targetId)
			if (newSource && newTarget) {
				const edge: FlowchartEdge = { ...src, id: genId(), sourceId: newSource, targetId: newTarget }
				this.document.edges.push(edge)
			}
		}
		this.selectedNodeIds = pastedIds
		this.selectedEdgeIds = []
	}

	duplicateSelection(): void {
		if (this.selectedNodeIds.length === 0) return
		this.copySelection()
		this.paste()
	}

	/* ── Grid ── */

	setGridSize(size: number): void {
		this.gridSize = Math.max(1, size)
	}

	toggleSnapToGrid(): void {
		this.snapToGridEnabled = !this.snapToGridEnabled
	}

	/* ── Document ── */

	clear(): void {
		this.pushHistory()
		this.document = { nodes: [], edges: [] }
		this.selectedNodeIds = []
		this.selectedEdgeIds = []
	}
}

/* ── Helpers ── */

function getShapeDimensions(shapeType: FlowchartShapeType): { width: number; height: number } {
	switch (shapeType) {
		case "start-end":
		case "terminator":
			return { width: 140, height: 50 }
		case "process":
			return { width: 160, height: 80 }
		case "decision":
		case "condition":
			return { width: 120, height: 120 }
		case "input-output":
		case "data":
			return { width: 140, height: 60 }
		case "document":
			return { width: 140, height: 80 }
		case "subprocess":
			return { width: 160, height: 70 }
		case "connector":
		case "manual-input":
			return { width: 100, height: 60 }
		case "display":
			return { width: 140, height: 70 }
		case "predefined-process":
			return { width: 160, height: 80 }
		case "stored-data":
			return { width: 140, height: 70 }
		case "delay":
			return { width: 120, height: 60 }
		case "preparation":
			return { width: 140, height: 70 }
		case "loop-limit":
			return { width: 140, height: 60 }
		default:
			return { width: 120, height: 60 }
	}
}

function getDefaultLabel(shapeType: FlowchartShapeType): string {
	const labels: Record<FlowchartShapeType, string> = {
		"start-end": "Start",
		terminator: "End",
		process: "Process",
		decision: "Decision?",
		condition: "Condition?",
		"input-output": "Input/Output",
		data: "Data",
		document: "Document",
		subprocess: "Subprocess",
		connector: "Connector",
		"manual-input": "Manual Input",
		display: "Display",
		"predefined-process": "Predefined Process",
		"stored-data": "Stored Data",
		delay: "Delay",
		preparation: "Preparation",
		"loop-limit": "Loop Limit",
	}
	return labels[shapeType] ?? "Shape"
}

export const flowchartStore = new FlowchartStore()
