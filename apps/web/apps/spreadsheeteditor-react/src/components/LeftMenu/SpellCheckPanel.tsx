/**
 * SpellCheckPanel — left-menu "Spell Check" toggle target.
 *
 * Scans every text cell of the workbook with the heuristic checker in
 * lib/spellcheck.ts (curated typo dictionary + repeated-word + triple-letter
 * rules — the sheet app ships no Hunspell runtime, so the panel is explicit
 * about being a typo pass, not a full dictionary check). Each issue can be
 * ignored for the session or fixed in place through the Univer facade.
 */
import { observer } from "mobx-react-lite";
import { type JSX, useState } from "react";
import { activateCell, collectTextCells, setCellValue } from "../../lib/cell-access";
import { applySuggestion, findSpellIssues, type SpellIssue } from "../../lib/spellcheck";
import { spreadsheetStore } from "../../stores/SpreadsheetStore";

const REASON_LABELS: Record<SpellIssue["reason"], string> = {
	typo: "common typo",
	"repeated-word": "repeated word",
	"triple-letter": "triple letter",
};

interface SpellCheckPanelProps {
	active: boolean;
}

function SpellCheckPanelInner({ active }: SpellCheckPanelProps): JSX.Element {
	const [issues, setIssues] = useState<SpellIssue[]>([]);
	const [checked, setChecked] = useState(false);
	const [ignored, setIgnored] = useState<Set<string>>(new Set());
	const [status, setStatus] = useState("");

	function runCheck(): void {
		const found = findSpellIssues(collectTextCells(), ignored);
		setIssues(found);
		setChecked(true);
		setStatus("");
	}

	function ignore(issue: SpellIssue): void {
		const word =
			issue.reason === "repeated-word"
				? issue.word.split(" ")[0]
				: issue.word;
		const next = new Set(ignored);
		next.add(word.toLowerCase());
		setIgnored(next);
		setIssues((current) => current.filter((i) => i.id !== issue.id));
	}

	function fix(issue: SpellIssue, newText: string): boolean {
		if (!setCellValue(issue.cell, newText)) {
			setStatus("No active sheet — cannot apply the fix.");
			return false;
		}
		setIssues((current) => current.filter((i) => i.id !== issue.id));
		return true;
	}

	function fixOne(issue: SpellIssue): void {
		if (!issue.suggestion) {
			// nothing to auto-apply — jump to the cell so the user can edit it
			activateCell(issue.cell);
			return;
		}
		fix(issue, applySuggestion(issue.cell.value, issue));
	}

	function fixAll(): void {
		let count = 0;
		for (const issue of issues) {
			if (!issue.suggestion) continue;
			if (fix(issue, applySuggestion(issue.cell.value, issue))) count++;
		}
		setStatus(count > 0 ? `Fixed ${count} issue(s).` : "No auto-fixable issues left.");
	}

	return (
		<div
			className="se-left-panel se-spellcheck-panel"
			style={{ display: active ? "flex" : "none" }}
			data-panel="spellcheck"
		>
			<div className="se-left-panel-header">
				<span>Spell Check</span>
				{issues.length > 0 && (
					<span className="se-left-panel-count">{issues.length}</span>
				)}
			</div>
			<div className="se-left-panel-body">
				<div className="se-left-panel-actions">
					<button
						type="button"
						className="se-left-panel-btn se-left-panel-btn-primary"
						onClick={runCheck}
						data-action="spellcheck-run"
					>
						Check sheet
					</button>
					{issues.some((i) => i.suggestion) && (
						<button
							type="button"
							className="se-left-panel-btn"
							onClick={fixAll}
							data-action="spellcheck-fix-all"
						>
							Fix all
						</button>
					)}
				</div>
				{status && <div className="se-left-panel-muted">{status}</div>}
				{checked && issues.length === 0 && !status && (
					<div className="se-left-panel-muted">
						No typos found by the rule set.
					</div>
				)}
				<ul className="se-left-panel-list">
					{issues.map((issue) => (
						<li
							key={issue.id}
							className="se-spellcheck-issue"
							data-cell={issue.cell.ref}
						>
							<div className="se-comment-meta">
								<button
									type="button"
									className="se-left-panel-badge"
									title="Go to cell"
									onClick={() => activateCell(issue.cell)}
								>
									{issue.cell.sheetName}!{issue.cell.ref}
								</button>
								<span className="se-left-panel-muted">
									{REASON_LABELS[issue.reason]}
								</span>
							</div>
							<div className="se-spellcheck-word">
								<span className="se-spellcheck-bad">{issue.word}</span>
								{issue.suggestion && (
									<>
										<span className="se-left-panel-muted"> → </span>
										<span className="se-spellcheck-good">
											{issue.suggestion}
										</span>
									</>
								)}
							</div>
							<div className="se-left-panel-actions">
								{issue.suggestion && (
									<button
										type="button"
										className="se-left-panel-btn se-left-panel-btn-primary"
										onClick={() => fixOne(issue)}
										data-action="spellcheck-fix"
									>
										Fix
									</button>
								)}
								<button
									type="button"
									className="se-left-panel-btn"
									onClick={() => ignore(issue)}
									data-action="spellcheck-ignore"
								>
									Ignore
								</button>
								{!issue.suggestion && (
									<button
										type="button"
										className="se-left-panel-btn"
										onClick={() => activateCell(issue.cell)}
									>
										Go to cell
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
				<div className="se-left-panel-muted se-left-panel-footnote">
					Heuristic pass (frequent typos, repeated words, triple letters) —
					not a full dictionary check. Language:{" "}
					{spreadsheetStore.languageCode}
				</div>
			</div>
		</div>
	);
}

export const SpellCheckPanel = observer(SpellCheckPanelInner);
