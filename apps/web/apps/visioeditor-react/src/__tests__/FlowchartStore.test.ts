import { beforeEach, describe, expect, it } from "vitest";
import { FlowchartStore } from "../stores/FlowchartStore";

describe("FlowchartStore", () => {
	let store: FlowchartStore;

	beforeEach(() => {
		store = new FlowchartStore();
	});

	it("initializes with empty document", () => {
		expect(store.document.nodes).toEqual([]);
		expect(store.document.edges).toEqual([]);
		expect(store.selectedNodeIds).toEqual([]);
		expect(store.selectedEdgeIds).toEqual([]);
		expect(store.isDragging).toBe(false);
		expect(store.connectSourceId).toBeNull();
		expect(store.history).toEqual([]);
		expect(store.future).toEqual([]);
		expect(store.clipboard).toBeNull();
		expect(store.gridSize).toBe(20);
		expect(store.snapToGridEnabled).toBe(true);
	});

	it("adds a node with correct defaults", () => {
		const node = store.addNode("process", 100, 200, "Start");
		expect(node.shapeType).toBe("process");
		expect(node.x).toBe(100);
		expect(node.y).toBe(200);
		expect(node.label).toBe("Start");
		expect(node.fillColor).toBe("#ffffff");
		expect(node.strokeColor).toBe("#333333");
		expect(node.strokeWidth).toBe(2);
		expect(store.document.nodes).toHaveLength(1);
		expect(store.history).toHaveLength(1);
	});

	it("snaps node positions to grid", () => {
		const node = store.addNode("process", 103, 207);
		expect(node.x).toBe(100);
		expect(node.y).toBe(200);
	});

	it("removes a node and its connected edges", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");
		store.addEdge(node1.id, node2.id);
		expect(store.document.edges).toHaveLength(1);

		store.removeNode(node1.id);
		expect(store.document.nodes).toHaveLength(1);
		expect(store.document.edges).toHaveLength(0);
	});

	it("updates node properties via updateNode", () => {
		const node = store.addNode("process", 100, 100, "Old");
		store.updateNode(node.id, { label: "New", fillColor: "#ff0000" });
		expect(store.document.nodes[0].label).toBe("New");
		expect(store.document.nodes[0].fillColor).toBe("#ff0000");
	});

	it("moves node by delta and snaps to grid", () => {
		const node = store.addNode("process", 100, 100, "A");
		store.moveNode(node.id, 13, 7);
		// 100 + 13 = 113, snapped to nearest 20 = 120
		expect(store.document.nodes[0].x).toBe(120);
		// 100 + 7 = 107, snapped to nearest 20 = 100
		expect(store.document.nodes[0].y).toBe(100);
	});

	it("adds edges between nodes", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(node1.id, node2.id);
		expect(edge.sourceId).toBe(node1.id);
		expect(edge.targetId).toBe(node2.id);
		expect(edge.strokeStyle).toBe("solid");
		expect(store.document.edges).toHaveLength(1);
	});

	it("auto-anchors edges based on node positions", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");
		store.addEdge(node1.id, node2.id);
		// node2 is to the right of node1 → source=right, target=left
		expect(store.document.edges[0].sourceAnchor).toBe("right");
		expect(store.document.edges[0].targetAnchor).toBe("left");
	});

	it("selects and deselects nodes", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");

		store.selectNode(node1.id);
		expect(store.selectedNodeIds).toEqual([node1.id]);
		expect(store.selectedEdgeIds).toEqual([]);

		store.selectNode(node2.id, true);
		expect(store.selectedNodeIds).toHaveLength(2);

		// Deselect by clicking again with addToSelection
		store.selectNode(node2.id, true);
		expect(store.selectedNodeIds).toEqual([node1.id]);

		store.clearSelection();
		expect(store.selectedNodeIds).toEqual([]);
	});

	it("selects edges", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(node1.id, node2.id);

		store.selectEdge(edge.id);
		expect(store.selectedEdgeIds).toEqual([edge.id]);
		expect(store.selectedNodeIds).toEqual([]);
	});

	it("supports undo/redo", () => {
		store.addNode("process", 100, 100, "A");
		store.addNode("process", 300, 100, "B");
		expect(store.document.nodes).toHaveLength(2);
		expect(store.history).toHaveLength(2);

		store.undo();
		expect(store.document.nodes).toHaveLength(1);
		expect(store.future).toHaveLength(1);

		store.redo();
		expect(store.document.nodes).toHaveLength(2);
		expect(store.future).toHaveLength(0);
	});

	it("limits history to maxHistory", () => {
		for (let i = 0; i < 60; i++) {
			store.addNode("process", i * 10, 0, `Node ${i}`);
		}
		expect(store.history.length).toBeLessThanOrEqual(store.maxHistory);
	});

	it("removes edges", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(node1.id, node2.id);
		expect(store.document.edges).toHaveLength(1);

		store.removeEdge(edge.id);
		expect(store.document.edges).toHaveLength(0);
	});

	it("supports connect flow (start → finish)", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");

		store.startConnect(node1.id);
		expect(store.connectSourceId).toBe(node1.id);

		const edge = store.finishConnect(node2.id);
		expect(edge).not.toBeNull();
		expect(edge?.sourceId).toBe(node1.id);
		expect(edge?.targetId).toBe(node2.id);
		expect(store.connectSourceId).toBeNull();
	});

	it("cancels connect flow", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		store.startConnect(node1.id);
		store.cancelConnect();
		expect(store.connectSourceId).toBeNull();
	});

	it("prevents self-connection", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		store.startConnect(node1.id);
		const edge = store.finishConnect(node1.id);
		expect(edge).toBeNull();
	});

	it("selects nodes in rectangle", () => {
		const node1 = store.addNode("process", 50, 50, "A");
		const node2 = store.addNode("process", 200, 200, "B");
		const node3 = store.addNode("process", 500, 500, "C");

		store.selectNodesInRect(0, 0, 300, 300);
		expect(store.selectedNodeIds).toContain(node1.id);
		expect(store.selectedNodeIds).toContain(node2.id);
		expect(store.selectedNodeIds).not.toContain(node3.id);
	});

	it("serializes to JSON and deserializes via fromJSON", () => {
		store.addNode("process", 100, 100, "A");
		store.addNode("process", 300, 100, "B");
		store.addEdge(store.document.nodes[0].id, store.document.nodes[1].id);

		const json = store.toJSON();
		expect(json.nodes).toHaveLength(2);
		expect(json.edges).toHaveLength(1);

		const newStore = new FlowchartStore();
		newStore.fromJSON(json);
		expect(newStore.document.nodes).toHaveLength(2);
		expect(newStore.document.edges).toHaveLength(1);
		expect(newStore.document.nodes[0].label).toBe("A");
		expect(newStore.document.nodes[1].label).toBe("B");
	});

	it("clears the document", () => {
		store.addNode("process", 100, 100, "A");
		store.addNode("process", 300, 100, "B");
		store.clear();
		expect(store.document.nodes).toEqual([]);
		expect(store.document.edges).toEqual([]);
		expect(store.selectedNodeIds).toEqual([]);
	});

	it("sets node label", () => {
		const node = store.addNode("process", 100, 100, "Old");
		store.setNodeLabel(node.id, "New Label");
		expect(store.document.nodes[0].label).toBe("New Label");
	});

	it("sets edge label", () => {
		const node1 = store.addNode("process", 100, 100, "A");
		const node2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(node1.id, node2.id);
		store.setEdgeLabel(edge.id, "Yes");
		expect(store.document.edges[0].label).toBe("Yes");
	});
});
