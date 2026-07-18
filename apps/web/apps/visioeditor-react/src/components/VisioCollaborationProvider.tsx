import type {
	EditOperation,
	ParticipantUpdate,
} from "@world-office/collaboration-client";
import { useCollaboration } from "@world-office/collaboration-react";
import { useEffect } from "react";
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
		collaborationStore: null,
		sessionId: sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined,
		coauthoringServiceUrl: COAUTHORING_API_URL,
		onRemoteOperation(_op: EditOperation) {
			visioStore.isModified = true;
		},
		onParticipantUpdate(_update: ParticipantUpdate) {
			// Visio cursor tracking will use FlowchartCanvas API when available
		},
	});

	useEffect(() => {
		collab.connect();
	}, [collab.connect]);

	return null;
}
