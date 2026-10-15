/**
 * Heuristic spell checker for the spreadsheet left-menu panel.
 *
 * Unlike the word editor (which loads a full Hunspell dictionary through the
 * wo-renderer WASM engine) the sheet app has no dictionary runtime, so this
 * module flags the mistakes a small ruleset can catch with near-zero noise:
 *
 *   - a curated dictionary of frequent English/German typos (with fix)
 *   - a repeated word ("the the" → "the")
 *   - a triple letter run ("worrd" → "word"-style collapse)
 *
 * Everything else is treated as correct — the panel says so explicitly rather
 * than pretending to be a full checker. Pure functions only, so it is unit
 * tested without a DOM.
 */

import type { SheetCell } from "./cell-access";

export type SpellIssueReason =
	| "typo"
	| "repeated-word"
	| "triple-letter";

export interface SpellIssue {
	/** Stable id: sheet/ref/offset/word. */
	id: string;
	word: string;
	reason: SpellIssueReason;
	/** Corrected word, or null when the ruleset has no fix to offer. */
	suggestion: string | null;
	cell: SheetCell;
	/** Character offset of the word inside the cell text. */
	offset: number;
}

/** Frequent typos → correction. Keys are matched case-insensitively. */
const TYPOS: Record<string, string> = {
	// English
	teh: "the",
	tehre: "there",
	thier: "their",
	recieve: "receive",
	recieved: "received",
	recieving: "receiving",
	beleive: "believe",
	seperate: "separate",
	seperated: "separated",
	definately: "definitely",
	definatly: "definitely",
	occured: "occurred",
	occuring: "occurring",
	untill: "until",
	wich: "which",
	becuase: "because",
	becasue: "because",
	becuse: "because",
	accross: "across",
	adress: "address",
	adresses: "addresses",
	agressive: "aggressive",
	apparant: "apparent",
	arguement: "argument",
	buisness: "business",
	calender: "calendar",
	cemetary: "cemetery",
	collegue: "colleague",
	commitee: "committee",
	comming: "coming",
	commited: "committed",
	completly: "completely",
	concious: "conscious",
	curiousity: "curiosity",
	decison: "decision",
	defintion: "definition",
	dependant: "dependent",
	desparate: "desperate",
	diffrent: "different",
	dilemna: "dilemma",
	disapear: "disappear",
	dissapear: "disappear",
	embarass: "embarrass",
	enviroment: "environment",
	excellant: "excellent",
	existance: "existence",
	familar: "familiar",
	finaly: "finally",
	foriegn: "foreign",
	fourty: "forty",
	fullfil: "fulfill",
	garantee: "guarantee",
	goverment: "government",
	grammer: "grammar",
	gaurd: "guard",
	harrass: "harass",
	hieght: "height",
	hopeing: "hoping",
	humerous: "humorous",
	ignorence: "ignorance",
	immediatly: "immediately",
	independant: "independent",
	intrest: "interest",
	jewellry: "jewelry",
	judgement: "judgment",
	knowlege: "knowledge",
	labratory: "laboratory",
	liason: "liaison",
	libary: "library",
	lieing: "lying",
	maintainance: "maintenance",
	maintenence: "maintenance",
	millenium: "millennium",
	miniture: "miniature",
	mischevious: "mischievous",
	morgage: "mortgage",
	neccessary: "necessary",
	necesary: "necessary",
	neice: "niece",
	nieghbor: "neighbor",
	nineth: "ninth",
	noticable: "noticeable",
	occassion: "occasion",
	oppurtunity: "opportunity",
	paralell: "parallel",
	pavillion: "pavilion",
	percieve: "perceive",
	perfomance: "performance",
	personel: "personnel",
	posession: "possession",
	possable: "possible",
	potatoe: "potato",
	prefered: "preferred",
	priviledge: "privilege",
	probaly: "probably",
	proffesional: "professional",
	publically: "publicly",
	questionaire: "questionnaire",
	reccomend: "recommend",
	reciept: "receipt",
	recomend: "recommend",
	refered: "referred",
	religous: "religious",
	remeber: "remember",
	repitition: "repetition",
	responsable: "responsible",
	restarant: "restaurant",
	relevent: "relevant",
	rythm: "rhythm",
	schedual: "schedule",
	secerely: "sincerely",
	sence: "sense",
	speach: "speech",
	strenght: "strength",
	succesful: "successful",
	successfull: "successful",
	supress: "suppress",
	suprise: "surprise",
	tendacy: "tendency",
	tommorow: "tomorrow",
	truely: "truly",
	tounge: "tongue",
	treshold: "threshold",
	tryed: "tried",
	unacceptible: "unacceptable",
	unbelieveable: "unbelievable",
	unkown: "unknown",
	unneccessary: "unnecessary",
	unfortunatly: "unfortunately",
	usualy: "usually",
	vegatarian: "vegetarian",
	vaccum: "vacuum",
	vaccume: "vacuum",
	wether: "whether",
	wierd: "weird",
	withold: "withhold",
	writting: "writing",
	yeild: "yield",
	// German
	vieleicht: "vielleicht",
	standart: "Standard",
	wiederrum: "wiederum",
	nähmlich: "nämlich",
	seperat: "separat",
	addresse: "Adresse",
};

