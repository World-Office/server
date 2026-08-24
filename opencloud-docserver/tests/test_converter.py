"""Tests for DOCX <-> HTML conversion."""

from __future__ import annotations

import io

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

from src.editor.converter import docx_to_html, html_to_docx


def _make_docx(**kwargs) -> bytes:
    """Build a DOCX in memory with the given paragraphs/tables."""
    doc = Document()
    for text in kwargs.get("paragraphs", ["Hello world"]):
        if text.startswith("#"):
            doc.add_heading(text[1:], level=int(kwargs.get("heading_level", 1)))
        else:
            doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _simple_docx() -> bytes:
    doc = Document()
    doc.add_heading("Title", level=1)
    p = doc.add_paragraph()
    r = p.add_run("bold and ")
    r.bold = True
    r2 = p.add_run("italic")
    r2.italic = True
    doc.add_paragraph("Plain text line.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_docx_to_html_contains_paragraphs():
    html = docx_to_html(_simple_docx())
    assert "<p>" in html
    assert "Plain text line." in html


def test_docx_to_html_headings():
    html = docx_to_html(_make_docx(paragraphs=["#My Heading"]))
    assert "<h1>My Heading</h1>" in html


def test_docx_to_html_bold():
    html = docx_to_html(_simple_docx())
    assert "<b>bold and </b>" in html
    assert "<i>italic</i>" in html


def test_html_to_docx_roundtrip_text():
    docx_bytes = html_to_docx("<p>Hello <b>stoic</b> world</p>")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Hello" in text


def test_html_to_docx_headings():
    docx_bytes = html_to_docx("<h1>Alpha</h1><h2>Beta</h2>")
    doc = Document(io.BytesIO(docx_bytes))
    styles = [p.style.name for p in doc.paragraphs]
    assert any("Heading 1" in s for s in styles)
    assert any("Heading 2" in s for s in styles)


def test_html_to_docx_list():
    docx_bytes = html_to_docx("<ul><li>one</li><li>two</li></ul>")
    doc = Document(io.BytesIO(docx_bytes))
    assert "one" in [p.text for p in doc.paragraphs]


def test_html_to_docx_table():
    docx_bytes = html_to_docx("<table><tr><td>a</td><td>b</td></tr></table>")
    doc = Document(io.BytesIO(docx_bytes))
    assert doc.tables, "expected a table in output"
    assert doc.tables[0].cell(0, 0).text == "a"


def test_full_roundtrip_survives():
    """Editing flow: DOCX -> HTML -> DOCX must not raise and keep text."""
    original = _simple_docx()
    html = docx_to_html(original)
    back = html_to_docx(html)
    doc = Document(io.BytesIO(back))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Title" in text


def test_list_grouped_in_ul():
    """DOCX list paragraphs round-trip back into a <ul> block."""
    doc = Document()
    doc.add_paragraph("first", style="List Bullet")
    doc.add_paragraph("second", style="List Bullet")
    buf = io.BytesIO()
    doc.save(buf)
    html = docx_to_html(buf.getvalue())
    assert "<ul>" in html and "</ul>" in html
    assert html.count("<ul>") == 1


def test_html_to_docx_preserves_bold_italic_underline():
    docx_bytes = html_to_docx("<p>plain <b>bold</b> <i>italic</i> <u>under</u> tail</p>")
    doc = Document(io.BytesIO(docx_bytes))
    runs = [(r.text, r.bold, r.italic, r.underline) for r in doc.paragraphs[0].runs]
    by_text = {r[0].strip(): r for r in runs}
    assert by_text["bold"][1] is True, runs
    assert by_text["italic"][2] is True, runs
    assert by_text["under"][3] is True, runs
    assert by_text["plain"][1] is None and by_text["tail"][1] is None, runs


def test_html_to_docx_nested_inline_formatting():
    docx_bytes = html_to_docx("<p><b>both <i>nested</i></b> end</p>")
    doc = Document(io.BytesIO(docx_bytes))
    runs = {(r.text): r for r in doc.paragraphs[0].runs}
    assert runs["both "].bold is True
    assert runs["nested"].bold is True and runs["nested"].italic is True
    assert runs[" end"].bold is None


def test_full_roundtrip_keeps_bold():
    """DOCX(bold) -> HTML -> DOCX must keep the bold run (US-2 fidelity)."""
    original = _simple_docx()  # contains a bold run "bold and "
    html = docx_to_html(original)
    assert "<b>bold and </b>" in html
    roundtrip = html_to_docx(html)
    doc = Document(io.BytesIO(roundtrip))
    bold = [r.text for p in doc.paragraphs for r in p.runs if r.bold]
    assert "bold and " in bold, bold


def test_html_to_docx_keeps_tagless_text():
    """Raw text without block tags must survive (typed into an empty#editor)."""
    docx_bytes = html_to_docx("FRISCHER INHALT X.&nbsp;")
    doc = Document(io.BytesIO(docx_bytes))
    text = " ".join(p.text for p in doc.paragraphs)
    assert "FRISCHER INHALT X." in text, text


# --------------------------------------------------------------------------
# Table roundtrip (editor-tables-converter)
# --------------------------------------------------------------------------


def _table_docx(rows=2, cols=2, values=None, header=False) -> bytes:
    """Build a DOCX whose only content is an NxM table."""
    doc = Document()
    table = doc.add_table(rows=rows, cols=cols)
    table.style = "Table Grid"
    for r in range(rows):
        for c in range(cols):
            table.cell(r, c).text = values[r][c] if values else f"{r},{c}"
    if header:
        table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_docx_to_html_table_basic():
    html = docx_to_html(_table_docx(2, 2))
    assert html.count("<table>") == 1
    assert html.count("<tr>") == 2
    assert html.count("<td>") == 4
    assert "0,0" in html and "1,1" in html


def test_docx_to_html_table_inline_formatting():
    """Run-level formatting inside cells must survive DOCX -> HTML."""
    doc = Document()
    table = doc.add_table(rows=1, cols=1)
    p = table.cell(0, 0).paragraphs[0]
    r = p.add_run("bold")
    r.bold = True
    r2 = p.add_run(" and ")
    r2.italic = True
    r3 = p.add_run("under")
    r3.underline = True
    buf = io.BytesIO()
    doc.save(buf)
    html = docx_to_html(buf.getvalue())
    assert "<td><b>bold</b><i> and </i><u>under</u></td>" in html


def test_docx_to_html_table_header_row():
    html = docx_to_html(_table_docx(2, 2, header=True))
    assert html.count("<th>") == 2
    assert html.count("<td>") == 2


def test_docx_to_html_table_multiparagraph_cell():
    """Multi-paragraph cell content joins with <br/>."""
    doc = Document()
    table = doc.add_table(rows=1, cols=1)
    table.cell(0, 0).paragraphs[0].add_run("first")
    table.cell(0, 0).add_paragraph("second")
    buf = io.BytesIO()
    doc.save(buf)
    html = docx_to_html(buf.getvalue())
    assert "<td>first<br/>second</td>" in html


def test_docx_to_html_table_colspan():
    """Horizontally merged cells become colspan, not duplicated <td>."""
    doc = Document()
    table = doc.add_table(rows=2, cols=3)
    table.cell(0, 1).merge(table.cell(0, 2))
    buf = io.BytesIO()
    doc.save(buf)
    html = docx_to_html(buf.getvalue())
    # row 0 has 2 real cells (one spanning 2 grid columns), row 1 has 3
    assert html.count("<td") == 5
    assert 'colspan="2"' in html


def test_docx_to_html_table_rowspan():
    """Vertically merged cells become rowspan, no duplicate cells in next row."""
    doc = Document()
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).merge(table.cell(1, 0))
    buf = io.BytesIO()
    doc.save(buf)
    html = docx_to_html(buf.getvalue())
    assert 'rowspan="2"' in html
    assert html.count("<td") == 3  # 4 grid slots minus the rowspan-covered one


