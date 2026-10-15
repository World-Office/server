/**
 * CommentsPanel — left-menu "Comments" toggle target.
 *
 * Cell-anchored comment threads stored in the SpreadsheetStore (so they
 * survive panel toggles) and mirrored to sessionStorage per document. New
 * comments anchor to the sheet's current selection; a thread's cell badge
 * jumps back to that cell. No co-authoring service is required — when one
 * is connected the provider can pick the same store up later.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useEffect, useMemo, useState } from "react";
import {
	activateCell,
	collectTextCells,
	getActiveCellRef,
	getActiveSheetName,
	type SheetCell,
} from "../../lib/cell-access";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";
import type { CellCommentThread } from "../../types/spreadsheet";

const STORAGE_KEY = "se-cell-comments";

function storageId(): string {
	return `${STORAGE_KEY}:${spreadsheetStore.document?.title ?? "untitled"}`;
}

function loadThreads(): CellCommentThread[] {
	try {
		const raw = sessionStorage.getItem(storageId());
		if (!raw) return [];
		const parsed = JSON.parse(raw) as CellCommentThread[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveThreads(threads: CellCommentThread[]): void {
	try {
		sessionStorage.setItem(storageId(), JSON.stringify(threads));
	} catch {
		// storage full / disabled — comments stay in memory
	}
}

function formatTime(ts: number): string {
	return new Date(ts).toLocaleString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		day: "2-digit",
		month: "short",
	});
}

function anchorCell(cellRef: string): SheetCell | null {
	const ref = cellRef.includes("!") ? cellRef.split("!").pop() ?? "" : cellRef;
	return collectTextCells().find((c) => c.ref === ref) ?? null;
}

interface CommentsPanelProps {
	active: boolean;
}

function CommentsPanelInner({ active }: CommentsPanelProps): JSX.Element {
	const [text, setText] = useState("");
	const [replyFor, setReplyFor] = useState<string | null>(null);
	const [replyText, setReplyText] = useState("");
	const [showResolved, setShowResolved] = useState(false);
	const [anchor, setAnchor] = useState<string | null>(null);

	const threads = spreadsheetStore.cellComments;
	const visible = useMemo(
		() => threads.filter((t) => showResolved || !t.resolved),
		[threads, showResolved],
	);

	// load once per document, keep the store persisted on change
	useEffect(() => {
		spreadsheetStore.setCellComments(loadThreads());
	}, []);
	useEffect(() => {
		saveThreads(threads);
	}, [threads]);

	// track the selection so a new comment lands on the visited cell
	useEffect(() => {
		if (!active) return;
		const update = () => {
			const ref = getActiveCellRef();
			const name = getActiveSheetName();
			setAnchor(ref ? `${name ?? "Sheet"}!${ref}` : null);
		};
		update();
		const timer = window.setInterval(update, 1000);
		return () => window.clearInterval(timer);
	}, [active]);

	function addComment(): void {
		if (!text.trim()) return;
		const target = anchor ?? getActiveCellRef() ?? "A1";
		spreadsheetStore.addCellComment(target, text);
		setText("");
	}

	function addReply(threadId: string): void {
		if (!replyText.trim()) return;
		spreadsheetStore.addCellReply(threadId, replyText);
		setReplyText("");
		setReplyFor(null);
	}

	return (
		<div
			className="se-left-panel se-comments-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="comments"
		>
			<div className="se-left-panel-header">
				<span>Comments</span>
				{threads.filter((t) => !t.resolved).length > 0 && (
					<span className="se-left-panel-count">
						{threads.filter((t) => !t.resolved).length}
					</span>
				)}
			</div>
			<div className="se-left-panel-body">
				<div className="se-left-panel-muted">
					Comment on: <strong>{anchor ?? "no cell selected"}</strong>
				</div>
				<textarea
					className="se-left-panel-textarea"
					placeholder="Leave a comment on the selected cell…"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addComment();
					}}
					data-action="comment-text"
				/>
				<div className="se-left-panel-actions">
					<button
						type="button"
						className="se-left-panel-btn se-left-panel-btn-primary"
						onClick={addComment}
						data-action="comment-add"
					>
						Comment
					</button>
					<label className="se-left-panel-check">
						<input
							type="checkbox"
							checked={showResolved}
							onChange={(e) => setShowResolved(e.target.checked)}
						/>
						Show resolved
					</label>
				</div>
				<ul className="se-left-panel-list">
					{visible.map((thread) => (
						<li
							key={thread.id}
							className={`se-comment-thread${thread.resolved ? " resolved" : ""}`}
						>
							<div className="se-comment-meta">
								<button
									type="button"
									className="se-left-panel-badge"
									title="Go to cell"
									onClick={() => {
										const cell = anchorCell(thread.cellRef);
										if (cell) activateCell(cell);
									}}
								>
									{thread.cellRef}
								</button>
								<span className="se-comment-author">{thread.author}</span>
								<span className="se-left-panel-muted">
									{formatTime(thread.createdAt)}
								</span>
							</div>
							<div className="se-comment-text">{thread.text}</div>
							{thread.replies.map((reply) => (
								<div key={reply.id} className="se-comment-reply">
									<span className="se-comment-author">{reply.author}</span>
									<span className="se-comment-text">{reply.text}</span>
								</div>
							))}
							<div className="se-left-panel-actions">
								<button
									type="button"
									className="se-left-panel-btn"
									onClick={() =>
										spreadsheetStore.setCellCommentResolved(
											thread.id,
											!thread.resolved,
										)
									}
									data-action="comment-resolve"
								>
									{thread.resolved ? "Reopen" : "Resolve"}
								</button>
								<button
									type="button"
									className="se-left-panel-btn"
									onClick={() => setReplyFor(thread.id)}
									data-action="comment-reply"
								>
									Reply
								</button>
								<button
									type="button"
									className="se-left-panel-btn se-left-panel-btn-danger"
									onClick={() => spreadsheetStore.deleteCellComment(thread.id)}
									data-action="comment-delete"
								>
									Delete
								</button>
							</div>
							{replyFor === thread.id && (
								<div className="se-comment-reply-box">
									<textarea
										className="se-left-panel-textarea"
										placeholder="Reply…"
										value={replyText}
										onChange={(e) => setReplyText(e.target.value)}
									/>
									<div className="se-left-panel-actions">
										<button
											type="button"
											className="se-left-panel-btn se-left-panel-btn-primary"
											onClick={() => addReply(thread.id)}
										>
											Send
										</button>
										<button
											type="button"
											className="se-left-panel-btn"
											onClick={() => {
												setReplyFor(null);
												setReplyText("");
											}}
										>
											Cancel
										</button>
									</div>
								</div>
							)}
						</li>
					))}
				</ul>
				{threads.length === 0 && (
					<div className="se-left-panel-muted">
						No comments yet. Select a cell and write the first one.
					</div>
				)}
			</div>
		</div>
	);
}

export const CommentsPanel = observer(CommentsPanelInner);
