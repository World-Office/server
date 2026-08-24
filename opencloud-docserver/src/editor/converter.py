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
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

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
    """Render a python-docx table as an HTML <table> fragment.

    Cell text keeps run-level formatting (bold/italic/underline) and
    multi-paragraph cells are joined with <br/>. Horizontal merges
    (gridSpan) and vertical merges (vMerge) are preserved as colspan /
    rowspan attributes so a DOCX -> HTML -> DOCX round-trip does not
    duplicate or drop cells.
    """
    grid = _table_grid(table)
    out: list[str] = []
    for r, row in enumerate(grid):
        cells: list[str] = []
        for e in row:
            if e["vmerge"] == "cont":
                continue  # covered by the restart cell's rowspan
            tag = "th" if _row_is_header(e["tr"]) else "td"
            rowspan = 1
            if e["vmerge"] == "start":
                rowspan = _rowspan_for(grid, r, e["pos"])
            cells.append(_cell_to_html(e, rowspan, tag))
        out.append("<tr>" + "".join(cells) + "</tr>")
    return "<table>" + "".join(out) + "</table>"


def _table_grid(table):
    """Expand every row's <w:tc> elements into grid entries.

    Each entry is ``{tr, tc, pos, width, vmerge}`` where ``pos`` is the
    0-based grid column the cell starts at (accounting for gridSpan),
    ``width`` is its gridSpan, and ``vmerge`` is None / 'start' / 'cont'
    for non-merged / vMerge-restart / vMerge-continuation cells. We walk
    the raw XML because ``row.cells`` repeats merged cells and shifts the
    grid for merged tables, which would corrupt the HTML output.
    """
    grid = []
    for tr in (row._tr for row in table.rows):
        entries = []
        pos = 0
        for tc in tr.tc_lst:
            width = 1
            vmerge = None
            if tc.tcPr is not None:
                if tc.tcPr.gridSpan is not None and tc.tcPr.gridSpan.val:
                    width = tc.tcPr.gridSpan.val
                if tc.tcPr.vMerge is not None:
                    vmerge = (
                        "start" if tc.tcPr.vMerge.val == "restart" else "cont"
                    )
            entries.append(
                {"tr": tr, "tc": tc, "pos": pos, "width": width, "vmerge": vmerge}
            )
            pos += width
        grid.append(entries)
    return grid


def _rowspan_for(grid, r, pos) -> int:
    """Count how many rows a vMerge-restart cell at (r, pos) spans."""
    span = 1
    for row in grid[r + 1:]:
        match = None
        for e in row:
            if e["pos"] > pos:
                break
            if e["pos"] == pos:
                match = e
                break
        if match is None or match["vmerge"] != "cont":
            break
        span += 1
    return span


def _row_is_header(tr) -> bool:
    """True if the row is marked as a repeating header (w:tblHeader)."""
    trPr = tr.trPr
    return trPr is not None and trPr.find(qn("w:tblHeader")) is not None


def _cell_to_html(e, rowspan: int, tag: str) -> str:
    """Render one grid entry as <td|th> HTML, keeping inline formatting."""
    attrs = ""
    if e["width"] > 1:
        attrs += f' colspan="{e["width"]}"'
    if rowspan > 1:
        attrs += f' rowspan="{rowspan}"'
    paras: list[str] = []
    for p_el in e["tc"].p_lst:
        paras.append(_runs_to_html(Paragraph(p_el, e["tc"]).runs))
    inner = "<br/>".join(paras)
    if inner == "<br/>":
        inner = ""  # a single empty paragraph is an empty cell
    return f"<{tag}{attrs}>{inner}</{tag}>"


