// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { FlowchartStore } from "../stores/FlowchartStore";

describe("FlowchartStore connector formatting", () => {
	let store: FlowchartStore;

	beforeEach(() => {
		store = new FlowchartStore();
	});

	it("initializes with orthogonal as default route mode", () => {
		expect(store.defaultRouteMode).toBe("orthogonal");
	});

	it("sets default route mode", () => {
		store.setDefaultRouteMode("bezier");
		expect(store.defaultRouteMode).toBe("bezier");
	});

	it("new edges inherit default route mode", () => {
		store.setDefaultRouteMode("straight");
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		expect(edge.routeMode).toBe("straight");
	});

	it("new edges via finishConnect inherit default route mode", () => {
		store.setDefaultRouteMode("bezier");
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		store.startConnect(n1.id);
		const edge = store.finishConnect(n2.id);
		expect(edge).not.toBeNull();
		expect(edge?.routeMode).toBe("bezier");
	});

	it("applyConnectorFormat updates stroke color", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ strokeColor: "#ff0000" });
		expect(store.document.edges[0].strokeColor).toBe("#ff0000");
	});

	it("applyConnectorFormat updates route mode", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ routeMode: "bezier" });
		expect(store.document.edges[0].routeMode).toBe("bezier");
	});

	it("applyConnectorFormat updates arrowhead type", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ arrowheadType: "diamond" });
		expect(store.document.edges[0].arrowheadType).toBe("diamond");
	});

	it("applyConnectorFormat updates stroke style", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ strokeStyle: "dashed" });
		expect(store.document.edges[0].strokeStyle).toBe("dashed");
	});

	it("applyConnectorFormat updates source and target anchors", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({
			sourceAnchor: "top",
			targetAnchor: "bottom",
		});
		expect(store.document.edges[0].sourceAnchor).toBe("top");
		expect(store.document.edges[0].targetAnchor).toBe("bottom");
	});

	it("applyConnectorFormat updates multiple edges", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const n3 = store.addNode("process", 500, 100, "C");
		const e1 = store.addEdge(n1.id, n2.id);
		const e2 = store.addEdge(n2.id, n3.id);
		store.selectEdge(e1.id);
		store.selectEdge(e2.id);
		// Manually set multi-select since selectEdge replaces
		store.selectedEdgeIds = [e1.id, e2.id];
		store.applyConnectorFormat({ strokeColor: "#00ff00" });
		expect(store.document.edges[0].strokeColor).toBe("#00ff00");
		expect(store.document.edges[1].strokeColor).toBe("#00ff00");
	});

	it("resetConnectorFormat resets selected edge to defaults", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({
			strokeColor: "#ff0000",
			strokeWidth: 5,
			strokeStyle: "dashed",
			arrowheadType: "none",
			routeMode: "bezier",
		});
		store.resetConnectorFormat();
		const updated = store.document.edges[0];
		expect(updated.strokeColor).toBe("#333333");
		expect(updated.strokeWidth).toBe(2);
		expect(updated.strokeStyle).toBe("solid");
		expect(updated.arrowheadType).toBe("arrow");
		expect(updated.routeMode).toBeUndefined();
	});

	it("getSelectedEdgeInfo returns info for single selected edge", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ label: "Yes", routeMode: "bezier" });
		const info = store.getSelectedEdgeInfo();
		expect(info).not.toBeNull();
		expect(info?.sourceId).toBe(n1.id);
		expect(info?.targetId).toBe(n2.id);
		expect(info?.label).toBe("Yes");
		expect(info?.routeMode).toBe("bezier");
		expect(info?.connectedNodes).toBe(2);
	});

	it("getSelectedEdgeInfo returns null when no edge selected", () => {
		expect(store.getSelectedEdgeInfo()).toBeNull();
	});

	it("getSelectedEdgeInfo returns null when multiple edges selected", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const n3 = store.addNode("process", 500, 100, "C");
		const e1 = store.addEdge(n1.id, n2.id);
		const e2 = store.addEdge(n2.id, n3.id);
		store.selectedEdgeIds = [e1.id, e2.id];
		expect(store.getSelectedEdgeInfo()).toBeNull();
	});

	it("connectors re-route on shape move", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		// n2 is right of n1 → source=right, target=left
		expect(store.document.edges[0].sourceAnchor).toBe("right");
		expect(store.document.edges[0].targetAnchor).toBe("left");

		// Move n2 below n1
		store.moveNode(n2.id, -200, 200);
		// Now n2 is below n1 → anchors should re-route to bottom/top
		expect(store.document.edges[0].sourceAnchor).toBe("bottom");
		expect(store.document.edges[0].targetAnchor).toBe("top");
	});

	it("route mode survives JSON round-trip", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ routeMode: "bezier" });

		// Verify the live document has the updated routeMode
		expect(store.document.edges[0].routeMode).toBe("bezier");

		const json = store.toJSON();
		expect(json.edges[0].routeMode).toBe("bezier");

		const newStore = new FlowchartStore();
		newStore.fromJSON(json);
		expect(newStore.document.edges[0].routeMode).toBe("bezier");
	});

	it("undo/redo works with connector formatting", () => {
		const n1 = store.addNode("process", 100, 100, "A");
		const n2 = store.addNode("process", 300, 100, "B");
		const edge = store.addEdge(n1.id, n2.id);
		store.selectEdge(edge.id);
		store.applyConnectorFormat({ strokeColor: "#ff0000", routeMode: "bezier" });

		store.undo();
		expect(store.document.edges[0].strokeColor).toBe("#333333");
		// After undo, edge reverts to the default routeMode (orthogonal)
		expect(store.document.edges[0].routeMode).toBe("orthogonal");

		store.redo();
		expect(store.document.edges[0].strokeColor).toBe("#ff0000");
		expect(store.document.edges[0].routeMode).toBe("bezier");
	});
});

describe("connectorPath function", () => {
	// Test the routing path generation by importing helper functions.
	// Since connectorPath is a module-level function in FlowchartCanvas,
	// we test the store behavior which uses it indirectly.

	it("store edges have correct routeMode after different routing modes", () => {
		const store = new FlowchartStore();

		// Straight
		store.setDefaultRouteMode("straight");
		const a = store.addNode("process", 100, 100, "A");
		const b = store.addNode("process", 300, 100, "B");
		const e1 = store.addEdge(a.id, b.id);
		expect(e1.routeMode).toBe("straight");

		// Manhattan
		store.setDefaultRouteMode("manhattan");
		const e2 = store.addEdge(a.id, b.id);
		expect(e2.routeMode).toBe("manhattan");

		// Bezier
		store.setDefaultRouteMode("bezier");
		const e3 = store.addEdge(a.id, b.id);
		expect(e3.routeMode).toBe("bezier");

		// Orthogonal (default)
		store.setDefaultRouteMode("orthogonal");
		const e4 = store.addEdge(a.id, b.id);
		expect(e4.routeMode).toBe("orthogonal");
	});
});
