"""Tests for ODT <-> HTML conversion.

Stoic goal: DOCX <-> HTML <-> ODT round-trip must preserve text and basic
formatting (bold/italic/underline, headings, lists, tables).
"""

from __future__ import annotations

import io

from odf.opendocument import load

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