def test_html_to_docx_table_inline_formatting():
    docx_bytes = html_to_docx(
        "<table><tr><td><b>bold</b> <i>it</i></td></tr></table>"
    )
    doc = Document(io.BytesIO(docx_bytes))
    cell = doc.tables[0].cell(0, 0)
    runs = [(r.text, r.bold, r.italic) for r in cell.paragraphs[0].runs]
    assert ("bold", True, None) in runs, runs
    assert ("it", None, True) in runs, runs


def test_html_to_docx_table_multiparagraph():
    """<br/> inside a cell becomes a second paragraph."""
    docx_bytes = html_to_docx(
        "<table><tr><td>one<br/>two</td></tr></table>"
    )
    doc = Document(io.BytesIO(docx_bytes))
    cell = doc.tables[0].cell(0, 0)
    assert [p.text for p in cell.paragraphs] == ["one", "two"]


def test_html_to_docx_table_header_row():
    docx_bytes = html_to_docx(
        "<table><tr><th>H1</th><th>H2</th></tr><tr><td>a</td><td>b</td></tr></table>"
    )
    doc = Document(io.BytesIO(docx_bytes))
    tr = doc.tables[0].rows[0]._tr
    assert tr.trPr is not None and tr.trPr.find(qn("w:tblHeader")) is not None


