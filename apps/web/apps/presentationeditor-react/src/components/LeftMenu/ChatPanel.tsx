/**
 * ChatPanel — left-menu "Chat" toggle target (slide editor).
 *
 * A working message surface (list, input, send, clear) backed by
 * PresentationStore and mirrored to sessionStorage for the document session.
 * With a co-authoring service configured (PresentationCollaborationProvider)
 * the same store is the relay point for remote messages; without one the
 * panel stays a local scratchpad and says so.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useEffect, useRef, useState } from "react";
import { isCollaborationConfigured } from "../../lib/collaboration-config";
import { presentationStore } from "../../stores/PresentationStore";
import type { PanelChatMessage } from "../../types/presentation";

const STORAGE_KEY = "prese-panel-chat";

function storageId(): string {
	return `${STORAGE_KEY}:${presentationStore.document?.title ?? "untitled"}`;
}

function loadMessages(): PanelChatMessage[] {
	try {
		const raw = sessionStorage.getItem(storageId());
		if (!raw) return [];
		const parsed = JSON.parse(raw) as PanelChatMessage[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveMessages(messages: PanelChatMessage[]): void {
	try {
		sessionStorage.setItem(storageId(), JSON.stringify(messages));
	} catch {
		// storage full / disabled — messages stay in memory
	}
}

function formatTime(ts: number): string {
	return new Date(ts).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function ChatPanelInner({ active }: { active: boolean }): JSX.Element {
	const [text, setText] = useState("");
	const listRef = useRef<HTMLDivElement>(null);
	const messages = presentationStore.chatMessages;
	const connected = isCollaborationConfigured();

	useEffect(() => {
		presentationStore.setChatMessages(loadMessages());
	}, []);
	useEffect(() => {
		saveMessages(messages);
	}, [messages]);
	useEffect(() => {
		if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [messages, active]);

	function send(): void {
		if (!presentationStore.addChatMessage(text)) return;
		setText("");
	}

	return (
		<div
			className="prese-left-panel prese-chat-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="chat"
		>
			<div className="prese-left-panel-header">
				<span>Chat</span>
				{messages.length > 0 && (
					<span className="prese-left-panel-count">{messages.length}</span>
				)}
			</div>
			<div className="prese-chat-messages" ref={listRef}>
				{messages.length === 0 && (
					<div className="prese-left-panel-muted">
						{connected
							? "Co-authoring chat — say hello to your collaborators."
							: "Session chat. Messages stay in this editor session."}
					</div>
				)}
				{messages.map((message) => (
					<div
						key={message.id}
						className={`prese-chat-message${message.self ? " self" : ""}`}
					>
						<div className="prese-chat-message-meta">
							<span className="prese-comment-author">{message.author}</span>
							<span className="prese-left-panel-muted">
								{formatTime(message.createdAt)}
							</span>
						</div>
						<div className="prese-chat-message-text">{message.text}</div>
					</div>
				))}
			</div>
			<div className="prese-chat-input-row">
				<input
					className="prese-left-panel-input"
					type="text"
					placeholder="Message…"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") send();
					}}
					data-action="chat-text"
				/>
				<button
					type="button"
					className="prese-left-panel-btn prese-left-panel-btn-primary"
					onClick={send}
					data-action="chat-send"
				>
					Send
				</button>
			</div>
			{messages.length > 0 && (
				<div className="prese-chat-footer">
					<button
						type="button"
						className="prese-left-panel-btn prese-left-panel-btn-danger"
						onClick={() => presentationStore.clearChatMessages()}
						data-action="chat-clear"
					>
						Clear chat
					</button>
				</div>
			)}
		</div>
	);
}

export const ChatPanel = observer(ChatPanelInner);
