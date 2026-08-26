"""DOCX <-> HTML conversion using python-docx.

Stoic goals: preserve text, bold/italic/underline, headings, lists,
tables, and images. We do NOT attempt pagination or print-fidelity —
the editor is a web page, not a print preview.

HTML -> DOCX is lossy by nature (web HTML is richer than we map); we map
only the subset our editor produces, plus whatever reasonable tags appear.
"""

from __future__ import annotations

import base64
import io
import logging
import re
from html import escape
from html.parser import HTMLParser

from docx import Document
from docx.enum.dml import MSO_COLOR_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Emu, RGBColor
from docx.table import _Cell
from docx.text.paragraph import Paragraph
from docx.text.run import Run

# --------------------------------------------------------------------------
# Image handling (package binary <-> data URI)
# --------------------------------------------------------------------------

_EMU_PER_PX = 9525  # EMU per CSS pixel at 96 dpi

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _data_uri(mime: str, content: bytes) -> str:
    """Encode image bytes as a self-contained ``data:`` URI for the editor."""
    b64 = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{b64}"


_DATA_URI_RE = re.compile(r"^data:([^;,\s]+)(;[^,]*)?,(.*)$", re.S)


def _decode_data_uri(src: str) -> tuple[str | None, bytes | None]:
    """Decode a ``data:`` URI into (mime, bytes).

    Returns (None, None) when the value is not an embeddable data URI (e.g.
    an http(s) src that a server-side converter cannot fetch).
    """
    if not src:
        return None, None
    m = _DATA_URI_RE.match(src)
    if not m:
        return None, None
    mime = (m.group(1) or "image/png").lower()
    meta = m.group(2) or ""
    payload = m.group(3)
    try:
        if "base64" in meta:
            content = base64.b64decode(payload, validate=True)
        else:
            from urllib.parse import unquote

            content = unquote(payload).encode("utf-8")
    except Exception:
        return None, None
    if not content:
        return None, None
    return mime, content


def _sniff_mime(data: bytes) -> str:
    """Detect an image media type from its magic bytes."""
    if data[:8] == _PNG_MAGIC:
        return "image/png"
    if data[:3] == b"GIF":
        return "image/gif"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:2] == b"BM":
        return "image/bmp"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:5] in (b"<?xml", b"<svg "):
        return "image/svg+xml"
    return "image/png"