const WORD_RE = /[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'’-]*/g;

/** Words the ruleset should never flag (case-sensitive shortcuts). */
function isSkippable(word: string): boolean {
	if (word.length < 2) return true;
	if (/\d/.test(word)) return true;
	// acronyms / constants (NASA, VAT, USD)
	if (word.length <= 5 && word === word.toUpperCase()) return true;
	return false;
}

/** Match the casing of `word` when applying `fix` (Word → Word, word → word). */
function matchCase(word: string, fix: string): string {
	if (word === word.toUpperCase()) return fix.toUpperCase();
	if (word[0] === word[0].toUpperCase()) {
		return fix.charAt(0).toUpperCase() + fix.slice(1);
	}
	return fix;
}

/** Heuristic check of a single word. `null` when nothing to complain about. */
export function checkWord(
	word: string,
): { reason: SpellIssueReason; suggestion: string } | null {
	if (isSkippable(word)) return null;
	const lower = word.toLowerCase();
	const typo = TYPOS[lower];
	if (typo) {
		return { reason: "typo", suggestion: matchCase(word, typo) };
	}
	// "worrd" — three identical letters in a row is never English/German
	const triple = /(.)\1\1/.exec(word);
	if (triple) {
		const collapsed = word.replace(/(.)\1\1+/g, `$1$1`);
		if (collapsed !== word) {
			return { reason: "triple-letter", suggestion: collapsed };
		}
	}
	return null;
}

/**
 * Find every issue in the given cells. Repeated words ("the the") are
 * detected per cell text; word issues per token. `ignored` words (session
 * ignore list) are skipped.
 */
export function findSpellIssues(
	cells: SheetCell[],
	ignored: ReadonlySet<string> = new Set(),
): SpellIssue[] {
	const issues: SpellIssue[] = [];
	for (const cell of cells) {
		const text = cell.value;

		// repeated word: "the the", "sum sum" (case-insensitive)
		const repeat = /\b([A-Za-zÄÖÜäöüß]{2,})\s+\1\b/g;
		let m: RegExpExecArray | null;
		while ((m = repeat.exec(text)) !== null) {
			const word = m[1];
			if (ignored.has(word.toLowerCase())) continue;
			issues.push({
				id: `${cell.sheetId}!${cell.ref}:${m.index}:${word}:repeat`,
				word: `${word} ${word}`,
				reason: "repeated-word",
				suggestion: word,
				cell,
				offset: m.index,
			});
		}

		WORD_RE.lastIndex = 0;
		while ((m = WORD_RE.exec(text)) !== null) {
			const word = m[0];
			if (ignored.has(word.toLowerCase())) continue;
			const found = checkWord(word);
			if (!found) continue;
			// a word inside a repeated-word hit was already reported
			if (
				issues.some(
					(i) =>
						i.cell === cell &&
						i.reason === "repeated-word" &&
						m!.index >= i.offset &&
						m!.index < i.offset + i.word.length,
				)
			) {
				continue;
			}
			issues.push({
				id: `${cell.sheetId}!${cell.ref}:${m.index}:${word}`,
				word,
				reason: found.reason,
				suggestion: found.suggestion,
				cell,
				offset: m.index,
			});
		}
	}
	return issues;
}

/**
 * Rewrite a cell text with the issue's fix applied at its offset. When the
 * text changed in the meantime the fix is re-anchored by word so an edited
 * cell still gets its correction (best effort, never throws).
 */
export function applySuggestion(
	text: string,
	issue: SpellIssue,
): string {
	const replacement = issue.suggestion ?? issue.word;
	if (issue.reason === "repeated-word") {
		return (
			text.slice(0, issue.offset) +
			replacement +
			text.slice(issue.offset + issue.word.length)
		);
	}
	if (text.startsWith(issue.word, issue.offset)) {
		return (
			text.slice(0, issue.offset) +
			replacement +
			text.slice(issue.offset + issue.word.length)
		);
	}
	// cell was edited since the check — fall back to a global word replace
	const idx = text.indexOf(issue.word);
	if (idx === -1) return text;
	return (
		text.slice(0, idx) + replacement + text.slice(idx + issue.word.length)
	);
}
