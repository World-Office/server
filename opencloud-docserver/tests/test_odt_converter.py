"""Tests for ODT <-> HTML conversion.

Stoic goal: DOCX <-> HTML <-> ODT round-trip must preserve text and basic
formatting (bold/italic/underline, headings, lists, tables).
"""

from __future__ import annotations

import base64
import io
import re
import struct
import zipfile
import zlib

from odf.draw import Frame, Image
from odf.element import Element
from odf.namespaces import OFFICENS
from odf.opendocument import load
from odf.table import Table, TableCell, TableRow
from odf.text import P

from src.editor.odt_converter import (
    html_to_odt,
    odt_to_html,
)


def _simple_odt() -> bytes:
    """Build an ODT in memory with a heading, bold/italic/underline paragraph, and plain text."""
    from odf.opendocument import OpenDocumentText
    from odf.style import Style, TextProperties
    from odf.table import Table, TableCell, TableRow
    from odf.text import H, List, ListItem, P, Span

    doc = OpenDocumentText()

    doc.text.addElement(H(outlinelevel=1, text="Title"))

    # Bold run: style with TextProperties inside
    bold_style = Style(name="MyB", family="text")
    bold_style.addElement(TextProperties(fontweight="bold"))
    doc.automaticstyles.addElement(bold_style)

    p = P()
    p.addElement(Span(text="bold and ", stylename="MyB"))
    p.addElement(Span(text="italic"))
    doc.text.addElement(p)

    doc.text.addElement(P(text="Plain text line."))

    # Table
    table_el = Table()
    tr = TableRow()
    tc = TableCell()
    tc.addElement(P(text="a"))
    tr.addElement(tc)
    tc2 = TableCell()
    tc2.addElement(P(text="b"))
    tr.addElement(tc2)
    table_el.addElement(tr)
    doc.text.addElement(table_el)

    # List
    ol = List()
    li1 = ListItem()
    li1.addElement(P(text="first"))
    ol.addElement(li1)
    li2 = ListItem()
    li2.addElement(P(text="second"))
    ol.addElement(li2)
    doc.text.addElement(ol)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_odt_to_html_contains_paragraphs():
    html = odt_to_html(_simple_odt())
    assert "<p>" in html
    assert "Plain text line." in html


def test_odt_to_html_headings():
    html = odt_to_html(_simple_odt())
    assert "<h1>Title</h1>" in html


def test_odt_to_html_bold():
    html = odt_to_html(_simple_odt())
    assert "<b>bold and </b>" in html
    assert "italic" in html


def test_html_to_odt_roundtrip_text():
    odt_bytes = html_to_odt("<p>Hello <b>stoic</b> world</p>")
    doc = load(io.BytesIO(odt_bytes))
    from odf import teletype

    text = teletype.extractText(doc.text)
    assert "Hello" in text
    assert "stoic" in text


def test_html_to_odt_headings():
    odt_bytes = html_to_odt("<h1>Alpha</h1><h2>Beta</h2>")
    doc = load(io.BytesIO(odt_bytes))
    body = doc.text
    headings = [el for el in body.childNodes if el.qname[1] == "h"]
    assert any(el.getAttribute("outlinelevel") == "1" for el in headings)
    assert any(el.getAttribute("outlinelevel") == "2" for el in headings)


def test_html_to_odt_list():
    odt_bytes = html_to_odt("<ul><li>one</li><li>two</li></ul>")
    doc = load(io.BytesIO(odt_bytes))
    from odf.text import List, ListItem

    lists = list(doc.text.getElementsByType(List))
    assert len(lists) == 1
    items = list(lists[0].getElementsByType(ListItem))
    assert len(items) == 2


def test_ordered_list_roundtrip():
    """<ol> -> ODT -> <ol> must preserve ordering kind and items."""
    odt_bytes = html_to_odt("<ol><li>alpha</li><li>beta</li></ol>")
    html = odt_to_html(odt_bytes)
    assert "<ol>" in html and "</ol>" in html
    assert "<li>alpha</li>" in html
    assert "<li>beta</li>" in html


