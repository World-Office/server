/**
 * ChatPanel — left-menu "Chat" toggle target.
 *
 * A working message surface (list, input, send, clear) backed by the
 * SpreadsheetStore and mirrored to sessionStorage for the document session.
 * When a co-authoring service is configured (SpreadsheetCollaborationProvider)
 * the same store is the natural relay point for remote messages; without one
 * the panel stays a local scratchpad and says so.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useEffect, useRef, useState } from "react";
import { isCollaborationConfigured } from "../../lib/collaboration-config";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { PanelChatMessage } from "../../types/spreadsheet";

const STORAGE_KEY = "se-panel-chat";

function storageId(): string {
	return `${STORAGE_KEY}:${spreadsheetStore.document?.title ?? "untitled"}`;
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

interface ChatPanelProps {
	active: boolean;
}

function ChatPanelInner({ active }: ChatPanelProps): JSX.Element {
	const [text, setText] = useState("");
	const listRef = useRef<HTMLDivElement>(null);
	const messages = spreadsheetStore.chatMessages;
	const connected = isCollaborationConfigured();

	useEffect(() => {
		spreadsheetStore.setChatMessages(loadMessages());
	}, []);
	useEffect(() => {
		saveMessages(messages);
	}, [messages]);
	useEffect(() => {
		if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [messages, active]);

	function send(): void {
		if (!spreadsheetStore.addChatMessage(text)) return;
		setText("");
	}

	return (
		<div
			className="se-left-panel se-chat-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="chat"
		>
			<div className="se-left-panel-header">
				<span>Chat</span>
				{messages.length > 0 && (
					<span className="se-left-panel-count">{messages.length}</span>
				)}
			</div>
			<div className="se-chat-messages" ref={listRef}>
				{messages.length === 0 && (
					<div className="se-left-panel-muted">
						{connected
							? "Co-authoring chat — say hello to your collaborators."
							: "Session chat. Messages stay in this editor session."}
					</div>
				)}
				{messages.map((message) => (
					<div
						key={message.id}
						className={`se-chat-message${message.self ? " self" : ""}`}
					>
						<div className="se-chat-message-meta">
							<span className="se-comment-author">{message.author}</span>
							<span className="se-left-panel-muted">
								{formatTime(message.createdAt)}
							</span>
						</div>
						<div className="se-chat-message-text">{message.text}</div>
					</div>
				))}
			</div>
			<div className="se-chat-input-row">
				<input
					className="se-left-panel-input"
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
					className="se-left-panel-btn se-left-panel-btn-primary"
					onClick={send}
					data-action="chat-send"
				>
					Send
				</button>
			</div>
			{messages.length > 0 && (
				<div className="se-chat-footer">
					<button
						type="button"
						className="se-left-panel-btn se-left-panel-btn-danger"
						onClick={() => spreadsheetStore.clearChatMessages()}
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
