"""DOCX <-> HTML conversion using python-docx.

Stoic goals: preserve text, bold/italic/underline, headings, lists,
tables, and images. We do NOT attempt pagination or print-fidelity —
the editor is a web page, not a print preview.

HTML -> DOCX is lossy by nature (web HTML is richer than we map); we map
only the subset our editor produces, plus whatever reasonable tags appear.
"""

from __future__ import annotations

import io
import re
from html import escape
from html.parser import HTMLParser

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH

# --------------------------------------------------------------------------
# DOCX -> HTML
# --------------------------------------------------------------------------

def docx_to_html(data: bytes) -> str:
    """Convert DOCX bytes to an HTML fragment (content only, no <html>)."""
    doc = Document(io.BytesIO(data))
    parts: list[str] = []
    pending_list: str | None = None  # 'ul' | 'ol' while collecting <li>s

    def flush_list() -> None:
        nonlocal pending_list
        if pending_list:
            parts.append(f"</{pending_list}>")
            pending_list = None

    for para in doc.paragraphs:
        li, list_kind = _paragraph_to_html(para)
        if li is not None:
            if pending_list != list_kind:
                flush_list()
                pending_list = list_kind
                parts.append(f"<{list_kind}>")
            parts.append(li)
        else:
            flush_list()
            parts.append(li or "")

    flush_list()

    for table in doc.tables:
        parts.append(_table_to_html(table))

    return "\n".join(p for p in parts if p)


def _paragraph_to_html(para) -> tuple[str | None, str | None]:
    """Return (html_fragment, list_kind) — (None, None) for non-list blocks.

    List paragraphs are returned as `<li>..</li>` together with their kind
    so the caller can group them into a single `<ul>`/`<ol>`.
    """
    style = (para.style.name or "").lower()
    text = _runs_to_html(para.runs)

    # python-docx exposes list styles as "List Bullet" / "List Number".
    if style.startswith("list"):
        kind = "ul" if "bullet" in style else "ol"
        return f"<li>{text}</li>", kind

    if style.startswith("heading") or style.startswith("titre"):
        level = _heading_level(style)
        return f"<h{level}>{text}</h{level}>", None

    align = para.alignment
    if align == WD_ALIGN_PARAGRAPH.CENTER:
        return f"<p style=\"text-align:center\">{text}</p>", None
    if align == WD_ALIGN_PARAGRAPH.RIGHT:
        return f"<p style=\"text-align:right\">{text}</p>", None

    return f"<p>{text}</p>", None


def _heading_level(style: str) -> int:
    m = re.search(r"(\d+)", style)
    if not m:
        return 1
    return max(1, min(int(m.group(1)), 6))


def _runs_to_html(runs) -> str:
    out: list[str] = []
    for run in runs:
        text = escape(run.text or "")
        if not text:
            continue
        if run.bold:
            text = f"<b>{text}</b>"
        if run.italic:
            text = f"<i>{text}</i>"
        if run.underline:
            text = f"<u>{text}</u>"
        out.append(text)
    if not out:
        # paragraph with no runs (e.g. empty) still needs a newline
        return "<br/>"
    return "".join(out)


