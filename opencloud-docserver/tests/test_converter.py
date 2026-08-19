"""Tests for DOCX <-> HTML conversion."""

from __future__ import annotations

import io

from docx import Document

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
