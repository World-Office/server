import {
	usePresentationCollaboration,
} from "@world-office/collaboration-react";
import type {
	PresentationOperation,
	PresentationStateData,
	ShapePayload,
} from "@world-office/collaboration-client";
import { useEffect } from "react";
import { presentationStore } from "../stores/PresentationStore";
import type { ShapeData, SlideLayout } from "../types/presentation";
import {
	COAUTHORING_API_URL,
	COAUTHORING_WS_URL,
} from "../lib/collaboration-config";

const SESSION_STORAGE_KEY = "prese-collab-session";

function getOrCreateUser(): { id: string; name: string } {
	const stored = sessionStorage.getItem("prese-collab-user");
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
	sessionStorage.setItem("prese-collab-user", JSON.stringify(user));
	return user;
}

export function PresentationCollaborationProvider(): null {
	const user = getOrCreateUser();

	const collab = usePresentationCollaboration({
		wsUrl: COAUTHORING_WS_URL,
		userId: user.id,
		username: user.name,
		sessionId: sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined,
		coauthoringServiceUrl: COAUTHORING_API_URL,
		onPresentationOp(op: PresentationOperation) {
			const { action, ...rest } = op;
			presentationStore.applyRemoteOp(action, rest as Record<string, unknown>);
		},
		onPresentationState(state: PresentationStateData) {
			const slides = state.slides.map((slide, index) => {
				const shapes: ShapeData[] = slide.shape_order
					.map((shapeId) => slide.shapes[shapeId])
					.filter((s): s is ShapePayload => Boolean(s))
					.map((sp) => ({
						id: sp.id,
						type: sp.type as ShapeData["type"],
						x: sp.x,
						y: sp.y,
						width: sp.width,
						height: sp.height,
						rotation: sp.rotation,
						zIndex: sp.z_index,
						fillColor: sp.fill_color ?? undefined,
						strokeColor: sp.stroke_color ?? undefined,
						strokeWidth: sp.stroke_width ?? undefined,
						text: sp.text ?? undefined,
						fontSize: sp.font_size ?? undefined,
						fontColor: sp.font_color ?? undefined,
						chart: undefined,
						table: undefined,
						connector: undefined,
						gradientFill: undefined,
						shadow: undefined,
						imageData: sp.image_data
							? {
									src: sp.image_data.src,
									width: sp.image_data.width,
									height: sp.image_data.height,
								}
							: undefined,
						groupId: sp.group_id ?? undefined,
					}));
				return {
					id: `slide-${index}`,
					title: `Slide ${index + 1}`,
					layout: "blank" as SlideLayout,
					notes: "",
					shapes,
				};
			});
			presentationStore.setSlides(slides);
		},
		onParticipantUpdate(update) {
			if (update.event === "cursor_moved" && update.cursor_position) {
				presentationStore.updateRemoteCursor(
					update.user_id,
					update.username,
					update.color,
					update.cursor_position.x,
					update.cursor_position.y,
					update.cursor_position.page,
				);
			}
		},
		onSessionJoined(participants, myUserId) {
			const me = participants.find((p) => p.user_id === myUserId);
			if (me) {
				presentationStore.currentUserColor = me.color;
			}
		},
	});

	useEffect(() => {
		presentationStore.currentUserId = user.id;
		presentationStore.connectionState = collab.connectionState;
		if (collab.connectionState === "connected") {
			presentationStore.connectionError = null;
		}
	}, [user.id, collab.connectionState]);

	useEffect(() => {
		presentationStore.registerCursorSendCallback((page, x, y) => {
			collab.sendCursorEvent({
				event: "cursor_moved",
				user_id: user.id,
				username: user.name,
				color: presentationStore.currentUserColor ?? "#E74C3C",
				cursor_position: { page, x, y },
			});
		});

		presentationStore.registerMutationCallback(
			(action: string, data: Record<string, unknown>) => {
				const payload: Record<string, unknown> = { action, ...data };
				collab.sendPresentationOp(
					payload as unknown as PresentationOperation,
				);
			},
		);
	}, []);

	useEffect(() => {
		presentationStore.connectionError = null;
		collab.connect();
	}, [presentationStore.retrySignal]);

	return null;
}
