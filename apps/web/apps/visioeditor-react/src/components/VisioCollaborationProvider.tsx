import type {
	EditOperation,
	ParticipantUpdate,
	VisioDiagramOperation,
} from "@world-office/collaboration-client";
import { useCollaboration } from "@world-office/collaboration-react";
import { useCallback, useEffect } from "react";
import {
	collabSendRef,
	currentUser,
	visioCollaborationStore,
} from "../lib/collaboration";
import {
	COAUTHORING_API_URL,
	COAUTHORING_WS_URL,
} from "../lib/collaboration-config";
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
			// Dispatch visio diagram operations via global callback so
			// FlowchartCanvas can subscribe to them
			const handler = (window as unknown as Record<string, unknown>)
				.__visioCollabOnOp;
			if (typeof handler === "function") {
				(handler as (op: VisioDiagramOperation) => void)(op);
			}
			visioStore.isModified = true;
		},
	});

	// Expose broadcast function for FlowchartCanvas to call
	const broadcastVisioOp = useCallback(
		(op: VisioDiagramOperation) => {
			collab.sendVisioDiagramOp(op);
		},
		[collab.sendVisioDiagramOp],
	);

	useEffect(() => {
		(window as unknown as Record<string, unknown>).__visioCollabSendOp =
			broadcastVisioOp;
		return () => {
			(window as unknown as Record<string, unknown>).__visioCollabSendOp =
				undefined;
		};
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