def test_odt_to_html_ordered_list_style():
    """A number-style list in the ODT must map to <ol> (LibreOffice case)."""
    from odf.opendocument import OpenDocumentText
    from odf.text import List, ListItem, ListLevelStyleNumber, ListStyle, P

    doc = OpenDocumentText()
    ls = ListStyle(name="List1")
    ls.addElement(ListLevelStyleNumber(level=1, numformat="1"))
    doc.styles.addElement(ls)
    ol = List(stylename="List1")
    li = ListItem()
    li.addElement(P(text="one"))
    ol.addElement(li)
    doc.text.addElement(ol)
    buf = io.BytesIO()
    doc.save(buf)
    html = odt_to_html(buf.getvalue())
    assert "<ol>" in html and "<li>one</li>" in html


def test_html_to_odt_table():
    odt_bytes = html_to_odt("<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table>")
    doc = load(io.BytesIO(odt_bytes))
    from odf.table import Table, TableCell, TableRow

    tables = list(doc.text.getElementsByType(Table))
    assert len(tables) == 1
    table_el = tables[0]
    rows = list(table_el.getElementsByType(TableRow))
    assert len(rows) == 1
    cells = list(rows[0].getElementsByType(TableCell))
    assert len(cells) == 2
    from odf import teletype

    assert "a" in teletype.extractText(cells[0])
    assert "b" in teletype.extractText(cells[1])


def test_full_roundtrip_odt_to_html_to_odt():
    """Editing flow: ODT -> HTML -> ODT must not raise and keep text."""
    original = _simple_odt()
    html = odt_to_html(original)
    back = html_to_odt(html)
    doc = load(io.BytesIO(back))
    from odf import teletype

    text = teletype.extractText(doc.text)
    assert "Title" in text
    assert "bold" in text
    assert "Plain text line." in text


def test_list_roundtrip():
    """DOCX list paragraphs round-trip back into a <ul> block."""
    from odf.opendocument import OpenDocumentText
    from odf.text import List, ListItem, P

    doc = OpenDocumentText()
    ol = List()
    li1 = ListItem()
    li1.addElement(P(text="first"))
    ol.addElement(li1)
    li2 = ListItem()
    li2.addElement(P(text="second"))
    ol.addElement(li2)
    doc.text.addElement(ol)
    buf = io.BytesIO()
    doc.save(buf)
    html = odt_to_html(buf.getvalue())
    assert "<ul>" in html and "</ul>" in html
    assert html.count("<ul>") == 1


def test_html_to_odt_preserves_bold_italic_underline():
    odt_bytes = html_to_odt("<p>plain <b>bold</b> <i>italic</i> <u>under</u> tail</p>")
    doc = load(io.BytesIO(odt_bytes))
    from odf.text import P

    paras = list(doc.text.getElementsByType(P))
    assert len(paras) >= 1
    # The writer flattens runs; check the first paragraph's content
    runs: list[tuple[str, bool, bool, bool]] = []
    for el in paras[0].childNodes:
        from odf.element import Node
        if el.nodeType == Node.TEXT_NODE:
            runs.append((el.data, False, False, False))
        elif hasattr(el, 'qname') and el.qname[1] == "span":
            style = el.getAttribute("stylename") or ""
            # WO_xxx = bold italic underline (1=on, 0=off)
            bold = "1" in style[3:4]
            italic = "1" in style[4:5]
            underline = "1" in style[5:6]
            from odf import teletype

            text = teletype.extractText(el)
            runs.append((text, bold, italic, underline))
    by_text = {r[0]: r for r in runs}
    assert by_text.get("bold", (None, False, False, False))[1] is True, runs
    assert by_text.get("italic", (None, False, False, False))[2] is True, runs
    assert by_text.get("under", (None, False, False, False))[3] is True, runs


