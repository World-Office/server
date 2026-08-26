"""ODT <-> HTML conversion using odfpy.

Stoic goals (same as the DOCX converter): preserve text,
bold/italic/underline, headings, lists, tables, and images. We do NOT
attempt pagination or print-fidelity — the editor is a web page, not a
print preview.

HTML -> ODT is lossy by nature (web HTML is richer than we map); we map
only the subset our editor produces, plus whatever reasonable tags appear.

Images survive as self-contained data URIs on the HTML side and as
``draw:frame``/``draw:image`` (package-embedded binary) on the ODT side.
The ``alt`` text of an ``<img>`` is preserved as the ODF-standard
``svg:title`` child of the ``draw:frame`` (accessible name) and comes
back as an ``alt`` attribute on the re-exported ``<img>``.
"""

from __future__ import annotations

import base64
import io
import mimetypes
import re
import zipfile
from html import escape
from html.parser import HTMLParser

from odf.draw import Frame, Image
from odf.element import Element, Node
from odf.namespaces import (
    DRAWNS,
    OFFICENS,
    STYLENS,
    SVGNS,
    TABLENS,
    TEXTNS,
    XLINKNS,
)
from odf.opendocument import OpenDocumentText, load
from odf.style import ParagraphProperties, Style, TextProperties
from odf.table import CoveredTableCell, Table, TableCell, TableRow
from odf.text import (
    H,
    List,
    ListItem,
    ListLevelStyleNumber,
    ListStyle,
    P,
    Span,
)

from src.editor.converter import _MONO_FONTS, _normalize_color, _parse_inline_style

_BOLD_WEIGHTS = {"bold", "bolder", "600", "700", "800", "900"}
_ITALIC_STYLES = {"italic", "oblique"}
_UNDERLINE_STYLES = {"solid", "dotted", "dash", "long-dash", "dot-dash",
                     "dot-dot-dash", "wave", "double"}
# Anything that is not "none" (or unset) counts as underline, but keeping
# an explicit set documents the intent and guards against typos.


# --------------------------------------------------------------------------
# Style resolution
# --------------------------------------------------------------------------

def _style_text_props(el):
    """Collect the character-effect properties of one style element."""
    for child in el.childNodes:
        if child.qname == (STYLENS, "text-properties"):
            return {
                "fontweight": child.getAttribute("fontweight"),
                "fontstyle": child.getAttribute("fontstyle"),
                "textunderlinestyle": child.getAttribute("textunderlinestyle"),
                "textlinethroughstyle": child.getAttribute("textlinethroughstyle"),
                "color": child.getAttribute("color"),
                "backgroundcolor": child.getAttribute("backgroundcolor"),
                "fontfamily": child.getAttribute("fontfamily"),
                "fontsize": child.getAttribute("fontsize"),
                "fontvariant": child.getAttribute("fontvariant"),
                "texttransform": child.getAttribute("texttransform"),
                "textposition": child.getAttribute("textposition"),
            }
    return {}


def _none_flags() -> dict:
    return {
        "bold": None, "italic": None, "underline": None, "strike": None,
        "color": None, "bg": None, "font_family": None, "font_size": None,
        "vert": None, "small_caps": None, "all_caps": None,
    }


