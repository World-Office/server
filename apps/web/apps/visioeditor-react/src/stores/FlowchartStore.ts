import { makeAutoObservable } from "mobx"
import type { FlowchartDocument, FlowchartNode, FlowchartEdge, FlowchartShapeType } from "../types/visio"

let nextId = 1
function genId(): string {
	return `fc-${nextId++}`
}

export class FlowchartStore {
	document: FlowchartDocument = { nodes: [], edges: [] }
	selectedNodeIds: string[] = []
	selectedEdgeIds: string[] = []
	isDragging = false
	dragNodeId: string | null = null
	connectSourceId: string | null = null
	canvasOffset = { x: 0, y: 0 }

	constructor() {
		makeAutoObservable(this)
	}

	/* ── Node operations ── */

	addNode(shapeType: FlowchartShapeType, x: number, y: number, label?: string): FlowchartNode {
		const dims = getShapeDimensions(shapeType)
		const node: FlowchartNode = {
			id: genId(),
			shapeType,
			x,
			y,
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
		this.document.nodes = this.document.nodes.filter((n) => n.id !== nodeId)
		this.document.edges = this.document.edges.filter(
			(e) => e.sourceId !== nodeId && e.targetId !== nodeId,
		)
		this.selectedNodeIds = this.selectedNodeIds.filter((id) => id !== nodeId)
	}

	updateNode(nodeId: string, patch: Partial<FlowchartNode>): void {
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (node) Object.assign(node, patch)
	}

	moveNode(nodeId: string, dx: number, dy: number): void {
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (node) {
			node.x += dx
			node.y += dy
		}
	}

  setNodeLabel(nodeId: string, label: string): void {
    const node = this.document.nodes.find((n) => n.id === nodeId)
    if (node) node.label = label
  }

  setEdgeLabel(edgeId: string, label: string): void {
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

	/* ── Drag ── */

	startDrag(nodeId: string): void {
		this.isDragging = true
		this.dragNodeId = nodeId
	}

	endDrag(): void {
		this.isDragging = false
		this.dragNodeId = null
	}

	/* ── Canvas offset (pan) ── */

	setCanvasOffset(x: number, y: number): void {
		this.canvasOffset = { x, y }
	}

	/* ── Document ── */

	clear(): void {
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