def test_html_to_odt_nested_inline_formatting():
    odt_bytes = html_to_odt("<p><b>both <i>nested</i></b> end</p>")
    doc = load(io.BytesIO(odt_bytes))
    from odf.text import P

    paras = list(doc.text.getElementsByType(P))
    assert len(paras) >= 1
    runs: list[tuple[str, bool, bool, bool]] = []
    for el in paras[0].childNodes:
        from odf.element import Node
        if el.nodeType == Node.TEXT_NODE:
            runs.append((el.data, False, False, False))
        elif hasattr(el, 'qname') and el.qname[1] == "span":
            from odf import teletype

            text = teletype.extractText(el)
            style = el.getAttribute("stylename") or ""
            # WO_100 = bold only, WO_110 = bold+italic, WO_010 = italic only, etc.
            bold = "1" in style[3:4]  # WO_x00
            italic = "1" in style[4:5]  # WO_0x0
            runs.append((text, bold, italic, False))
    by_text = {r[0]: (r[1], r[2]) for r in runs}
    assert by_text.get("both ", (False, False))[0] is True
    assert by_text.get("nested", (False, False)) == (True, True)
    # " end" is plain text, no formatting
    assert by_text.get(" end", (False, False)) == (False, False)


def test_full_roundtrip_keeps_bold():
    """ODT(bold) -> HTML -> ODT must keep the bold run (US-2 fidelity)."""
    original = _simple_odt()
    html = odt_to_html(original)
    assert "<b>bold and </b>" in html
    roundtrip = html_to_odt(html)
    doc = load(io.BytesIO(roundtrip))
    from odf.text import P

    paras = list(doc.text.getElementsByType(P))
    bold_runs = []
    for para in paras:
        for el in para.childNodes:
            from odf.element import Node
            if el.nodeType == Node.TEXT_NODE:
                continue
            if hasattr(el, 'qname') and el.qname[1] == "span":
                style = el.getAttribute("stylename") or ""
                # WO_x00 = bold
                if "1" in style[3:4]:  # WO_x00
                    from odf import teletype

                    bold_runs.append(teletype.extractText(el))
    assert "bold and " in bold_runs


def test_html_to_odt_keeps_tagless_text():
    """Raw text without block tags must survive (typed into an empty editor)."""
    odt_bytes = html_to_odt("FRISCHER INHALT X.&nbsp;")
    doc = load(io.BytesIO(odt_bytes))
    from odf import teletype

    text = teletype.extractText(doc.text)
    assert "FRISCHER INHALT X." in text, text


def test_odt_to_html_table_roundtrip():
    """ODT table -> HTML -> ODT must preserve table structure."""
    from odf.opendocument import OpenDocumentText
    from odf.table import Table, TableCell, TableRow
    from odf.text import P

    doc = OpenDocumentText()
    t = Table()
    tr1 = TableRow()
    tc1 = TableCell()
    tc1.addElement(P(text="row1 col1"))
    tc2 = TableCell()
    tc2.addElement(P(text="row1 col2"))
    tr1.addElement(tc1)
    tr1.addElement(tc2)
    t.addElement(tr1)
    tr2 = TableRow()
    tc3 = TableCell()
    tc3.addElement(P(text="row2 col1"))
    tc4 = TableCell()
    tc4.addElement(P(text="row2 col2"))
    tr2.addElement(tc3)
    tr2.addElement(tc4)
    t.addElement(tr2)
    doc.text.addElement(t)
    buf = io.BytesIO()
    doc.save(buf)
    html = odt_to_html(buf.getvalue())
    # Verify table tags present
    assert "<table>" in html and "</table>" in html
    assert "<tr>" in html and "</tr>" in html
    assert "<td><p>row1 col1</p></td>" in html
    # Round-trip
    back = html_to_odt(html)
    doc2 = load(io.BytesIO(back))
    from odf.table import Table as OdtTable

    tables = list(doc2.text.getElementsByType(OdtTable))
    assert len(tables) == 1
    rows = list(tables[0].getElementsByType(TableRow))
    assert len(rows) == 2
    from odf import teletype

    assert "row1 col1" in teletype.extractText(rows[0])
    assert "row2 col2" in teletype.extractText(rows[1])


