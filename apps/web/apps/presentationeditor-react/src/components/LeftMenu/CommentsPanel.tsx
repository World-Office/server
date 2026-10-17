/**
 * CommentsPanel — left-menu "Comments" toggle target (slide editor).
 *
 * Slide-anchored comment threads held in PresentationStore (so they survive
 * panel toggles) and mirrored to sessionStorage per document. New comments
 * anchor to the current slide; a thread's badge jumps back to that slide.
 * When a co-authoring session is live the provider can relay the same store
 * state — no service is required for the panel to work.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useEffect, useMemo, useState } from "react";
import { presentationStore } from "../../stores/PresentationStore";
import type { SlideCommentThread } from "../../types/presentation";

const STORAGE_KEY = "prese-slide-comments";

function storageId(): string {
	return `${STORAGE_KEY}:${presentationStore.document?.title ?? "untitled"}`;
}

function loadThreads(): SlideCommentThread[] {
	try {
		const raw = sessionStorage.getItem(storageId());
		if (!raw) return [];
		const parsed = JSON.parse(raw) as SlideCommentThread[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveThreads(threads: SlideCommentThread[]): void {
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

function CommentsPanelInner({ active }: { active: boolean }): JSX.Element {
	const [text, setText] = useState("");
	const [replyFor, setReplyFor] = useState<string | null>(null);
	const [replyText, setReplyText] = useState("");
	const [showResolved, setShowResolved] = useState(false);

	const threads = presentationStore.slideComments;
	const visible = useMemo(
		() => threads.filter((t) => showResolved || !t.resolved),
		[threads, showResolved],
	);
	const currentSlide = presentationStore.currentSlide;
	const slideTitle =
		presentationStore.slides[currentSlide]?.title ?? `Slide ${currentSlide + 1}`;

	// load once per document, keep the store persisted on change
	useEffect(() => {
		presentationStore.setSlideComments(loadThreads());
	}, []);
	useEffect(() => {
		saveThreads(threads);
	}, [threads]);

	function addComment(): void {
		if (!presentationStore.addSlideComment(currentSlide, text)) return;
		setText("");
	}

	function addReply(threadId: string): void {
		if (!presentationStore.addSlideReply(threadId, replyText)) return;
		setReplyText("");
		setReplyFor(null);
	}

	return (
		<div
			className="prese-left-panel prese-comments-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="comments"
		>
			<div className="prese-left-panel-header">
				<span>Comments</span>
				{threads.filter((t) => !t.resolved).length > 0 && (
					<span className="prese-left-panel-count">
						{threads.filter((t) => !t.resolved).length}
					</span>
				)}
			</div>
			<div className="prese-left-panel-body">
				<div className="prese-left-panel-muted">
					Comment on:{" "}
					<span className="prese-left-panel-badge">
						Slide {currentSlide + 1} — {slideTitle || "Untitled"}
					</span>
				</div>
				<textarea
					className="prese-left-panel-textarea"
					placeholder="Leave a comment on this slide…"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addComment();
					}}
					data-action="comment-text"
				/>
				<div className="prese-left-panel-actions">
					<button
						type="button"
						className="prese-left-panel-btn prese-left-panel-btn-primary"
						onClick={addComment}
						data-action="comment-add"
					>
						Comment
					</button>
					<label className="prese-left-panel-check">
						<input
							type="checkbox"
							checked={showResolved}
							onChange={(e) => setShowResolved(e.target.checked)}
						/>
						Show resolved
					</label>
				</div>
				<ul className="prese-left-panel-list">
					{visible.map((thread) => (
						<li
							key={thread.id}
							className={`prese-comment-thread${thread.resolved ? " resolved" : ""}`}
						>
							<div className="prese-comment-meta">
								<button
									type="button"
									className="prese-left-panel-badge"
									title="Go to slide"
									onClick={() =>
										presentationStore.setCurrentSlide(thread.slideIndex)
									}
								>
									Slide {thread.slideIndex + 1}
								</button>
								<span className="prese-comment-author">{thread.author}</span>
								<span className="prese-left-panel-muted">
									{formatTime(thread.createdAt)}
								</span>
							</div>
							<div className="prese-comment-text">{thread.text}</div>
							{thread.replies.map((reply) => (
								<div key={reply.id} className="prese-comment-reply">
									<span className="prese-comment-author">{reply.author}</span>
									<span className="prese-comment-text">{reply.text}</span>
								</div>
							))}
							<div className="prese-left-panel-actions">
								<button
									type="button"
									className="prese-left-panel-btn"
									onClick={() =>
										presentationStore.setSlideCommentResolved(
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
									className="prese-left-panel-btn"
									onClick={() => setReplyFor(thread.id)}
									data-action="comment-reply"
								>
									Reply
								</button>
								<button
									type="button"
									className="prese-left-panel-btn prese-left-panel-btn-danger"
									onClick={() => presentationStore.deleteSlideComment(thread.id)}
									data-action="comment-delete"
								>
									Delete
								</button>
							</div>
							{replyFor === thread.id && (
								<div className="prese-comment-reply-box">
									<textarea
										className="prese-left-panel-textarea"
										placeholder="Reply…"
										value={replyText}
										onChange={(e) => setReplyText(e.target.value)}
									/>
									<div className="prese-left-panel-actions">
										<button
											type="button"
											className="prese-left-panel-btn prese-left-panel-btn-primary"
											onClick={() => addReply(thread.id)}
										>
											Send
										</button>
										<button
											type="button"
											className="prese-left-panel-btn"
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
					<div className="prese-left-panel-muted">
						No comments yet. Open a slide and write the first one.
					</div>
				)}
				{active && threads.length > 0 && visible.length === 0 && (
					<div className="prese-left-panel-muted">
						All comments are resolved.
					</div>
				)}
			</div>
		</div>
	);
}

export const CommentsPanel = observer(CommentsPanelInner);
