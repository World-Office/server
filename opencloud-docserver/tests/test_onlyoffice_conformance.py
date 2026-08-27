"""ONLYOFFICE-informed conformance tests for the editor-format features.

These tests are *not* a blind borrow of ONLYOFFICE test documents. The
ONLYOFFICE ``core`` repository (``OOXML/DocxFormat`` + ``OdfFile/Writer/
Format``, sparse-checked out) was studied to reverse-engineer the exact
canonical XML ONLYOFFICE writes for the four editorial features — bookmarks,
comments, tracked changes and cross-references — in both DOCX and ODF 1.2.
Each test below rebuilds those canonical structures in memory and asserts the
docserver converter reads them back into the HTML contract, and that our
writers emit the same canonical structures.

Canonical facts recovered from ONLYOFFICE ``core``:

* DOCX bookmarks ......... ``w:bookmarkStart{w:id,w:name}`` …runs…
                          ``w:bookmarkEnd{w:id}``
* DOCX cross-reference ... ``w:hyperlink{w:anchor=NAME}`` (no external r:id)
                          + run with display text
* DOCX tracked changes ... ``w:ins{w:id,w:author,w:date}`` holding ``w:t``;
                          ``w:del{w:id,w:author,w:date}`` holding ``w:delText``
* ODT bookmarks .......... ``text:bookmark-start{text:name}`` …
                          ``text:bookmark-end{text:name}`` (a bare
                          ``text:bookmark{text:name}`` is the point form)
* ODT cross-reference .... ``text:bookmark-ref{text:ref-name,
                          text:reference-format="text"}`` + child text
* ODT tracked changes .... ``text:change-start{text:change-id}`` …
                          ``text:change-end{text:change-id}`` with a
                          ``text:tracked-changes`` registry of
                          ``text:changed-region{xml:id}`` →
                          ``text:insertion|text:deletion`` →
                          ``office:change-info`` → ``dc:creator``
* ODT comments ........... ``office:annotation`` with ``dc:creator``,
                          ``dc:date`` and a ``text:p`` body, appended right
                          after the anchored runs
"""

from __future__ import annotations

import io
import re
import zipfile

from docx import Document as _Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from odf.element import Element
from odf.namespaces import DCNS, OFFICENS, TEXTNS, XMLNS
from odf.office import Annotation
from odf.opendocument import OpenDocumentText
from odf.text import (
    BookmarkEnd,
    BookmarkRef,
    BookmarkStart,
    ChangeEnd,
    ChangeStart,
    Insertion,
    P,
    TrackedChanges,
)

from src.editor.converter import docx_to_html, html_to_docx
from src.editor.odt_converter import html_to_odt, odt_to_html

# ---------------------------------------------------------------------------
# Canonical DOCX builders (as ONLYOFFICE/Word writes them)
# ---------------------------------------------------------------------------