def test_html_to_odt_centered_paragraph():
    """text-align:center must produce a centered paragraph."""
    odt_bytes = html_to_odt('<p style="text-align:center">Centered</p>')
    doc = load(io.BytesIO(odt_bytes))
    from odf.text import P

    paras = list(doc.text.getElementsByType(P))
    assert len(paras) >= 1
    # The writer creates a style for center; check its name
    style_name = paras[0].getAttribute("stylename")
    assert style_name == "WO_Center"


def test_html_to_odt_right_aligned_paragraph():
    """text-align:right must produce a right-aligned paragraph."""
    odt_bytes = html_to_odt('<p style="text-align:right">Right</p>')
    doc = load(io.BytesIO(odt_bytes))
    from odf.text import P

    paras = list(doc.text.getElementsByType(P))
    assert len(paras) >= 1
    style_name = paras[0].getAttribute("stylename")
    assert style_name == "WO_Right"


def test_odt_to_html_list_with_nested_list():
    """Nested lists must render as nested <ul> blocks."""
    from odf.opendocument import OpenDocumentText
    from odf.text import List, ListItem, P

    doc = OpenDocumentText()
    outer = List()
    outer_item = ListItem()
    outer_item.addElement(P(text="item 1"))
    outer.addElement(outer_item)

    nested = List()
    nested_item = ListItem()
    nested_item.addElement(P(text="nested a"))
    nested.addElement(nested_item)
    outer_item.addElement(nested)

    doc.text.addElement(outer)
    buf = io.BytesIO()
    doc.save(buf)
    html = odt_to_html(buf.getvalue())
    assert html.count("<ul>") == 2
    assert "<ul><li>item 1<ul><li>nested a</li></ul></li></ul>" in html.replace(
        "\n", ""
    )


# ---------------------------------------------------------------------------
# ODT table round-trip (task: test-odt-tables)
# ---------------------------------------------------------------------------

def _table_odt(nrows: int, ncols: int, texts) -> bytes:
    """Build an ODT containing a single ``nrows x ncols`` table."""
    from odf.opendocument import OpenDocumentText
    from odf.table import Table, TableCell, TableRow
    from odf.text import P

    doc = OpenDocumentText()
    t = Table()
    for r in range(nrows):
        tr = TableRow()
        for c in range(ncols):
            tc = TableCell()
            tc.addElement(P(text=texts[r][c]))
            tr.addElement(tc)
        t.addElement(tr)
    doc.text.addElement(t)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_html_to_odt_table_roundtrip_multicol():
    """A 3x3 HTML table must land in ODT as one table and round-trip fully."""
    html = (
        "<table><tr><td>1</td><td>2</td><td>3</td></tr>"
        "<tr><td>4</td><td>5</td><td>6</td></tr>"
        "<tr><td>7</td><td>8</td><td>9</td></tr></table>"
    )
    odt = html_to_odt(html)
    doc = load(io.BytesIO(odt))
    tables = list(doc.text.getElementsByType(Table))
    assert len(tables) == 1
    rows = list(tables[0].getElementsByType(TableRow))
    assert len(rows) == 3
    assert all(len(list(r.getElementsByType(TableCell))) == 3 for r in rows)

    # ODT -> HTML keeps the grid and cell order.
    html2 = odt_to_html(odt)
    assert html2.count("<tr>") == 3
    assert html2.count("<td>") == 9
    assert "<td><p>1</p></td>" in html2
    assert "<td><p>5</p></td>" in html2
    assert "<td><p>9</p></td>" in html2

    # Full HTML -> ODT -> HTML -> ODT keeps one table and every cell.
    odt2 = html_to_odt(html2)
    doc2 = load(io.BytesIO(odt2))
    tables2 = list(doc2.text.getElementsByType(Table))
    assert len(tables2) == 1
    rows2 = list(tables2[0].getElementsByType(TableRow))
    assert len(rows2) == 3
    from odf import teletype

    cell_text = teletype.extractText(tables2[0])
    for n in "123456789":
        assert n in cell_text, cell_text