def test_html_to_docx_table_colspan():
    docx_bytes = html_to_docx(
        '<table><tr><td colspan="2">wide</td><td>x</td></tr></table>'
    )
    doc = Document(io.BytesIO(docx_bytes))
    tc = doc.tables[0].rows[0]._tr.tc_lst[0]
    assert tc.tcPr is not None and tc.tcPr.gridSpan is not None
    assert tc.tcPr.gridSpan.val == 2


def test_html_to_docx_table_rowspan():
    docx_bytes = html_to_docx(
        '<table><tr><td rowspan="2">tall</td><td>x</td></tr><tr><td>y</td></tr></table>'
    )
    doc = Document(io.BytesIO(docx_bytes))
    tcs = doc.tables[0].rows[0]._tr.tc_lst
    assert tcs[0].tcPr is not None and tcs[0].tcPr.vMerge is not None
    assert tcs[0].tcPr.vMerge.val == "restart"
    continuation = doc.tables[0].rows[1]._tr.tc_lst[0]
    assert continuation.tcPr is not None and continuation.tcPr.vMerge is not None


def test_table_roundtrip_through_docx_is_stable():
    """DOCX(table) -> HTML -> DOCX -> HTML must be a fixed point."""
    doc = Document()
    table = doc.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    for r in range(3):
        for c in range(3):
            table.cell(r, c).text = f"{r},{c}"
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    # bold run in (1,0), multi-paragraph in (1,2), h-merge row2, v-merge col0
    table.cell(1, 0).paragraphs[0].add_run(" *").bold = True
    table.cell(1, 2).add_paragraph("extra")
    table.cell(2, 1).merge(table.cell(2, 2))
    table.cell(0, 0).merge(table.cell(1, 0))
    buf = io.BytesIO()
    doc.save(buf)
    html1 = docx_to_html(buf.getvalue())
    back = html_to_docx(html1)
    html2 = docx_to_html(back)
    assert html1 == html2, f"\nfirst: {html1}\nsecond: {html2}"


def test_table_roundtrip_through_html_is_stable():
    """HTML(table) -> DOCX -> HTML must reproduce the source table."""
    source = (
        '<table><tr><th rowspan="2">H</th><th>A</th><th>B</th></tr>'
        "<tr><td>1</td><td>2</td></tr>"
        '<tr><td colspan="2">wide</td><td>tail</td></tr></table>'
    )
    docx_bytes = html_to_docx(source)
    rebuilt = docx_to_html(docx_bytes)
    assert rebuilt == source, f"\ninput:   {source}\nrebuilt: {rebuilt}"