def _build_style_resolver(doc):
    """Return a resolver mapping a style name to effective character flags.

    The resolver walks the parent-style chain and returns a dict with
    keys ``bold`` / ``italic`` / ``underline`` whose values are
    ``True``, ``False`` or ``None`` (unspecified — inherit from the
    enclosing context). Property-level inheritance is preserved: a child
    style only overrides the properties it actually declares.
    """
    raw: dict[str, tuple[dict, str]] = {}
    for root in (doc.styles, doc.automaticstyles):
        for el in root.childNodes:
            if el.qname == (STYLENS, "style") and el.getAttribute("family") == "text":
                name = el.getAttribute("name")
                if name:
                    raw[name] = (_style_text_props(el), el.getAttribute("parentstylename"))

    cache: dict[str, dict] = {}

    def resolve(name: str | None) -> dict:
        if not name:
            return _none_flags()
        if name in cache:
            return cache[name]
        if name not in raw:
            return _none_flags()
        props, parent = raw[name]
        out = dict(resolve(parent))
        weight = props.get("fontweight")
        if weight in _BOLD_WEIGHTS:
            out["bold"] = True
        elif weight in ("normal", "lighter", "100", "200", "300", "400", "500"):
            out["bold"] = False
        fstyle = props.get("fontstyle")
        if fstyle in _ITALIC_STYLES:
            out["italic"] = True
        elif fstyle == "normal":
            out["italic"] = False
        under = props.get("textunderlinestyle")
        if under in _UNDERLINE_STYLES:
            out["underline"] = True
        elif under == "none":
            out["underline"] = False
        linethrough = props.get("textlinethroughstyle")
        if linethrough and linethrough != "none":
            out["strike"] = True
        elif linethrough == "none":
            out["strike"] = False
        color = props.get("color")
        if color:
            out["color"] = _normalize_color(color)
        bg = props.get("backgroundcolor")
        if bg:
            out["bg"] = _normalize_color(bg)
        family = props.get("fontfamily")
        if family is not None:
            out["font_family"] = family
        size = props.get("fontsize")
        if size is not None:
            out["font_size"] = size.lower()
        variant = props.get("fontvariant")
        if variant in ("small-caps", "smallcaps"):
            out["small_caps"] = True
        elif variant in ("normal", "none"):
            out["small_caps"] = False
        ttransform = props.get("texttransform")
        if ttransform == "uppercase":
            out["all_caps"] = True
        elif ttransform in ("none", "lowercase"):
            out["all_caps"] = False
        valign = props.get("textposition")
        if valign in ("super", "superscript"):
            out["vert"] = "sup"
        elif valign in ("sub", "subscript"):
            out["vert"] = "sub"
        elif valign == "auto":
            out["vert"] = None
        cache[name] = out
        return out

    return resolve


def _list_kinds(doc) -> dict[str, str]:
    """Map list-style names to 'ul' or 'ol' based on their first level."""
    kinds: dict[str, str] = {}
    for root in (doc.styles, doc.automaticstyles):
        for el in root.childNodes:
            if el.qname == (TEXTNS, "list-style"):
                name = el.getAttribute("name")
                if not name:
                    continue
                for child in el.childNodes:
                    if child.qname == (TEXTNS, "list-level-style-bullet"):
                        kinds[name] = "ul"
                        break
                    if child.qname == (TEXTNS, "list-level-style-number"):
                        kinds[name] = "ol"
                        break
    return kinds


# --------------------------------------------------------------------------
# Image handling (draw:frame / draw:image <-> <img>)
# --------------------------------------------------------------------------


def _get_attr(el, ns: str, name: str) -> str | None:
    """Read a namespaced attribute from a loaded ODF element."""
    return dict(el.attributes).get((ns, name))


def _picture_mime(name: str) -> str:
    """Best-effort media type for a Pictures/ member from its extension."""
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


def _extract_pictures(data: bytes) -> dict[str, tuple[str, bytes]]:
    """Map every ``Pictures/`` member of the ODT package to (mime, bytes).

    ODF stores referenced images under ``Pictures/``; ``draw:image``
    xlink:hrefs point at those paths. Best-effort: on any zip problem we
    simply get no pictures and the text still converts.
    """
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except Exception:
        return {}
    pictures: dict[str, tuple[str, bytes]] = {}
    for name in z.namelist():
        if name.startswith("Pictures/"):
            pictures[name] = (_picture_mime(name), z.read(name))
    return pictures


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
    if data[:8] == b"\x89PNG\r\n\x1a\n":
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


_SOF_MARKERS = frozenset({0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF})


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
                return (int.from_bytes(data[i + 7:i + 9], "big"),
                        int.from_bytes(data[i + 5:i + 7], "big"))
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
    if mime == "image/png" and data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        return (int.from_bytes(data[16:20], "big"),
                int.from_bytes(data[20:24], "big"))
    if mime == "image/gif" and data[:6] in (b"GIF87a", b"GIF89a") and len(data) >= 10:
        return (int.from_bytes(data[6:8], "little"),
                int.from_bytes(data[8:10], "little"))
    if mime == "image/jpeg" and data[:2] == b"\xff\xd8":
        return _jpeg_dimensions(data)
    if mime == "image/bmp" and data[:2] == b"BM" and len(data) >= 26:
        w = int.from_bytes(data[18:22], "little")
        h = int.from_bytes(data[22:26], "little")
        return (w, abs(h))
    return None


def _frame_alt(frame_el) -> str:
    """Accessible name (svg:title child) of a draw:frame, if any."""
    for child in frame_el.childNodes:
        if child.nodeType == Node.ELEMENT_NODE and child.qname == (SVGNS, "title"):
            return "".join(n.data for n in child.childNodes if n.nodeType == Node.TEXT_NODE)
    return ""