def test_table_roundtrip_multicol_from_odt():
    """A 3x2 ODT table must survive ODT -> HTML -> ODT unchanged."""
    odt = _table_odt(3, 2, [
        ["r0c0", "r0c1"],
        ["r1c0", "r1c1"],
        ["r2c0", "r2c1"],
    ])
    html = odt_to_html(odt)
    assert html.count("<tr>") == 3
    assert html.count("<td>") == 6
    assert "<td><p>r0c0</p></td>" in html
    assert "<td><p>r2c1</p></td>" in html

    back = html_to_odt(html)
    doc = load(io.BytesIO(back))
    tables = list(doc.text.getElementsByType(Table))
    assert len(tables) == 1
    rows = list(tables[0].getElementsByType(TableRow))
    assert len(rows) == 3
    from odf import teletype

    text = teletype.extractText(tables[0])
    for cell in ("r0c0", "r0c1", "r1c0", "r1c1", "r2c0", "r2c1"):
        assert cell in text, text


def test_table_roundtrip_preserves_inline_formatting():
    """Bold/italic runs inside cells must survive ODT -> HTML -> ODT."""
    from odf.opendocument import OpenDocumentText
    from odf.style import Style, TextProperties
    from odf.table import Table, TableCell, TableRow
    from odf.text import P, Span

    doc = OpenDocumentText()
    bold_style = Style(name="WO_100", family="text")
    bold_style.addElement(TextProperties(fontweight="bold"))
    doc.automaticstyles.addElement(bold_style)

    t = Table()
    tr = TableRow()
    tc = TableCell()
    p = P()
    p.addElement(Span(text="boldtxt", stylename="WO_100"))
    p.addElement(Span(text="plain"))
    tc.addElement(p)
    tr.addElement(tc)
    t.addElement(tr)
    doc.text.addElement(t)
    buf = io.BytesIO()
    doc.save(buf)

    html = odt_to_html(buf.getvalue())
    assert "<td><p><b>boldtxt</b>plain</p></td>" in html

    back = html_to_odt(html)
    doc2 = load(io.BytesIO(back))
    tables = list(doc2.text.getElementsByType(Table))
    assert len(tables) == 1
    from odf import teletype

    text = teletype.extractText(tables[0])
    assert "boldtxt" in text and "plain" in text, text


def test_table_roundtrip_multiple_tables_with_paragraph():
    """Two tables with a paragraph between them must both survive."""
    html = (
        "<p>before</p>"
        "<table><tr><td>1</td></tr></table>"
        "<p>mid</p>"
        "<table><tr><td>2</td></tr></table>"
        "<p>after</p>"
    )
    html2 = odt_to_html(html_to_odt(html))
    assert html2.count("<table>") == 2
    assert html2.count("<p>before</p>") == 1
    assert html2.count("<p>mid</p>") == 1
    assert html2.count("<p>after</p>") == 1
    # First table keeps its own content, second table keeps its own.
    assert "<td><p>1</p></td>" in html2
    assert "<td><p>2</p></td>" in html2

    back = html_to_odt(html2)
    doc = load(io.BytesIO(back))
    tables = list(doc.text.getElementsByType(Table))
    assert len(tables) == 2


def test_table_roundtrip_empty_cells():
    """Empty cells must not vanish during the round-trip."""
    html = "<table><tr><td></td><td>x</td></tr></table>"
    html2 = odt_to_html(html_to_odt(html))
    assert "<td><p></p></td>" in html2
    assert "<td><p>x</p></td>" in html2
    back = html_to_odt(html2)
    doc = load(io.BytesIO(back))
    tables = list(doc.text.getElementsByType(Table))
    cells = list(tables[0].getElementsByType(TableCell))
    assert len(cells) == 2
    from odf import teletype

    assert "x" in teletype.extractText(cells[1])


