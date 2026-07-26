import type {
	EditOperation,
	ParticipantUpdate,
	VisioDiagramOperation,
} from "@world-office/collaboration-client";
import { useCollaboration } from "@world-office/collaboration-react";
import { reaction } from "mobx";
import { useCallback, useEffect, useRef } from "react";
import {
	collabSendRef,
	currentUser,
	visioBroadcastRef,
	visioCollaborationStore,
	visioOnOpRef,
} from "../lib/collaboration";
import {
	COAUTHORING_API_URL,
	COAUTHORING_WS_URL,
} from "../lib/collaboration-config";
import { flowchartStore } from "../stores/FlowchartStore";
import { visioStore } from "../stores/VisioStore";

const SESSION_STORAGE_KEY = "visio-collab-session";

function getOrCreateUser(): { id: string; name: string } {
	const stored = sessionStorage.getItem("visio-collab-user");
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
	sessionStorage.setItem("visio-collab-user", JSON.stringify(user));
	return user;
}

export function VisioCollaborationProvider(): null {
	const user = getOrCreateUser();

	const collab = useCollaboration({
		wsUrl: COAUTHORING_WS_URL,
		userId: user.id,
		username: user.name,
		collaborationStore: visioCollaborationStore,
		sessionId: sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined,
		coauthoringServiceUrl: COAUTHORING_API_URL,
		onRemoteOperation(_op: EditOperation) {
			visioStore.isModified = true;
		},
		onParticipantUpdate(_update: ParticipantUpdate) {
			// Cursor tracking handled by collaborationStore
		},
		onVisioDiagramOp(op: VisioDiagramOperation, _userId: string) {
			applyingRemoteRef.current = true;
			try {
				// Dispatch to FlowchartCanvas via typed ref
				visioOnOpRef.send?.(op);
				visioStore.isModified = true;
			} finally {
				applyingRemoteRef.current = false;
			}
		},
	});

	// Flag to avoid re-broadcasting ops received from remote
	const applyingRemoteRef = useRef(false);

	// Broadcast a visio operation
	const broadcastVisioOp = useCallback(
		(op: VisioDiagramOperation) => {
			if (applyingRemoteRef.current) return;
			collab.sendVisioDiagramOp(op);
		},
		[collab.sendVisioDiagramOp],
	);

	// Expose broadcast function via typed ref for FlowchartCanvas
	useEffect(() => {
		visioBroadcastRef.send = broadcastVisioOp;
		return () => {
			visioBroadcastRef.send = null;
		};
	}, [broadcastVisioOp]);

	// MobX reaction: auto-broadcast node additions from FlowchartStore
	// (removals/moves can be broadcast via visioBroadcastRef from FlowchartCanvas)
	useEffect(() => {
		const disposer = reaction(
			() => flowchartStore.document.nodes.length,
			(curLen, prevLen) => {
				if (applyingRemoteRef.current) return;
				if (curLen > prevLen) {
					const added = flowchartStore.document.nodes[curLen - 1];
					if (added) {
						broadcastVisioOp({
							action: "shape_add",
							shape_id: added.id,
							shape_data: JSON.stringify(added),
						});
					}
				}
			},
		);
		return () => disposer();
	}, [broadcastVisioOp]);

	useEffect(() => {
		currentUser.id = user.id;
		currentUser.username = user.name;
	}, [user.id, user.name]);

	useEffect(() => {
		collabSendRef.send = (update: ParticipantUpdate) => {
			collab.sendParticipantUpdate(update);
		};
	}, [collab.sendParticipantUpdate]);

	useEffect(() => {
		collab.connect();
	}, [collab.connect]);

	return null;
}