def _frame_to_html(frame_el, pictures: dict) -> str:
    """Render a draw:frame (holding a draw:image) as an <img> data URI.

    Handles both package-referenced images (xlink:href into ``Pictures/``)
    and ``office:binary-data`` embedded directly in content.xml. The
    frame's ``svg:title`` (if any) is emitted back as the ``alt``
    attribute.
    """
    alt = _frame_alt(frame_el)
    for child in frame_el.childNodes:
        if child.nodeType != Node.ELEMENT_NODE or child.qname != (DRAWNS, "image"):
            continue
        mime, content = None, None
        href = _get_attr(child, XLINKNS, "href")
        if href:
            key = href[2:] if href.startswith("./") else href
            key = key.lstrip("/")
            entry = pictures.get(href) or pictures.get(key)
            if entry:
                mime, content = entry
        if content is None:
            for sub in child.childNodes:
                if sub.nodeType == Node.ELEMENT_NODE and sub.qname == (OFFICENS, "binary-data"):
                    raw = "".join(n.data for n in sub.childNodes
                                   if n.nodeType == Node.TEXT_NODE)
                    try:
                        content = base64.b64decode(raw)
                        mime = _sniff_mime(content)
                    except Exception:
                        content = None
                    break
        if content:
            attrs = []
            for key in ("width", "height"):
                val = _get_attr(frame_el, SVGNS, key)
                m = re.fullmatch(r"\s*(\d+)\s*px\s*", val or "")
                if m:
                    attrs.append(f' {key}="{m.group(1)}"')
            if alt:
                attrs.append(f' alt="{escape(alt)}"')
            return f'<img src="{_data_uri(mime or "image/png", content)}"' + "".join(attrs) + "/>"
    return ""


def _parse_px(value) -> int | None:
    """Parse an integer pixel length from an HTML attribute (e.g. '120')."""
    if value is None:
        return None
    m = re.fullmatch(r"\s*(\d+)\s*(?:px)?\s*", value)
    return int(m.group(1)) if m else None


def odt_to_html(data: bytes) -> str:
    """Convert ODT bytes to an HTML fragment (content only, no <html>)."""
    doc = load(io.BytesIO(data))
    resolve = _build_style_resolver(doc)
    kinds = _list_kinds(doc)
    pictures = _extract_pictures(data)

    parts: list[str] = []
    pending_list: str | None = None  # 'ul' | 'ol' while collecting <li>s

    def flush_list() -> None:
        nonlocal pending_list
        if pending_list:
            parts.append(f"</{pending_list}>")
            pending_list = None

    for child in doc.text.childNodes:
        if child.nodeType != Node.ELEMENT_NODE:
            continue
        qname = child.qname
        if qname in ((TEXTNS, "p"), (TEXTNS, "h")):
            flush_list()
            parts.append(_paragraph_to_html(child, resolve, pictures))
        elif qname == (TEXTNS, "list"):
            kind = kinds.get(child.getAttribute("stylename"), "ul")
            if pending_list != kind:
                flush_list()
                pending_list = kind
                parts.append(f"<{kind}>")
            for item in _list_items_to_html(child, resolve, kinds, pictures):
                parts.append(item)
        elif qname == (TABLENS, "table"):
            flush_list()
            parts.append(_table_to_html(child, resolve, pictures))
        elif qname == (DRAWNS, "frame"):
            # A draw:frame sitting directly in the body (not nested in a
            # text:p) is still a block-level image.
            flush_list()
            frame_html = _frame_to_html(child, pictures)
            if frame_html:
                parts.append(f"<p>{frame_html}</p>")

    flush_list()
    return "\n".join(p for p in parts if p)


def _paragraph_to_html(el, resolve, pictures) -> str:
    """Render a text:p or text:h element as a block-level HTML tag."""
    inner = _paragraph_inner_html(el, resolve, pictures)
    if el.qname == (TEXTNS, "h"):
        try:
            level = max(1, min(int(el.getAttribute("outlinelevel") or 1), 6))
        except ValueError:
            level = 1
        return f"<h{level}>{inner}</h{level}>"
    return f"<p>{inner}</p>"


def _paragraph_inner_html(el, resolve, pictures) -> str:
    """Render paragraph/heading inline content (no <p>/<h> wrapper)."""
    style = resolve(el.getAttribute("stylename"))
    return _inline_html(el, resolve, style, pictures)