def test_html_to_odt_table_roundtrip_th_headers():
    """A <th> header row becomes cells and keeps its text in the round-trip."""
    html = (
        "<table><tr><th>H1</th><th>H2</th></tr>"
        "<tr><td>a</td><td>b</td></tr></table>"
    )
    html2 = odt_to_html(html_to_odt(html))
    assert html2.count("<tr>") == 2
    assert "<td><p>H1</p></td>" in html2
    assert "<td><p>H2</p></td>" in html2
    assert "<td><p>a</p></td>" in html2
    assert "<td><p>b</p></td>" in html2


def test_html_to_odt_table_roundtrip_with_attributes():
    """<table>/<tr> with style or class attributes must still round-trip.

    Regression: previously a table whose tags carried attributes was
    silently dropped and its text flattened into a plain paragraph.
    """
    html = (
        '<table style="width:100%" class="tbl">'
        '<tr style="background:#eee"><td>a</td><td>b</td></tr>'
        "</table>"
    )
    odt = html_to_odt(html)
    doc = load(io.BytesIO(odt))
    tables = list(doc.text.getElementsByType(Table))
    assert len(tables) == 1, "table with attributes must not be dropped"

    html2 = odt_to_html(odt)
    assert "<table>" in html2
    assert "<td><p>a</p></td>" in html2
    assert "<td><p>b</p></td>" in html2
    back = html_to_odt(html2)
    doc2 = load(io.BytesIO(back))
    tables2 = list(doc2.text.getElementsByType(Table))
    assert len(tables2) == 1
    from odf import teletype

    text = teletype.extractText(tables2[0])
    assert "a" in text and "b" in text, text


def test_table_roundtrip_covered_cells():
    """A covered-table-cell (LibreOffice merge artifact) renders as an empty
    <td> and does not break the ODT -> HTML -> ODT round-trip."""
    from odf.opendocument import OpenDocumentText
    from odf.table import CoveredTableCell, Table, TableCell, TableRow
    from odf.text import P

    doc = OpenDocumentText()
    t = Table()
    tr = TableRow()
    tc = TableCell()
    tc.addElement(P(text="merged"))
    tr.addElement(tc)
    tr.addElement(CoveredTableCell())
    t.addElement(tr)
    doc.text.addElement(t)
    buf = io.BytesIO()
    doc.save(buf)

    html = odt_to_html(buf.getvalue())
    assert "<td><p>merged</p></td>" in html
    assert html.count("<td>") == 2

    back = html_to_odt(html)
    doc2 = load(io.BytesIO(back))
    tables = list(doc2.text.getElementsByType(Table))
    assert len(tables) == 1
    from odf import teletype

    assert "merged" in teletype.extractText(tables[0])


def test_table_roundtrip_ragged_rows():
    """Rows of differing widths must keep their own cells during round-trip."""
    html = (
        "<table><tr><td>a</td><td>b</td><td>c</td></tr>"
        "<tr><td>d</td></tr></table>"
    )
    html2 = odt_to_html(html_to_odt(html))
    assert html2.count("<tr>") == 2
    assert "<td><p>a</p></td><td><p>b</p></td><td><p>c</p></td>" in html2
    assert "<td><p>d</p></td>" in html2


# ---------------------------------------------------------------------------
# ODT image round-trip (task: test-odt-images)
# ---------------------------------------------------------------------------


def _png_bytes(width: int, height: int) -> bytes:
    """Build a minimal valid PNG (RGB) of the given pixel size."""
    def _chunk(ctype: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + ctype + data
        return c + struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr)
            + _chunk(b"IDAT", zlib.compress(raw)) + _chunk(b"IEND", b""))