_SOF_MARKERS = frozenset(
    {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
)


def _jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    """Read pixel dimensions out of a JPEG's SOF marker."""
    i = 2
    n = len(data)
    while i + 3 < n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in _SOF_MARKERS:
            if i + 9 <= n:
                return (
                    int.from_bytes(data[i + 7:i + 9], "big"),
                    int.from_bytes(data[i + 5:i + 7], "big"),
                )
            return None
        if marker == 0xFF or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seglen = int.from_bytes(data[i + 2:i + 4], "big")
        i += 2 + seglen
    return None


def _image_dimensions(mime: str, data: bytes) -> tuple[int, int] | None:
    """Best-effort intrinsic pixel size for common raster formats."""
    mime = (mime or "").lower()
    if mime == "image/png" and data[:8] == _PNG_MAGIC and len(data) >= 24:
        return (
            int.from_bytes(data[16:20], "big"),
            int.from_bytes(data[20:24], "big"),
        )
    if mime == "image/gif" and data[:6] in (b"GIF87a", b"GIF89a") and len(data) >= 10:
        return (
            int.from_bytes(data[6:8], "little"),
            int.from_bytes(data[8:10], "little"),
        )
    if mime == "image/jpeg" and data[:2] == b"\xff\xd8":
        return _jpeg_dimensions(data)
    if mime == "image/bmp" and data[:2] == b"BM" and len(data) >= 26:
        return (
            int.from_bytes(data[18:22], "little"),
            abs(int.from_bytes(data[22:26], "little")),
        )
    return None


def _parse_px(value) -> int | None:
    """Parse an integer pixel length from an HTML attribute (e.g. '120')."""
    if value is None:
        return None
    m = re.fullmatch(r"\s*(\d+)\s*(?:px)?\s*", value)
    return int(m.group(1)) if m else None


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
    text = _paragraph_inline(para)

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


def _paragraph_inline(para) -> str:
    """Inline HTML for a paragraph, emitting hyperlink runs as <a href>."""
    out = []
    for child in para._p.iterchildren():
        tag = child.tag
        if tag == qn("w:hyperlink"):
            href = _hyperlink_href(para, child)
            inner_runs = [Run(r, para) for r in child.findall(qn("w:r"))]
            inner = _runs_to_html(inner_runs)
            if href:
                out.append(f'<a href="{escape(href, quote=True)}">{inner}</a>')
            else:
                out.append(inner)
        elif tag == qn("w:r"):
            out.append(_run_to_html(Run(child, para)))
    return "".join(out)


def _hyperlink_href(para, elem) -> str:
    """Resolve a w:hyperlink element to its target URL (anchor or external)."""
    anchor = elem.get(qn("w:anchor"))
    if anchor:
        return "#" + anchor
    r_id = elem.get(qn("r:id"))
    if r_id:
        rel = para.part.rels.get(r_id)
        if rel is not None:
            return rel.target_ref
    return ""


def _heading_level(style: str) -> int:
    m = re.search(r"(\d+)", style)
    if not m:
        return 1
    return max(1, min(int(m.group(1)), 6))


def _runs_to_html(runs) -> str:
    out: list[str] = []
    for run in runs:
        out.append(_run_to_html(run))
    html = "".join(out)
    if not html:
        # paragraph with no runs (e.g. empty) still needs a newline
        return "<br/>"
    return html


def _run_to_html(run) -> str:
    """Inline HTML for one run, keeping picture positions intact.

    A ``<w:r>`` can interleave text children (``w:t``/``w:tab``/``w:br``/``w:cr``)
    with ``w:drawing`` children; each drawing becomes a self-contained
    ``<img>`` where it sits in the run.
    """
    chunks: list[str] = []
    buf: list[str] = []
    for child in run._r:
        if child.tag == qn("w:drawing"):
            img = _drawing_to_img(run, child)
            if img:
                if buf:
                    chunks.append(_wrap_run_text(escape("".join(buf)), run))
                    buf = []
                chunks.append(img)
        elif child.tag in (qn("w:t"), qn("w:tab"), qn("w:br"), qn("w:cr")):
            buf.append(_text_child_value(child))
    if buf:
        chunks.append(_wrap_run_text(escape("".join(buf)), run))
    return "".join(chunks)


def _text_child_value(child) -> str:
    """Text equivalent of one run child, mirroring ``Run.text`` semantics."""
    tag = child.tag
    if tag == qn("w:t"):
        return child.text or ""
    if tag == qn("w:tab"):
        return "\t"
    if tag == qn("w:cr"):
        return "\n"
    if tag == qn("w:br"):
        # Only line-break <w:br> counts as text; page/column breaks are
        # layout primitives the HTML fragment does not model.
        if (child.get(qn("w:type")) or "textWrapping") == "textWrapping":
            return "\n"
        return ""
    return ""


def _apply_run_color(run, token: dict) -> None:
    """Apply colour / highlight / super- / subscript tokens to a run."""
    color = token.get("color")
    if color:
        try:
            run.font.color.rgb = RGBColor.from_string(color.lstrip("#"))
        except Exception:
            pass
    bg = token.get("bg")
    if bg:
        try:
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"), bg.lstrip("#"))
            run._r.get_or_add_rPr().append(shd)
        except Exception:
            pass
    vert = token.get("vert")
    if vert == "sup":
        run.font.superscript = True
    elif vert == "sub":
        run.font.subscript = True


def _parse_inline_style(style: str) -> tuple[str | None, str | None]:
    """Return (color, background) hex values parsed from a CSS style string."""
    color = None
    bg = None
    for decl in (style or "").split(";"):
        decl = decl.strip()
        if ":" not in decl:
            continue
        prop, _, val = decl.partition(":")
        prop = prop.strip().lower()
        val = val.strip().lower()
        if prop == "color":
            color = _normalize_color(val)
        elif prop in ("background-color", "background"):
            bg = _normalize_color(val)
    return color, bg


def _normalize_color(val: str) -> str | None:
    """Normalise a CSS colour to lowercase #rrggbb, or None if unsupported."""
    val = (val or "").strip().lower()
    if val.startswith("#"):
        h = val[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6 and all(c in "0123456789abcdef" for c in h):
            return "#" + h
        return None
    if val.startswith("rgb("):
        nums = re.findall(r"\d+", val)
        if len(nums) >= 3:
            r, g, b = (int(x) & 0xFF for x in nums[:3])
            return f"#{r:02x}{g:02x}{b:02x}"
        return None
    return None


def _run_color_hex(run) -> str | None:
    """Return the run's RGB text colour as #rrggbb, or None."""
    try:
        cf = run.font.color
        if cf.type == MSO_COLOR_TYPE.RGB:
            return "#" + str(cf.rgb).lower()
    except Exception:
        return None
    return None


def _run_highlight_hex(run) -> str | None:
    """Return the run's highlight (w:shd fill) as #rrggbb, or None."""
    rPr = run._r.find(qn("w:rPr"))
    if rPr is None:
        return None
    shd = rPr.find(qn("w:shd"))
    if shd is None:
        return None
    fill = shd.get(qn("w:fill"))
    if fill:
        return "#" + fill.lower()
    return None

def _wrap_run_text(text: str, run) -> str:
    """Apply a run's character formatting around already-escaped text."""
    out = text
    if run.font.superscript:
        out = f"<sup>{out}</sup>"
    elif run.font.subscript:
        out = f"<sub>{out}</sub>"
    color = _run_color_hex(run)
    if color:
        out = f'<span style="color:{color}">{out}</span>'
    bg = _run_highlight_hex(run)
    if bg:
        out = f'<span style="background-color:{bg}">{out}</span>'
    if run.bold:
        out = f"<b>{out}</b>"
    if run.italic:
        out = f"<i>{out}</i>"
    if run.underline:
        out = f"<u>{out}</u>"
    return out


def _blip_bytes(run, embed: str) -> tuple[str | None, bytes | None]:
    """Resolve an ``r:embed`` relationship id to (mime, bytes).

    DOCX images live in ``word/media/``; the relationship maps the rId used
    by the drawing's ``a:blip`` to that part. Best-effort: a missing or
    external relationship yields (None, None) and the caller skips the
    drawing, so surrounding text still converts.
    """
    rels = getattr(run.part, "rels", None)
    if rels is None:
        return None, None
    rel = rels.get(embed)
    if rel is None:
        return None, None
    try:
        blob = rel.target_part.blob
    except Exception:
        return None, None
    if not blob:
        return None, None
    mime = getattr(rel.target_part, "content_type", None) or _sniff_mime(blob)
    return mime, blob


def _drawing_extent_px(drawing) -> tuple[int | None, int | None]:
    """Read the ``wp:extent`` of a drawing as (width_px, height_px).

    Extent is stored in EMU; we divide by the same 96-dpi EMU-per-pixel
    constant used when writing, so the round-trip is a fixed point.
    """
    for ext in drawing.iter(qn("wp:extent")):
        try:
            cx = int(ext.get("cx") or 0)
            cy = int(ext.get("cy") or 0)
        except ValueError:
            return None, None
        if cx <= 0 or cy <= 0:
            return None, None
        return cx // _EMU_PER_PX, cy // _EMU_PER_PX
    return None, None


def _drawing_alt(drawing) -> str:
    """Accessible description of a drawing (``wp:docPr`` ``descr``).

    Falls back to a non-default ``name`` for producers that store the alt
    text there, but never to python-docx/Word's auto-generated
    ``Picture N`` placeholder.
    """
    for docPr in drawing.iter(qn("wp:docPr")):
        descr = (docPr.get("descr") or "").strip()
        if descr:
            return descr
        name = (docPr.get("name") or "").strip()
        if name and not re.fullmatch(r"Picture \d+", name):
            return name
        return ""
    return ""


def _drawing_to_img(run, drawing) -> str:
    """Render a ``<w:drawing>`` as a self-contained ``<img>``.

    Returns ``''`` when the drawing holds no embeddable picture (charts,
    shapes, OLE objects, external links), so surrounding text still
    converts. Dimension attributes come from the drawing extent and alt
    text from ``wp:docPr``/``descr``.
    """
    for blip in drawing.iter(qn("a:blip")):
        embed = blip.get(qn("r:embed"))
        if not embed:
            continue
        mime, content = _blip_bytes(run, embed)
        if content is None:
            continue
        width, height = _drawing_extent_px(drawing)
        attrs = [f' src="{_data_uri(mime or "image/png", content)}"']
        if width:
            attrs.append(f' width="{width}"')
        if height:
            attrs.append(f' height="{height}"')
        alt = _drawing_alt(drawing)
        if alt:
            attrs.append(f' alt="{escape(alt)}"')
        return "<img" + "".join(attrs) + "/>"
    return ""


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
            cells.append(_cell_to_html(e, rowspan, tag, table))
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


def _cell_to_html(e, rowspan: int, tag: str, table) -> str:
    """Render one grid entry as <td|th> HTML, keeping inline formatting."""
    attrs = ""
    if e["width"] > 1:
        attrs += f' colspan="{e["width"]}"'
    if rowspan > 1:
        attrs += f' rowspan="{rowspan}"'
    # Parent paragraphs with a real _Cell so Run.part resolves to the
    # document part (needed to look up drawing image relationships).
    cell = _Cell(e["tc"], table)
    paras: list[str] = []
    for p_el in e["tc"].p_lst:
        paras.append(_runs_to_html(Paragraph(p_el, cell).runs))
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
    """Parse an inline HTML fragment into text and image tokens.

    Text tokens are dicts with ``type: "text"`` plus ``text``/``bold``/
    ``italic``/``underline``; image tokens have ``type: "image"`` plus
    ``src``/``alt``/``width``/``height``.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[dict] = []
        self._bold = 0
        self._italic = 0
        self._underline = 0
        self._link_href = None  # href of the <a> currently being parsed (or None)
        self._color = None      # current text colour (e.g. "#ff0000") or None
        self._bg = None         # current highlight (background) colour or None
        self._vert = None       # "sup"/"sub" or None
        self._span_stack = []   # (prev_color, prev_bg) saved on <span> open
        self._vert_stack = []   # prev vert saved on <sup>/<sub> open
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "img":
            self._flush()
            a = dict(attrs)
            self.tokens.append({
                "type": "image",
                "src": a.get("src", ""),
                "alt": a.get("alt", ""),
                "width": _parse_px(a.get("width")),
                "height": _parse_px(a.get("height")),
            })
        elif tag in ("b", "strong"):
            self._flush()
            self._bold += 1
        elif tag in ("i", "em"):
            self._flush()
            self._italic += 1
        elif tag == "u":
            self._flush()
            self._underline += 1
        elif tag == "a":
            a = dict(attrs)
            href = a.get("href", "")
            # Only carry safe schemes; javascript:/vbscript: etc. are dropped
            # (the editor sanitizer would strip them anyway).
            if href.startswith("#") or not re.search(r"^[a-z]+:", href, re.I):
                self._link_href = href or None
            elif href.startswith(("https://", "http://", "mailto:", "tel:", "/", "./", "../")):
                self._link_href = href
            else:
                self._link_href = None
        elif tag == "span":
            self._flush()
            a = dict(attrs)
            color, bg = _parse_inline_style(a.get("style", ""))
            self._span_stack.append((self._color, self._bg))
            if color is not None:
                self._color = color
            if bg is not None:
                self._bg = bg
        elif tag == "sup":
            self._flush()
            self._vert_stack.append(self._vert)
            self._vert = "sup"
        elif tag == "sub":
            self._flush()
            self._vert_stack.append(self._vert)
            self._vert = "sub"
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
        elif tag == "a":
            self._flush()  # emits a link token (if href set) then clears context
            self._link_href = None
        elif tag == "span":
            self._flush()
            if self._span_stack:
                self._color, self._bg = self._span_stack.pop()
        elif tag == "sup":
            self._flush()
            if self._vert_stack:
                self._vert = self._vert_stack.pop()
        elif tag == "sub":
            self._flush()
            if self._vert_stack:
                self._vert = self._vert_stack.pop()
        else:
            self._flush()

    def handle_data(self, data: str) -> None:
        self._buf.append(data)

    def _flush(self) -> None:
        text = "".join(self._buf)
        if text:
            token = {
                "type": "text",
                "text": text,
                "bold": self._bold > 0,
                "italic": self._italic > 0,
                "underline": self._underline > 0,
            }
            if self._link_href:
                token["type"] = "link"
                token["href"] = self._link_href
            if self._color:
                token["color"] = self._color
            if self._bg:
                token["bg"] = self._bg
            if self._vert:
                token["vert"] = self._vert
            self.tokens.append(token)
        self._buf = []


def _inline_tokens(html: str) -> list[dict]:
    builder = _InlineRunBuilder()
    builder.feed(html)
    builder._flush()
    return builder.tokens


def _add_styled_runs(paragraph, html: str) -> None:
    """Add runs parsed from an inline HTML fragment to a paragraph.

    Image tokens are embedded as inline pictures (``data:`` URIs only);
    http(s)/relative src values are skipped server-side.
    """
    for token in _inline_tokens(html):
        if token["type"] == "image":
            _add_image_run(paragraph, token)
            continue
        if token["type"] == "link":
            _add_hyperlink(paragraph, token)
            continue
        run = paragraph.add_run(token["text"])
        if token["bold"]:
            run.bold = True
        if token["italic"]:
            run.italic = True
        if token["underline"]:
            run.underline = True
        _apply_run_color(run, token)


def _add_hyperlink(paragraph, token: dict) -> None:
    """Append a hyperlink run (w:hyperlink + external relationship)."""
    url = token.get("href", "")
    part = paragraph.part
    try:
        # Generate a free rId for the external hyperlink relationship.
        used = set(part.rels.keys())
        i = 1
        while f"rId{i}" in used:
            i += 1
        r_id = f"rId{i}"
        part.rels.add_relationship(
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
            url,
            r_id,
            True,
        )
    except Exception as exc:  # malformed URL must not crash conversion
        logging.getLogger(__name__).warning("skipping un-embeddable hyperlink: %s", exc)
        run = paragraph.add_run(token["text"])
        if token.get("bold"):
            run.bold = True
        if token.get("italic"):
            run.italic = True
        if token.get("underline"):
            run.underline = True
        return
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), r_id)
    run = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    if token.get("bold"):
        rPr.append(OxmlElement("w:b"))
    if token.get("italic"):
        rPr.append(OxmlElement("w:i"))
    if token.get("underline"):
        rPr.append(OxmlElement("w:u"))
    run.append(rPr)
    t = OxmlElement("w:t")
    t.text = token["text"]
    run.append(t)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)



def _add_image_run(paragraph, token: dict) -> None:
    """Embed a data-URI ``<img>`` into the paragraph as an inline picture.

    Only ``data:`` URIs are embeddable server-side; http(s)/relative src
    values are skipped (no network fetching in a converter). Explicit
    width/height attributes become the drawing extent (px -> EMU); missing
    ones fall back to the image's intrinsic pixel size. The alt text is
    stored on the drawing's ``wp:docPr`` ``descr`` attribute so it
    round-trips back out.
    """
    mime, content = _decode_data_uri(token.get("src") or "")
    if content is None:
        return
    width = token.get("width")
    height = token.get("height")
    if not width or not height:
        dims = _image_dimensions(mime, content)
        if dims:
            width = width or dims[0]
            height = height or dims[1]
    kwargs: dict = {}
    if width and height:
        kwargs["width"] = Emu(width * _EMU_PER_PX)
        kwargs["height"] = Emu(height * _EMU_PER_PX)
    try:
        run = paragraph.add_run()
        run.add_picture(io.BytesIO(content), **kwargs)
    except Exception as exc:  # corrupt/unsupported image bytes must not crash conversion
        logging.getLogger(__name__).warning("skipping un-embeddable image: %s", exc)
        return
    alt = (token.get("alt") or "").strip()
    if alt:
        _set_drawing_alt(run._r, alt)


def _set_drawing_alt(r, alt: str) -> None:
    """Record alt text on the ``wp:docPr`` of the run's picture."""
    drawing = r.find(qn("w:drawing"))
    if drawing is None:
        return
    for docPr in drawing.iter(qn("wp:docPr")):
        docPr.set("descr", alt)
        break


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