def _inline_html(el, resolve, base, pictures) -> str:
    """Render the inline (run-level) content of an element to HTML.

    ``base`` is the effective character-flag dict inherited from the
    paragraph style; character styles on <span> override per property.
    ``pictures`` maps ODT package paths to (mime, bytes) for draw:image
    lookups.
    """
    out: list[str] = []
    for child in el.childNodes:
        if child.nodeType == Node.TEXT_NODE:
            out.append(_wrap(escape(child.data), base))
        elif child.nodeType == Node.ELEMENT_NODE:
            qname = child.qname
            if qname == (TEXTNS, "s"):  # repeated space
                try:
                    count = max(1, int(child.getAttribute("c") or 1))
                except ValueError:
                    count = 1
                out.append("&nbsp;" * count)
            elif qname == (TEXTNS, "tab"):
                out.append("&emsp;")
            elif qname == (TEXTNS, "line-break"):
                out.append("<br/>")
            elif qname == (TEXTNS, "span"):
                flags = dict(base)
                span_flags = resolve(child.getAttribute("stylename"))
                for key in ("bold", "italic", "underline", "strike", "vert",
                            "small_caps", "all_caps", "color", "bg",
                            "font_family", "font_size"):
                    if span_flags[key] is not None:
                        flags[key] = span_flags[key]
                out.append(_inline_html(child, resolve, flags, pictures))
            elif qname == (TEXTNS, "a"):
                href = child.getAttribute("href")
                inner = _inline_html(child, resolve, base, pictures)
                if href:
                    inner = f'<a href="{escape(href)}">{inner}</a>'
                out.append(inner)
            elif qname == (DRAWNS, "frame"):
                out.append(_frame_to_html(child, pictures))
            else:
                # Unknown inline node (footnote body, drawing text-box…):
                # descend so its text is not silently dropped.
                out.append(_inline_html(child, resolve, base, pictures))
    return "".join(out)


def _wrap(text: str, flags: dict) -> str:
    """Apply character formatting flags around already-escaped text.

    Mirrors the DOCX converter's ``_wrap_run_text`` so both formats emit
    the same HTML contract: ``<sup>/<sub>/<strike>/<code>`` + one
    ``<span style=...>`` holding font-family/size, small-caps, all-caps,
    colour and highlight.
    """
    if flags.get("vert") == "sup":
        text = f"<sup>{text}</sup>"
    elif flags.get("vert") == "sub":
        text = f"<sub>{text}</sub>"
    if flags.get("strike"):
        text = f"<strike>{text}</strike>"
    fam = flags.get("font_family")
    if fam and fam.lower().strip() in _MONO_FONTS:
        text = f"<code>{text}</code>"
    styles: list[str] = []
    if fam and fam.lower().strip() not in _MONO_FONTS:
        styles.append(f"font-family:{fam}")
    if flags.get("font_size"):
        styles.append(f"font-size:{flags['font_size']}")
    if flags.get("small_caps"):
        styles.append("font-variant:small-caps")
    if flags.get("all_caps"):
        styles.append("text-transform:uppercase")
    if flags.get("color"):
        styles.append(f"color:{flags['color']}")
    if flags.get("bg"):
        styles.append(f"background-color:{flags['bg']}")
    if styles:
        text = f'<span style="{"; ".join(styles)}">{text}</span>'
    for key, tag in (("bold", "b"), ("italic", "i"), ("underline", "u")):
        if flags.get(key):
            text = f"<{tag}>{text}</{tag}>"
    return text


def _list_items_to_html(list_el, resolve, kinds, pictures) -> list[str]:
    items: list[str] = []
    for child in list_el.childNodes:
        if child.qname == (TEXTNS, "list-item"):
            body: list[str] = []
            for c in child.childNodes:
                if c.nodeType != Node.ELEMENT_NODE:
                    continue
                if c.qname == (TEXTNS, "p"):
                    body.append(_paragraph_inner_html(c, resolve, pictures))
                elif c.qname == (TEXTNS, "h"):
                    body.append(_paragraph_inner_html(c, resolve, pictures))
                elif c.qname == (TEXTNS, "list"):
                    # nested list: its own <ul>/<ol> inside this <li>
                    nested = odt_list_to_html(c, resolve, kinds, pictures)
                    body.append(nested)
            items.append("<li>" + "".join(body) + "</li>")
    return items


def _int_attr(el, name: str) -> int | None:
    """Read an integer attribute by its odfpy camelCase name.

    ``number-columns-spanned`` etc. are read as ``numbercolumnsspanned``.
    Returns None when absent or not parseable as an integer.
    """
    val = el.getAttribute(name)
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _table_rows(table_el):
    """Yield the ``table:table-row`` elements of a table.

    LibreOffice wraps header rows in ``table:table-header-rows`` and may use
    ``table:table-rows`` group elements; those wrappers are descended into so
    every real row is visited exactly once.
    """
    for child in table_el.childNodes:
        if child.nodeType != Node.ELEMENT_NODE:
            continue
        qname = child.qname
        if qname == (TABLENS, "table-row"):
            yield child
        elif qname in ((TABLENS, "table-header-rows"), (TABLENS, "table-rows")):
            yield from _table_rows(child)