def _data_uri(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def _img_srcs(html: str) -> list[str]:
    """All data-URI src values of <img> tags in an HTML fragment."""
    return re.findall(r'<img[^>]*\ssrc="(data:[^"]+)"', html)


def _decode_data_uri(uri: str) -> bytes:
    return base64.b64decode(uri.split(",", 1)[1])


def _odt_picture_bytes(odt: bytes) -> list[bytes]:
    """Bytes of every Pictures/ member in an ODT package."""
    with zipfile.ZipFile(io.BytesIO(odt)) as z:
        return [z.read(n) for n in z.namelist() if n.startswith("Pictures/")]


def _odt_with_picture(png: bytes, width_px: str | None = None,
                      height_px: str | None = None) -> bytes:
    """Build an ODT with one paragraph: text + referenced draw:image."""
    from odf.opendocument import OpenDocumentText

    doc = OpenDocumentText()
    name = doc.addPictureFromString(png, "image/png")
    frame = Frame(name="Pic", anchortype="as-char")
    if width_px:
        frame.setAttribute("width", width_px)
    if height_px:
        frame.setAttribute("height", height_px)
    frame.addElement(Image(href=name))
    p = P()
    p.addText("imaged ")
    p.addElement(frame)
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_html_to_odt_image_roundtrip_single():
    """A data-URI <img> becomes a draw:frame/draw:image whose package bytes
    and re-exported data URI match the original PNG exactly."""
    png = _png_bytes(2, 3)
    html = f'<p>Lead <img src="{_data_uri(png)}"/> tail</p>'
    odt = html_to_odt(html)

    pictures = _odt_picture_bytes(odt)
    assert len(pictures) == 1
    assert pictures[0] == png
    with zipfile.ZipFile(io.BytesIO(odt)) as z:
        assert "image/png" in z.read("META-INF/manifest.xml").decode()

    html2 = odt_to_html(odt)
    srcs = _img_srcs(html2)
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png
    assert "Lead" in html2 and "tail" in html2


def test_odt_to_html_image_roundtrip_referenced_picture():
    """A classic ODT (draw:frame -> draw:image xlink:href into Pictures/)
    renders as a data-URI <img> with its pixel dimensions kept."""
    png = _png_bytes(4, 5)
    html = odt_to_html(_odt_with_picture(png, width_px="4px", height_px="5px"))
    srcs = _img_srcs(html)
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png
    assert "imaged" in html
    assert 'width="4"' in html and 'height="5"' in html


def test_image_roundtrip_preserves_picture_bytes_full_loop():
    """ODT -> HTML -> ODT keeps the image bytes verbatim end to end."""
    png = _png_bytes(2, 3)
    original = _odt_with_picture(png)

    html = odt_to_html(original)
    back = html_to_odt(html)
    pictures = _odt_picture_bytes(back)
    assert len(pictures) == 1
    assert pictures[0] == png

    srcs = _img_srcs(odt_to_html(back))
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png


def test_odt_to_html_image_roundtrip_embedded_binary_data():
    """A draw:image carrying office:binary-data (no Pictures/ member, no
    xlink:href) still becomes a data-URI <img>."""
    from odf.opendocument import OpenDocumentText

    png = _png_bytes(2, 2)
    doc = OpenDocumentText()
    frame = Frame(name="Pic", anchortype="as-char")
    img = Image()
    bdata = Element(qname=(OFFICENS, "binary-data"))
    bdata.addText(base64.b64encode(png).decode("ascii"))
    img.addElement(bdata)
    frame.addElement(img)
    p = P()
    p.addElement(frame)
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)

    srcs = _img_srcs(odt_to_html(buf.getvalue()))
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png