def _canonical_docx_bookmark() -> bytes:
    doc = _Document()
    p = doc.add_paragraph()
    bs = OxmlElement("w:bookmarkStart")
    bs.set(qn("w:id"), "1")
    bs.set(qn("w:name"), "BM1")
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "Target"
    r.append(t)
    be = OxmlElement("w:bookmarkEnd")
    be.set(qn("w:id"), "1")
    p._p.append(bs)
    p._p.append(r)
    p._p.append(be)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _canonical_docx_crossref() -> bytes:
    doc = _Document()
    p = doc.add_paragraph()
    p.add_run("See ")
    hl = OxmlElement("w:hyperlink")
    hl.set(qn("w:anchor"), "BM1")  # internal: no r:id, no external rel
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "section one"
    r.append(t)
    hl.append(r)
    p._p.append(hl)
    p.add_run(" above.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _canonical_docx_tracked_changes() -> bytes:
    doc = _Document()
    p = doc.add_paragraph()
    p.add_run("Before ")
    ins = OxmlElement("w:ins")
    ins.set(qn("w:id"), "2")
    ins.set(qn("w:author"), "Alice")
    ins.set(qn("w:date"), "2026-01-02T03:04:05Z")
    ri = OxmlElement("w:r")
    ti = OxmlElement("w:t")
    ti.set(qn("xml:space"), "preserve")
    ti.text = "new words"
    ri.append(ti)
    ins.append(ri)
    p._p.append(ins)
    dele = OxmlElement("w:del")
    dele.set(qn("w:id"), "3")
    dele.set(qn("w:author"), "Bob")
    dele.set(qn("w:date"), "2026-01-02T04:05:06Z")
    rd = OxmlElement("w:r")
    td = OxmlElement("w:delText")
    td.set(qn("xml:space"), "preserve")
    td.text = "old words"
    rd.append(td)
    dele.append(rd)
    p._p.append(dele)
    p.add_run(" after.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Canonical ODT builders (as ONLYOFFICE/LibreOffice write them)
# ---------------------------------------------------------------------------

def _canonical_odt_bookmark() -> bytes:
    doc = OpenDocumentText()
    p = P()
    p.addText("Intro ")
    p.addElement(BookmarkStart(name="BM1"))
    p.addText("Target")
    p.addElement(BookmarkEnd(name="BM1"))
    p.addText(" end.")
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _canonical_odt_crossref() -> bytes:
    doc = OpenDocumentText()
    p = P()
    p.addText("See ")
    p.addElement(BookmarkRef(refname="BM1", text="section one", referenceformat="text"))
    p.addText(" above.")
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _canonical_odt_tracked_changes() -> bytes:
    doc = OpenDocumentText()
    # document-level registry (ODF 1.2, LibreOffice/ONLYOFFICE form)
    tc = TrackedChanges()
    region = Element(
        qname=(TEXTNS, "changed-region"),
        qattributes={(XMLNS, "id"): "ct1"},
    )
    block = Insertion()
    body = P()
    body.addText("new words")
    block.insertBefore(body, None)
    info = Element(qname=(OFFICENS, "change-info"))
    creator = Element(qname=(DCNS, "creator"))
    creator.addText("Alice")
    info.insertBefore(creator, None)
    block.insertBefore(info, None)
    region.insertBefore(block, None)
    tc.addElement(region)
    if doc.text.childNodes:
        doc.text.insertBefore(tc, doc.text.childNodes[0])
    else:
        doc.text.addElement(tc)
    # body paragraph with change marks
    p = P()
    p.addText("Before ")
    p.addElement(ChangeStart(changeid="ct1"))
    p.addText("new words")
    p.addElement(ChangeEnd(changeid="ct1"))
    p.addText(" after.")
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _canonical_odt_comment() -> bytes:
    # LibreOffice/ONLYOFFICE anchor the office:annotation to the runs that
    # precede it inside the paragraph; trailing runs come after the element.
    doc = OpenDocumentText()
    p = P()
    p.addText("flagged")
    ann = Annotation()
    creator = Element(qname=(DCNS, "creator"))
    creator.addText("Alice")
    ann.addElement(creator)
    date_el = Element(qname=(DCNS, "date"))
    date_el.addText("2026-01-02T03:04:05Z")
    ann.addElement(date_el)
    bp = P()
    bp.addText("Check this")
    ann.addElement(bp)
    p.addElement(ann)
    p.addText(" text.")
    doc.text.addElement(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# DOCX read conformance
# ---------------------------------------------------------------------------

def test_docx_read_canonical_bookmark():
    html = docx_to_html(_canonical_docx_bookmark())
    assert '<span class="bookmark" data-name="BM1">Target</span>' in html, html


def test_docx_read_canonical_crossref_is_anchor():
    html = docx_to_html(_canonical_docx_crossref())
    assert '<a href="#BM1">section one</a>' in html, html


def test_docx_read_canonical_tracked_changes():
    html = docx_to_html(_canonical_docx_tracked_changes())
    assert ('<ins class="track-insert" data-author="Alice" '
            'data-datetime="2026-01-02T03:04:05Z">new words</ins>') in html, html
    assert ('<del class="track-delete" data-author="Bob" '
            'data-datetime="2026-01-02T04:05:06Z">old words</del>') in html, html
    assert "Before" in html and "after." in html, html


def test_docx_bookmark_roundtrip_preserves_bookmark_xml():
    """Provided a bookmark exists, html->docx->html keeps the <w:bookmarkStart>
    with a name (canonical element/attribute pair), not a plain span."""
    docx = html_to_docx('<p>Intro <span class="bookmark" data-name="SEC1">target text</span> end.</p>')
    with zipfile.ZipFile(io.BytesIO(docx)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    assert 'w:bookmarkStart' in xml, xml
    assert 'w:name="SEC1"' in xml, xml
    assert 'w:bookmarkEnd' in xml, xml


def test_docx_tracked_change_write_carries_wid_author_date():
    """Our writer emits the canonical w:id + w:author (+w:date) the OOXML
    schema requires on w:ins/w:del."""
    docx = html_to_docx(
        '<p>Before <ins class="track-insert" data-author="Alice" '
        'data-datetime="2026-01-02T03:04:05Z">new</ins> '
        '<del class="track-delete" data-author="Bob">old</del> after.</p>'
    )
    with zipfile.ZipFile(io.BytesIO(docx)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    assert re.search(r'<w:ins [^>]*w:id="[0-9]+"', xml), xml
    assert re.search(r'<w:ins [^>]*w:author="Alice"', xml), xml
    assert re.search(r'<w:ins [^>]*w:date="2026-01-02T03:04:05Z"', xml), xml
    assert re.search(r'<w:del [^>]*w:id="[0-9]+"', xml), xml
    assert re.search(r'<w:del [^>]*w:author="Bob"', xml), xml
    assert "w:delText" in xml, xml


# ---------------------------------------------------------------------------
# ODT read conformance
# ---------------------------------------------------------------------------

def test_odt_read_canonical_bookmark():
    html = odt_to_html(_canonical_odt_bookmark())
    assert '<span class="bookmark" data-name="BM1">Target</span>' in html, html


def test_odt_read_canonical_crossref():
    html = odt_to_html(_canonical_odt_crossref())
    assert '<a href="#BM1">section one</a>' in html, html


def test_odt_read_canonical_tracked_changes():
    html = odt_to_html(_canonical_odt_tracked_changes())
    assert ('<ins class="track-insert" data-author="Alice">new words</ins>') in html, html
    assert "Before" in html and "after." in html, html


def test_odt_read_canonical_comment():
    html = odt_to_html(_canonical_odt_comment())
    assert ('<span class="comment" data-author="Alice" '
            'data-comment="Check this">flagged</span>') in html, html


def test_odt_write_crossref_carries_reference_format():
    """Our ODT writer emits the canonical text:bookmark-ref with
    text:reference-format (what ONLYOFFICE/LibreOffice always write)."""
    odt = html_to_odt('<p>See <a href="#SEC1">section one</a> above.</p>')
    with zipfile.ZipFile(io.BytesIO(odt)) as z:
        xml = z.read("content.xml").decode("utf-8", "replace")
    assert 'text:bookmark-ref' in xml, xml
    assert 'text:ref-name="SEC1"' in xml, xml
    assert 'text:reference-format="text"' in xml, xml


def test_odt_write_bookmark_is_start_end_pair():
    """Our ODT writer emits text:bookmark-start/end carrying only text:name
    (the canonical range form; a bare text:bookmark can hold no content)."""
    odt = html_to_odt('<p>Intro <span class="bookmark" data-name="SEC1">target text</span> end.</p>')
    with zipfile.ZipFile(io.BytesIO(odt)) as z:
        xml = z.read("content.xml").decode("utf-8", "replace")
    assert 'text:bookmark-start' in xml, xml
    assert 'text:bookmark-end' in xml, xml
    assert 'text:name="SEC1"' in xml, xml