def _cell_to_html(cell, resolve, pictures) -> str:
    """Render one table cell as a ``<td>`` (``''`` for covered cells).

    A ``covered-table-cell`` is the ODF placeholder for a slot already taken by
    a colspan/rowspan on an earlier cell, so it renders as nothing — the span
    attribute of the covering cell accounts for that column.

    ``table:number-columns-spanned`` / ``table:number-rows-spanned`` become
    ``colspan`` / ``rowspan`` attributes so merges survive into the editor.
    Nested tables inside a cell render as a nested ``<table>``.
    """
    if cell.qname == (TABLENS, "covered-table-cell"):
        return ""
    chunks: list[str] = []
    pending: list[str] = []

    def flush() -> None:
        if pending:
            chunks.append("<br/>".join(pending))
            pending.clear()

    for c in cell.childNodes:
        if c.nodeType != Node.ELEMENT_NODE:
            continue
        if c.qname == (TEXTNS, "p"):
            pending.append(_paragraph_to_html(c, resolve, pictures))
        elif c.qname == (TABLENS, "table"):
            flush()
            chunks.append(_table_to_html(c, resolve, pictures))
    flush()
    attrs = []
    colspan = _int_attr(cell, "numbercolumnsspanned") or 1
    rowspan = _int_attr(cell, "numberrowsspanned") or 1
    if colspan > 1:
        attrs.append(f'colspan="{colspan}"')
    if rowspan > 1:
        attrs.append(f'rowspan="{rowspan}"')
    open_tag = "<td " + " ".join(attrs) + ">" if attrs else "<td>"
    return open_tag + "".join(chunks) + "</td>"


def _table_to_html(table_el, resolve, pictures) -> str:
    rows: list[str] = []
    for row in _table_rows(table_el):
        cells: list[str] = []
        for cell in row.childNodes:
            if cell.nodeType != Node.ELEMENT_NODE:
                continue
            if cell.qname not in ((TABLENS, "table-cell"),
                                  (TABLENS, "covered-table-cell")):
                continue
            cell_html = _cell_to_html(cell, resolve, pictures)
            if not cell_html:
                continue  # covered cell: slot taken by a span
            repeat = _int_attr(cell, "numbercolumnsrepeated") or 1
            if repeat > 1:
                cells.extend([cell_html] * repeat)
            else:
                cells.append(cell_html)
        # A row whose cells are all covered-table-cell placeholders (fully
        # consumed by a rowspan from above) still renders as an empty <tr> so
        # the grid keeps its row count.
        row_html = "<tr>" + "".join(cells) + "</tr>"
        n_repeat = _int_attr(row, "numberrowsrepeated") or 1
        rows.extend([row_html] * max(1, n_repeat))
    return "<table>" + "".join(rows) + "</table>"


def odt_list_to_html(list_el, resolve, kinds, pictures) -> str:
    """Render a (possibly nested) text:list element as a <ul>/<ol> block."""
    kind = kinds.get(list_el.getAttribute("stylename"), "ul")
    items = []
    for child in list_el.childNodes:
        if child.qname == (TEXTNS, "list-item"):
            body = []
            for c in child.childNodes:
                if c.nodeType != Node.ELEMENT_NODE:
                    continue
                if c.qname in ((TEXTNS, "p"), (TEXTNS, "h")):
                    body.append(_paragraph_inner_html(c, resolve, pictures))
                elif c.qname == (TEXTNS, "list"):
                    body.append(odt_list_to_html(c, resolve, kinds, pictures))
            items.append("<li>" + "".join(body) + "</li>")
    return f"<{kind}>" + "".join(items) + f"</{kind}>"


# --------------------------------------------------------------------------
# HTML -> ODT
# --------------------------------------------------------------------------

_TAG_TABLE = re.compile(r"<table[^>]*>.*?</table>", re.S)