def test_html_to_odt_image_roundtrip_explicit_dimensions():
    """width/height attributes on the <img> become svg:width/height on the
    frame and survive the ODT -> HTML pass."""
    png = _png_bytes(2, 3)
    html = f'<p><img src="{_data_uri(png)}" width="120" height="90"/></p>'
    odt = html_to_odt(html)

    content = zipfile.ZipFile(io.BytesIO(odt)).read("content.xml").decode()
    assert 'svg:width="120px"' in content
    assert 'svg:height="90px"' in content

    html2 = odt_to_html(odt)
    srcs = _img_srcs(html2)
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png
    assert 'width="120"' in html2 and 'height="90"' in html2


def test_html_to_odt_image_roundtrip_intrinsic_dimensions():
    """Without explicit attributes the frame size comes from the image's
    intrinsic pixel dimensions (sniffed from the PNG header)."""
    png = _png_bytes(2, 3)
    odt = html_to_odt(f'<p><img src="{_data_uri(png)}"/></p>')

    content = zipfile.ZipFile(io.BytesIO(odt)).read("content.xml").decode()
    assert 'svg:width="2px"' in content
    assert 'svg:height="3px"' in content

    html2 = odt_to_html(odt)
    assert 'width="2"' in html2 and 'height="3"' in html2


def test_html_to_odt_image_roundtrip_keeps_formatting():
    """An image inside a paragraph does not disturb bold/italic runs around
    it — both the runs and the picture survive."""
    png = _png_bytes(2, 3)
    html = f'<p><b>Bold</b> <img src="{_data_uri(png)}"/> tail</p>'
    odt = html_to_odt(html)
    pictures = _odt_picture_bytes(odt)
    assert pictures == [png]

    html2 = odt_to_html(odt)
    assert "<b>Bold</b>" in html2
    assert " tail" in html2
    srcs = _img_srcs(html2)
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png


def test_html_to_odt_image_roundtrip_multiple():
    """Several images in one paragraph each become their own frame with the
    correct bytes, in order."""
    png1 = _png_bytes(2, 3)
    png2 = _png_bytes(3, 2)
    html = (f'<p>a<img src="{_data_uri(png1)}"/>b'
            f'<img src="{_data_uri(png2)}"/>c</p>')
    odt = html_to_odt(html)

    assert set(_odt_picture_bytes(odt)) == {png1, png2}
    html2 = odt_to_html(odt)
    srcs = _img_srcs(html2)
    assert len(srcs) == 2
    assert _decode_data_uri(srcs[0]) == png1
    assert _decode_data_uri(srcs[1]) == png2


def test_image_roundtrip_in_table_cell():
    """Images inside table cells follow the same path and survive."""
    png = _png_bytes(2, 3)
    html = f'<table><tr><td>icon <img src="{_data_uri(png)}"/></td><td>x</td></tr></table>'
    odt = html_to_odt(html)

    pictures = _odt_picture_bytes(odt)
    assert len(pictures) == 1
    assert pictures[0] == png

    html2 = odt_to_html(odt)
    assert "<td><p>icon " in html2
    srcs = _img_srcs(html2)
    assert len(srcs) == 1
    assert _decode_data_uri(srcs[0]) == png


def test_odt_to_html_image_roundtrip_missing_picture_is_skipped():
    """A draw:image whose Pictures/ member is absent must not crash or emit
    a broken <img> — surrounding text still converts."""
    from odf.opendocument import OpenDocumentText

    doc = OpenDocumentText()
    frame = Frame(name="Ghost", anchortype="as-char")
    frame.addElement(Image(href="Pictures/Missing.png"))
    p = P()
    p.addElement(frame)
    p.addText("after")
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)

    html = odt_to_html(buf.getvalue())
    assert "after" in html
    assert "<img" not in html


def test_html_to_odt_image_roundtrip_non_data_uri_is_skipped():
    """An http(s) src cannot be fetched server-side and is skipped without
    breaking the rest of the paragraph."""
    odt = html_to_odt('<p>link <img src="https://example.com/x.png"/> tail</p>')
    assert _odt_picture_bytes(odt) == []
    html2 = odt_to_html(odt)
    assert "link" in html2 and "tail" in html2
    assert "<img" not in html2