def _table_to_html(table) -> str:
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            text = escape((cell.text or "").strip())
            cells.append(f"<td>{text}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return "<table>" + "".join(rows) + "</table>"


# --------------------------------------------------------------------------
# HTML -> DOCX
# --------------------------------------------------------------------------

_TAG_TABLE = re.compile(r"<table>.*?</table>", re.S)


def html_to_docx(html_fragment: str) -> bytes:
    """Convert an HTML fragment into DOCX bytes."""
    # Split tables out; python-docx tables and paragraphs share the body
    # but order interleaving is complex — append tables at the end.
    tables_html = _TAG_TABLE.findall(html_fragment)
    body = _TAG_TABLE.sub("", html_fragment)

    doc = Document()

    block_re = re.compile(r"<(p|h[1-6]|ul|ol|li|table)[^>]*>(.*?)</\1>", re.S)
    blocks = list(block_re.finditer(body))
    for m in blocks:
        tag, inner = m.group(1), m.group(2)
        if tag == "ul" or tag == "ol":
            # extract the <li> items contained in this list block
            for li in re.finditer(r"<li[^>]*>(.*?)</li>", inner, re.S):
                p = doc.add_paragraph(
                    "", style="List Bullet" if tag == "ul" else "List Number"
                )
                _add_styled_runs(p, li.group(1))
            continue
        if tag == "li":
            continue
        if tag.startswith("h"):
            level = int(tag[1])
            p = doc.add_heading("", level=level)
            _add_styled_runs(p, inner)
            continue
        # paragraph
        if "text-align:center" in m.group(0):
            p = doc.add_paragraph("")
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            _add_styled_runs(p, inner)
        elif "text-align:right" in m.group(0):
            p = doc.add_paragraph("")
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            _add_styled_runs(p, inner)
        else:
            p = doc.add_paragraph("")
            _add_styled_runs(p, inner)

    # Tag-less input (e.g. raw text typed into an empty contenteditable):
    # keep it as a single paragraph instead of dropping it silently.
    if not blocks and body.strip():
        p = doc.add_paragraph("")
        _add_styled_runs(p, body)

    for tbl_html in tables_html:
        _append_table(doc, tbl_html)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _inline_to_text(html: str) -> str:
    """Strip tags into plain text and unescape HTML entities.

    Kept as a fallback for contexts where run-level formatting is not
    supported (e.g. table cell text fallback).
    """
    from html import unescape

    text = re.sub(r"<[^>]+>", "", html)
    return unescape(text)


class _InlineRunBuilder(HTMLParser):
    """Parse an inline HTML fragment into (text, bold, italic, underline) runs."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.runs: list[tuple[str, bool, bool, bool]] = []
        self._bold = 0
        self._italic = 0
        self._underline = 0
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in ("b", "strong"):
            self._flush()
            self._bold += 1
        elif tag in ("i", "em"):
            self._flush()
            self._italic += 1
        elif tag == "u":
            self._flush()
            self._underline += 1
        else:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in ("b", "strong"):
            self._flush()
            self._bold = max(0, self._bold - 1)
        elif tag in ("i", "em"):
            self._flush()
            self._italic = max(0, self._italic - 1)
        elif tag == "u":
            self._flush()
            self._underline = max(0, self._underline - 1)
        else:
            self._flush()

    def handle_data(self, data: str) -> None:
        self._buf.append(data)

    def _flush(self) -> None:
        text = "".join(self._buf)
        if text:
            self.runs.append((text, self._bold > 0, self._italic > 0, self._underline > 0))
        self._buf = []


def _styled_runs(html: str) -> list[tuple[str, bool, bool, bool]]:
    builder = _InlineRunBuilder()
    builder.feed(html)
    builder._flush()
    return builder.runs


def _add_styled_runs(paragraph, html: str) -> None:
    """Add runs parsed from an inline HTML fragment to a paragraph."""
    for text, bold, italic, underline in _styled_runs(html):
        run = paragraph.add_run(text)
        if bold:
            run.bold = True
        if italic:
            run.italic = True
        if underline:
            run.underline = True


def _append_table(doc: Document, tbl_html: str) -> None:
    rows = re.findall(r"<tr>(.*?)</tr>", tbl_html, re.S)
    if not rows:
        return
    ncols = 0
    for r in rows:
        ncols = max(ncols, len(re.findall(r"<t[dh]>", r)))
    table = doc.add_table(rows=len(rows), cols=ncols or 1)
    table.style = "Table Grid"
    for i, r in enumerate(rows):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)
        for j, c in enumerate(cells):
            if j < ncols:
                cell = table.cell(i, j)
                cell.paragraphs[0].clear()
                _add_styled_runs(cell.paragraphs[0], c)