def html_to_odt(html_fragment: str) -> bytes:
    """Convert an HTML fragment into ODT bytes."""
    # Tables split out the same way the DOCX converter does it: python-odf
    # tables and paragraphs share the body, but interleaving complicates
    # the body, so tables are appended at the end.
    tables_html = _TAG_TABLE.findall(html_fragment)
    body = _TAG_TABLE.sub("", html_fragment)

    doc = OpenDocumentText()
    w = _OdtWriter(doc)

    block_re = re.compile(r"<(p|h[1-6]|ul|ol)[^>]*>(.*?)</\1>", re.S)
    blocks = list(block_re.finditer(body))
    for m in blocks:
        tag, inner = m.group(1), m.group(2)
        if tag == "ul":
            w.add_list(inner, ordered=False)
            continue
        if tag == "ol":
            w.add_list(inner, ordered=True)
            continue
        if tag.startswith("h"):
            w.add_paragraph(inner, level=int(tag[1]),
                            align=_alignment(m.group(0)))
            continue
        w.add_paragraph(inner, level=0, align=_alignment(m.group(0)))

    # Tag-less input (raw text typed into an empty contenteditable).
    if not blocks and body.strip():
        w.add_paragraph(body, level=0, align=None)

    for tbl_html in tables_html:
        w.add_table(tbl_html)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _alignment(open_tag_and_attrs: str) -> str | None:
    if "text-align:center" in open_tag_and_attrs:
        return "center"
    if "text-align:right" in open_tag_and_attrs:
        return "right"
    return None