class _TableParser(HTMLParser):
    """Parse an HTML <table> fragment into rows of cell specs.

    Each cell is ``{"tag": "td"|"th", "attrs": {...}, "html": [...]}``
    whose ``html`` keeps the raw inner markup (inline tags + <br/>) so
    run-level formatting can be re-applied when building the DOCX.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[dict]] = []
        self._row: list[dict] | None = None
        self._cell: dict | None = None
        self._nested = 0  # open inline/nested elements inside the cell

    def handle_starttag(self, tag: str, attrs) -> None:
        if self._cell is not None:
            self._cell["html"].append(self.get_starttag_text())
            if tag != "br":
                self._nested += 1
        if tag == "tr":
            if self._cell is None:
                self._row = []
                self.rows.append(self._row)
        elif tag in ("td", "th") and self._cell is None:
            if self._row is None:
                self._row = []
                self.rows.append(self._row)
            cell = {"tag": tag, "attrs": dict(attrs), "html": []}
            self._row.append(cell)
            self._cell = cell
            self._nested = 0

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th"):
            if self._cell is not None and self._cell["tag"] == tag:
                self._cell = None
        elif tag == "tr":
            self._cell = None
            self._row = None
        elif self._cell is not None and tag != "br":
            if self._nested > 0:
                self._nested -= 1
            self._cell["html"].append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell["html"].append(data)


# --------------------------------------------------------------------------
# HTML -> DOCX
# --------------------------------------------------------------------------

_TAG_TABLE = re.compile(r"<table[^>]*>.*?</table>", re.S)


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
    """Append an HTML <table> to the document as a python-docx table.

    Honors <th> (row becomes a repeating header), colspan (gridSpan),
    rowspan (vMerge) and <br/> (extra paragraphs inside a cell).
    """
    parser = _TableParser()
    parser.feed(tbl_html)
    rows = parser.rows
    if not rows:
        return
    ncols = 0
    for cells in rows:
        width = 0
        for c in cells:
            width += int(c["attrs"].get("colspan", 1) or 1)
        ncols = max(ncols, width)
    table = doc.add_table(rows=len(rows), cols=ncols or 1)
    table.style = "Table Grid"
    pending = [0] * ncols  # remaining rows covered by a rowspan, per grid column
    for r, cells in enumerate(rows):
        if any(c["tag"] == "th" for c in cells):
            _mark_header_row(table.rows[r]._tr)
        pos = 0
        for c in cells:
            # Skip grid columns still covered by a rowspan from above.
            while pos < ncols and pending[pos] > 0:
                pending[pos] -= 1
                pos += 1
            if pos >= ncols:
                break
            colspan = int(c["attrs"].get("colspan", 1) or 1)
            rowspan = int(c["attrs"].get("rowspan", 1) or 1)
            cell = table.cell(r, pos)
            _fill_cell(cell, "".join(c["html"]))
            if colspan > 1 or rowspan > 1:
                bottom = min(r + rowspan - 1, len(rows) - 1)
                right = min(pos + colspan - 1, ncols - 1)
                if (bottom, right) != (r, pos):
                    # Best effort: a malformed colspan/rowspan grid must
                    # not crash the conversion.
                    try:
                        cell.merge(table.cell(bottom, right))
                    except Exception:
                        pass
            for cc in range(pos, pos + colspan):
                pending[cc] = max(pending[cc], rowspan - 1)
            pos += colspan
        # A trailing rowspan may extend past this row in malformed input;
        # drain it so later rows are laid out from a clean state.
        for cc in range(pos, ncols):
            if pending[cc] > 0:
                pending[cc] -= 1


def _fill_cell(cell, html: str) -> None:
    """Fill a table cell; <br/>-separated fragments become paragraphs."""
    parts = re.split(r"<br\s*/?>", html)
    first = True
    for part in parts:
        paragraph = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        _add_styled_runs(paragraph, part)


def _mark_header_row(tr) -> None:
    """Mark a table row as a repeating header (w:tblHeader)."""
    trPr = tr.get_or_add_trPr()
    if trPr.find(qn("w:tblHeader")) is None:
        trPr.append(OxmlElement("w:tblHeader"))


