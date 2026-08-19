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
    for m in block_re.finditer(body):
        tag, inner = m.group(1), m.group(2)
        if tag == "ul" or tag == "ol":
            # extract the <li> items contained in this list block
            for li in re.finditer(r"<li[^>]*>(.*?)</li>", inner, re.S):
                doc.add_paragraph(
                    _inline_to_text(li.group(1)),
                    style="List Bullet" if tag == "ul" else "List Number",
                )
            continue
        if tag == "li":
            continue
        if tag.startswith("h"):
            level = int(tag[1])
            doc.add_heading(_inline_to_text(inner), level=level)
            continue
        # paragraph
        if "text-align:center" in m.group(0):
            p = doc.add_paragraph(_inline_to_text(inner))
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif "text-align:right" in m.group(0):
            p = doc.add_paragraph(_inline_to_text(inner))
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        else:
            doc.add_paragraph(_inline_to_text(inner))

    for tbl_html in tables_html:
        _append_table(doc, tbl_html)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _inline_to_text(html: str) -> str:
    """Strip tags into plain text and unescape HTML entities.

    Inline formatting (bold/italic/underline) is intentionally not
    reconstructed — plain text keeps the converter simple and predictable.
    """
    from html import unescape

    text = re.sub(r"<[^>]+>", "", html)
    return unescape(text)


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
                table.cell(i, j).text = _unescape(re.sub(r"<[^>]+>", "", c))


def _unescape(text: str) -> str:
    """Reduce common HTML entities to text (stdlib-only)."""
    from html import unescape

    return unescape(text)