class _OdtWriter:
    """Accumulates HTML blocks into an OpenDocumentText with shared styles."""

    def __init__(self, doc: OpenDocumentText) -> None:
        self.doc = doc
        self._char_styles: dict[tuple[bool, bool, bool], str] = {}
        self._para_styles: dict[str, str] = {}
        self._ol_style: str | None = None
        self._img_n = 0

    # -- character styles -------------------------------------------------
    def char_style(self, token: dict) -> str | None:
        """Return (creating if needed) an ODF character style for a token.

        The style is keyed by the full formatting tuple (bold/italic/
        underline/strike/vert/caps/colour/background/font), so identical
        formatting reuses one style element — the same dedup the old
        b/i/u-only version did, just with more dimensions.
        """
        fam = token.get("font_family")
        if token.get("code"):
            fam = "Consolas"
        key = (
            bool(token.get("bold")), bool(token.get("italic")), bool(token.get("underline")),
            bool(token.get("strike")), bool(token.get("small_caps")), bool(token.get("all_caps")),
            token.get("vert"), token.get("color"), token.get("bg"), fam, token.get("font_size"),
        )
        if key in self._char_styles:
            return self._char_styles[key]
        has_any = any((
            key[0], key[1], key[2], key[3], key[4], key[5], key[6], key[7],
            key[8], key[9], key[10],
        ))
        if not has_any:
            return None
        # Preserve the historic WO_{b}{i}{u} name (1=on/0=off) for the
        # b/i/u-only styles so pre-existing consumers/tests keep working;
        # extended formatting gets a numeric suffix.
        base = f"WO_{int(bool(token.get('bold')))}{int(bool(token.get('italic')))}{int(bool(token.get('underline')))}"
        extended = any((key[3], key[4], key[5], key[6], key[7], key[8], key[9], key[10]))
        name = f"{base}_{len(self._char_styles)}" if extended else base
        props: list[tuple[str, str]] = []
        if token.get("bold"):
            props.append(("fontweight", "bold"))
        if token.get("italic"):
            props.append(("fontstyle", "italic"))
        if token.get("underline"):
            props.append(("textunderlinestyle", "solid"))
        if token.get("strike"):
            props.append(("textlinethroughstyle", "solid"))
        if token.get("small_caps"):
            props.append(("fontvariant", "small-caps"))
        if token.get("all_caps"):
            props.append(("texttransform", "uppercase"))
        vert = token.get("vert")
        if vert == "sup":
            props.append(("textposition", "super"))
        elif vert == "sub":
            props.append(("textposition", "sub"))
        if token.get("color"):
            props.append(("color", token["color"]))
        if token.get("bg"):
            props.append(("backgroundcolor", token["bg"]))
        if fam:
            props.append(("fontfamily", fam))
        if token.get("font_size"):
            props.append(("fontsize", token["font_size"]))
        style = Style(name=name, family="text")
        style.addElement(TextProperties(**dict(props)))
        self.doc.automaticstyles.addElement(style)
        self._char_styles[key] = name
        return name

    def para_style(self, align: str | None) -> str | None:
        if not align:
            return None
        if align in self._para_styles:
            return self._para_styles[align]
        name = "WO_" + align.capitalize()
        style = Style(name=name, family="paragraph")
        style.addElement(ParagraphProperties(textalign=align))
        self.doc.automaticstyles.addElement(style)
        self._para_styles[align] = name
        return name

    def add_paragraph(self, html: str, level: int = 0, align: str | None = None) -> None:
        style_name = self.para_style(align)
        if level:
            el = H(outlinelevel=level)
            if style_name:
                el.setAttribute("stylename", style_name)
        else:
            el = P()
            if style_name:
                el.setAttribute("stylename", style_name)
        self._fill(el, html)
        self.doc.text.addElement(el)

    def _fill(self, el, html: str) -> None:
        """Add styled text runs and images parsed from an inline HTML fragment."""
        for token in _inline_tokens(html):
            if token["type"] == "image":
                self.add_image(el, token)
                continue
            text = token["text"]
            style_name = self.char_style(token)
            if style_name:
                el.addElement(Span(text=text, stylename=style_name))
            else:
                el.addText(text)

    def add_image(self, para_el, token: dict) -> None:
        """Embed a data-URI <img> as a draw:frame/draw:image in the paragraph.

        Only ``data:`` URIs are embeddable server-side; http(s)/relative
        src values are skipped (no network fetching in a converter).
        Dimensions come from the <img> attributes or the image's intrinsic
        pixel size when it can be sniffed.
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
        manifest = self.doc.addPictureFromString(content, mime)
        self._img_n += 1
        frame = Frame(name=f"WO_Picture_{self._img_n}", anchortype="as-char")
        if width:
            frame.setAttribute("width", f"{width}px")
        if height:
            frame.setAttribute("height", f"{height}px")
        # Accessible name / alt text lives in svg:title (ODF standard).
        alt = (token.get("alt") or "").strip()
        if alt:
            frame.addElement(Element(qname=(SVGNS, "title"), text=alt))
        frame.addElement(Image(href=manifest))
        para_el.addElement(frame)

    def add_list(self, html: str, ordered: bool) -> None:
        list_el = List()
        if ordered:
            if self._ol_style is None:
                self._ol_style = "WO_NumberedList"
                ls = ListStyle(name=self._ol_style)
                ls.addElement(ListLevelStyleNumber(level=1, numformat="1"))
                self.doc.automaticstyles.addElement(ls)
            list_el.setAttribute("stylename", self._ol_style)
        for li_html in re.findall(r"<li[^>]*>(.*?)</li>", html, re.S):
            item = ListItem()
            p = P()
            self._fill(p, li_html)
            item.addElement(p)
            list_el.addElement(item)
        self.doc.text.addElement(list_el)

    @staticmethod
    def _parse_row(html: str) -> list[dict]:
        """Split one HTML ``<tr>`` into its cells.

        Each entry carries the cell's inner html plus its colspan/rowspan
        (parsed from the opening tag, defaults to 1). Both ``<td>`` and
        ``<th>`` map to ODF table cells.
        """
        cells: list[dict] = []
        for m in re.finditer(r"<t[dh]([^>]*)>(.*?)</t[dh]>", html, re.S):
            attrs, body = m.group(1), m.group(2)
            cells.append({
                "html": body,
                "colspan": _span_attr(attrs, "colspan"),
                "rowspan": _span_attr(attrs, "rowspan"),
            })
        return cells

    def add_table(self, html: str) -> None:
        """Build an ODF ``<table:table>`` from an HTML ``<table>`` fragment.

        colspan/rowspan become ``table:number-columns-spanned`` /
        ``table:number-rows-spanned``; covered-table-cell placeholders are
        emitted so the grid stays rectangular (matching what LibreOffice
        expects). Rowspans leaving a hole in a later row fill that slot with
        a covered cell too.
        """
        row_htmls = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
        if not row_htmls:
            return
        rows = [self._parse_row(r) for r in row_htmls]
        ncols = 0
        for r in rows:
            ncols = max(ncols, sum(c["colspan"] for c in r))

        table = Table()
        vertical: dict[int, int] = {}  # col -> rows still covered from above
        for r in rows:
            row_el = TableRow()
            col = 0
            for cell in r:
                # Emit covered cells for slots still held by a rowspan above.
                while vertical.get(col, 0):
                    row_el.addElement(CoveredTableCell())
                    vertical[col] -= 1
                    if vertical[col] <= 0:
                        del vertical[col]
                    col += 1
                cel = TableCell()
                if cell["colspan"] > 1:
                    cel.setAttribute("numbercolumnsspanned", str(cell["colspan"]))
                if cell["rowspan"] > 1:
                    cel.setAttribute("numberrowsspanned", str(cell["rowspan"]))
                    for k in range(cell["colspan"]):
                        vertical[col + k] = cell["rowspan"] - 1
                p = P()
                self._fill(p, cell["html"])
                cel.addElement(p)
                row_el.addElement(cel)
                col += 1
                for _ in range(1, cell["colspan"]):
                    row_el.addElement(CoveredTableCell())
            table.addElement(row_el)
        self.doc.text.addElement(table)


def _span_attr(attrs: str, name: str) -> int:
    """Parse ``name="N"`` out of an HTML tag's attribute string (>= 1)."""
    m = re.search(name + r'=["\'](\d+)["\']', attrs)
    if not m:
        return 1
    try:
        return max(1, int(m.group(1)))
    except ValueError:
        return 1


