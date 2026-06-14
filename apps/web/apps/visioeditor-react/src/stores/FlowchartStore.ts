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

	/* ── Resize ── */

	isResizing = false
	resizeNodeId: string | null = null
	resizeHandle: string | null = null
	resizeStartNode: { x: number; y: number; width: number; height: number } | null = null

	startResize(nodeId: string, handle: string): void {
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (!node) return
		this.isResizing = true
		this.resizeNodeId = nodeId
		this.resizeHandle = handle
		this.resizeStartNode = { x: node.x, y: node.y, width: node.width, height: node.height }
	}

	resizeTo(nodeId: string, x: number, y: number, width: number, height: number): void {
		const node = this.document.nodes.find((n) => n.id === nodeId)
		if (node) {
			const min = 30
			node.x = x
			node.y = y
			node.width = Math.max(min, width)
			node.height = Math.max(min, height)
		}
	}

	endResize(): void {
		if (this.isResizing) this.pushHistory()
		this.isResizing = false
		this.resizeNodeId = null
		this.resizeHandle = null
		this.resizeStartNode = null
	}

	/* ── Layer ordering ── */

	bringForward(): void {
		const idx = this.document.nodes.findIndex((n) => n.id === this.selectedNodeIds[0])
		if (idx < this.document.nodes.length - 1) {
			const arr = this.document.nodes
			;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
		}
	}

	sendBackward(): void {
		const idx = this.document.nodes.findIndex((n) => n.id === this.selectedNodeIds[0])
		if (idx > 0) {
			const arr = this.document.nodes
			;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
		}
	}

	bringToFront(): void {
		const idx = this.document.nodes.findIndex((n) => n.id === this.selectedNodeIds[0])
		if (idx >= 0 && idx < this.document.nodes.length - 1) {
			const node = this.document.nodes.splice(idx, 1)[0]
			this.document.nodes.push(node)
		}
	}

	sendToBack(): void {
		const idx = this.document.nodes.findIndex((n) => n.id === this.selectedNodeIds[0])
		if (idx > 0) {
			const node = this.document.nodes.splice(idx, 1)[0]
			this.document.nodes.unshift(node)
		}
	}

	/* ── Zoom to fit ── */

	zoomToFit(containerWidth: number, containerHeight: number): { offsetX: number; offsetY: number; scale: number } {
		if (this.document.nodes.length === 0) return { offsetX: 0, offsetY: 0, scale: 1 }
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
		for (const n of this.document.nodes) {
			if (n.x < minX) minX = n.x
			if (n.y < minY) minY = n.y
			if (n.x + n.width > maxX) maxX = n.x + n.width
			if (n.y + n.height > maxY) maxY = n.y + n.height
		}
		const pad = 40
		const contentW = maxX - minX + pad * 2
		const contentH = maxY - minY + pad * 2
		const scaleX = containerWidth / contentW
		const scaleY = containerHeight / contentH
		const scale = Math.min(scaleX, scaleY, 2)
		const offsetX = minX - pad - (containerWidth / scale - contentW) / 2
		const offsetY = minY - pad - (containerHeight / scale - contentH) / 2
		return { offsetX, offsetY, scale }
	}

	/* ── Alignment ── */

	alignLeft(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const minX = Math.min(...this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)?.x ?? Infinity))
		for (const id of this.selectedNodeIds) {
			const n = this.document.nodes.find((nd) => nd.id === id)
			if (n) n.x = minX
		}
	}

	alignRight(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const maxR = Math.max(...this.selectedNodeIds.map((id) => {
			const n = this.document.nodes.find((nd) => nd.id === id)
			return n ? n.x + n.width : -Infinity
		}))
		for (const id of this.selectedNodeIds) {
			const n = this.document.nodes.find((nd) => nd.id === id)
			if (n) n.x = maxR - n.width
		}
	}

	alignTop(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const minY = Math.min(...this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)?.y ?? Infinity))
		for (const id of this.selectedNodeIds) {
			const n = this.document.nodes.find((nd) => nd.id === id)
			if (n) n.y = minY
		}
	}

	alignBottom(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const maxB = Math.max(...this.selectedNodeIds.map((id) => {
			const n = this.document.nodes.find((nd) => nd.id === id)
			return n ? n.y + n.height : -Infinity
		}))
		for (const id of this.selectedNodeIds) {
			const n = this.document.nodes.find((nd) => nd.id === id)
			if (n) n.y = maxB - n.height
		}
	}

	alignCenter(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const nodes = this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)).filter(Boolean) as FlowchartNode[]
		const avgX = nodes.reduce((s, n) => s + n.x + n.width / 2, 0) / nodes.length
		for (const n of nodes) n.x = avgX - n.width / 2
	}

	alignMiddle(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const nodes = this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)).filter(Boolean) as FlowchartNode[]
		const avgY = nodes.reduce((s, n) => s + n.y + n.height / 2, 0) / nodes.length
		for (const n of nodes) n.y = avgY - n.height / 2
	}

	distributeHorizontally(): void {
		if (this.selectedNodeIds.length < 3) return
		this.pushHistory()
		const nodes = this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)).filter(Boolean) as FlowchartNode[]
		const sorted = [...nodes].sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2))
		const minX = sorted[0].x
		const maxX = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width
		const totalW = sorted.reduce((s, n) => s + n.width, 0)
		const gap = (maxX - minX - totalW) / (sorted.length - 1)
		let cx = sorted[0].x
		for (let i = 1; i < sorted.length - 1; i++) {
			cx += sorted[i - 1].width + gap
			sorted[i].x = cx
		}
	}

	distributeVertically(): void {
		if (this.selectedNodeIds.length < 3) return
		this.pushHistory()
		const nodes = this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)).filter(Boolean) as FlowchartNode[]
		const sorted = [...nodes].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2))
		const minY = sorted[0].y
		const maxY = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
		const totalH = sorted.reduce((s, n) => s + n.height, 0)
		const gap = (maxY - minY - totalH) / (sorted.length - 1)
		let cy = sorted[0].y
		for (let i = 1; i < sorted.length - 1; i++) {
			cy += sorted[i - 1].height + gap
			sorted[i].y = cy
		}
	}

	makeEqualWidth(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const nodes = this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)).filter(Boolean) as FlowchartNode[]
		const maxW = Math.max(...nodes.map((n) => n.width))
		for (const n of nodes) n.width = maxW
	}

	makeEqualHeight(): void {
		if (this.selectedNodeIds.length < 2) return
		this.pushHistory()
		const nodes = this.selectedNodeIds.map((id) => this.document.nodes.find((n) => n.id === id)).filter(Boolean) as FlowchartNode[]
		const maxH = Math.max(...nodes.map((n) => n.height))
		for (const n of nodes) n.height = maxH
	}

	/* ── Auto layout (layered/Dagre-style) ── */

	autoLayout(): void {
		if (this.document.nodes.length === 0) return
		this.pushHistory()
		const nodes = this.document.nodes
		const edges = this.document.edges
		const nodeSet = new Set(nodes.map((n) => n.id))
		const adj = new Map<string, string[]>()
		const inDeg = new Map<string, number>()
		for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0) }
		for (const e of edges) {
			if (nodeSet.has(e.sourceId) && nodeSet.has(e.targetId)) {
				adj.get(e.sourceId)!.push(e.targetId)
				inDeg.set(e.targetId, (inDeg.get(e.targetId) || 0) + 1)
			}
		}

		// Assign layers via topological sort (Kahn's)
		const layers: string[][] = []
		let queue = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id)
		const visited = new Set<string>()
		while (queue.length > 0) {
			layers.push([...queue])
			const next: string[] = []
			for (const id of queue) {
				visited.add(id)
				for (const tgt of adj.get(id) || []) {
					if (!visited.has(tgt)) {
						inDeg.set(tgt, (inDeg.get(tgt) || 1) - 1)
						if (inDeg.get(tgt) === 0) next.push(tgt)
					}
				}
			}
			queue = next
		}

		// Any remaining nodes (cycles, isolated) go to last layer
		const remaining = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id)
		if (remaining.length > 0) layers.push(remaining)

		if (layers.length === 0) return

		const nodeMap = new Map(nodes.map((n) => [n.id, n]))
		const layerGap = 80
		const nodeGap = 40
		const pad = 60

		// Compute max width per layer for column alignment
		for (let li = 0; li < layers.length; li++) {
			const layerNodes = layers[li].map((id) => nodeMap.get(id)).filter(Boolean) as FlowchartNode[]
			const maxH = Math.max(...layerNodes.map((n) => n.height))
			const totalW = layerNodes.reduce((s, n) => s + n.width, 0)
			const gap = layerNodes.length > 1 ? nodeGap : 0
			const startX = (totalW + gap * (layerNodes.length - 1)) / -2

			// Sort nodes within layer (prefer connected from previous layer)
			const prevLayer = li > 0 ? layers[li - 1] : []
			layerNodes.sort((a, b) => {
				const aPrev = prevLayer.filter((pid) => adj.get(pid)?.includes(a.id)).length
				const bPrev = prevLayer.filter((pid) => adj.get(pid)?.includes(b.id)).length
				return bPrev - aPrev
			})

			let cx = startX
			for (const n of layerNodes) {
				// Compute index in layer
				const idx = layers[li].indexOf(n.id)
				const prevW = layerNodes.slice(0, idx).reduce((s, nn) => s + nn.width, 0)
				n.x = cx + prevW + (idx > 0 ? gap * idx : 0)
				n.y = li * (maxH + layerGap) + pad
			}
		}

		// Center everything
		const allNodes = nodes
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
		for (const n of allNodes) {
			if (n.x < minX) minX = n.x
			if (n.x + n.width > maxX) maxX = n.x + n.width
			if (n.y < minY) minY = n.y
			if (n.y + n.height > maxY) maxY = n.y + n.height
		}
		const cx2 = 400 - (minX + maxX) / 2
		const cy2 = 200 - (minY + maxY) / 2
		for (const n of allNodes) { n.x += cx2; n.y += cy2 }

		this.selectedNodeIds = []
		this.selectedEdgeIds = []
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
