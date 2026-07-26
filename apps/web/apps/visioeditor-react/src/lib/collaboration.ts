import type {
	ParticipantUpdate,
	VisioDiagramOperation,
} from "@world-office/collaboration-client";
import { CollaborationStore } from "@world-office/editor-stores";

export const visioCollaborationStore = new CollaborationStore();

export const collabSendRef: {
	send: ((update: ParticipantUpdate) => void) | null;
} = {
	send: null,
};

/** Ref set by VisioCollaborationProvider so FlowchartCanvas can broadcast shape ops. */
export const visioBroadcastRef: {
	send: ((op: VisioDiagramOperation) => void) | null;
} = {
	send: null,
};

/** Ref set by FlowchartCanvas so VisioCollaborationProvider can receive ops. */
export const visioOnOpRef: {
	send: ((op: VisioDiagramOperation) => void) | null;
} = {
	send: null,
};

export const currentUser = {
	id: "",
	username: "",
};