# --------------------------------------------------------------------------
# Inline HTML -> runs (same semantics as the DOCX converter)
# --------------------------------------------------------------------------

class _InlineRunBuilder(HTMLParser):
    """Parse an inline HTML fragment into text tokens and image tokens.

    Text tokens are dicts with ``text`` / ``bold`` / ``italic`` /
    ``underline`` / ``strike`` / ``vert`` / ``color`` / ``bg`` /
    ``font_family`` / ``font_size`` / ``small_caps`` / ``all_caps`` /
    ``code`` keys; image tokens have ``type: "image"`` plus the
    ``src`` / ``alt`` / ``width`` / ``height`` attributes. Mirrors the
    DOCX converter's builder so both formats share the same HTML contract.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[dict] = []
        self._bold = 0
        self._italic = 0
        self._underline = 0
        self._strike = 0
        self._code = 0
        self._color = None
        self._bg = None
        self._vert = None
        self._font_family = None
        self._font_size = None
        self._small_caps = None
        self._all_caps = None
        self._span_stack: list[tuple] = []
        self._vert_stack: list[str | None] = []
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
        elif tag == "span":
            self._flush()
            a = dict(attrs)
            props = _parse_inline_style(a.get("style", ""))
            self._span_stack.append(
                (self._color, self._bg, self._font_family, self._font_size,
                 self._small_caps, self._all_caps)
            )
            if "color" in props:
                self._color = props["color"]
            if "bg" in props:
                self._bg = props["bg"]
            if "font_family" in props:
                self._font_family = props["font_family"]
            if "font_size" in props:
                self._font_size = props["font_size"]
            if props.get("small_caps"):
                self._small_caps = True
            if props.get("all_caps"):
                self._all_caps = True
        elif tag == "sup":
            self._flush()
            self._vert_stack.append(self._vert)
            self._vert = "sup"
        elif tag == "sub":
            self._flush()
            self._vert_stack.append(self._vert)
            self._vert = "sub"
        elif tag in ("strike", "s", "del"):
            self._flush()
            self._strike += 1
        elif tag == "code":
            self._flush()
            self._code += 1
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
        elif tag == "span":
            self._flush()
            if self._span_stack:
                (self._color, self._bg, self._font_family, self._font_size,
                 self._small_caps, self._all_caps) = self._span_stack.pop()
        elif tag == "sup":
            self._flush()
            if self._vert_stack:
                self._vert = self._vert_stack.pop()
        elif tag == "sub":
            self._flush()
            if self._vert_stack:
                self._vert = self._vert_stack.pop()
        elif tag in ("strike", "s", "del"):
            self._flush()
            self._strike = max(0, self._strike - 1)
        elif tag == "code":
            self._flush()
            self._code = max(0, self._code - 1)
        else:
            self._flush()

    def handle_data(self, data: str) -> None:
        self._buf.append(data)

    def _flush(self) -> None:
        text = "".join(self._buf)
        if text:
            token: dict = {
                "type": "text",
                "text": text,
                "bold": self._bold > 0,
                "italic": self._italic > 0,
                "underline": self._underline > 0,
            }
            if self._strike:
                token["strike"] = True
            if self._code:
                token["code"] = True
            if self._color:
                token["color"] = self._color
            if self._bg:
                token["bg"] = self._bg
            if self._vert:
                token["vert"] = self._vert
            if self._font_family:
                token["font_family"] = self._font_family
            if self._font_size:
                token["font_size"] = self._font_size
            if self._small_caps:
                token["small_caps"] = True
            if self._all_caps:
                token["all_caps"] = True
            self.tokens.append(token)
        self._buf = []


def _inline_tokens(html: str) -> list[dict]:
    """Tokenize an inline HTML fragment into text and image tokens."""
    builder = _InlineRunBuilder()
    builder.feed(html)
    builder._flush()
    return builder.tokens


def _styled_runs(html: str) -> list[tuple[str, bool, bool, bool]]:
    """Legacy view: text-only runs (images excluded), used by callers that
    only care about character formatting."""
    return [(t["text"], t["bold"], t["italic"], t["underline"])
            for t in _inline_tokens(html) if t["type"] == "text"]
