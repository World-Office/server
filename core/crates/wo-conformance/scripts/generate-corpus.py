#!/usr/bin/env python3
"""
Conformance corpus generator.

Creates real .docx files covering the layout features that matter for fidelity
measurement: paragraphs, bold/italic, multiple fonts, tables, multi-page,
page breaks, lists, mixed content, etc.  Each file is a valid OOXML package
that opens correctly in Word, LibreOffice, and any other OOXML consumer.

Usage:
    python3 generate-corpus.py <output-dir>
"""

import io
import os
import sys
import zipfile

CONTENT_TYPES_MINIMAL = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>"""


WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _w(body_xml: str, extra_parts: dict | None = None) -> bytes:
    parts = {
        "[Content_Types].xml": CONTENT_TYPES_MINIMAL,
        "_rels/.rels": RELS,
        "word/document.xml": (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<w:document {WORD_NS}>{body_xml}</w:document>'
        ),
    }
    if extra_parts:
        parts.update(extra_parts)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)
    return buf.getvalue()


def _p(text: str, bold: bool = False, italic: bool = False, font: str | None = None,
        size: int | None = None, align: str | None = None, style_id: str | None = None,
        spacing_before: int | None = None, spacing_after: int | None = None,
        indent_left: int | None = None) -> str:
    """Build a <w:p> element."""
    rpr = _rpr(bold, italic, font, size)
    ppr_parts = []
    if style_id:
        ppr_parts.append(f'<w:pStyle w:val="{style_id}"/>')
    if align:
        ppr_parts.append(f'<w:jc w:val="{align}"/>')
    if spacing_before is not None:
        ppr_parts.append(f'<w:spacing w:before="{spacing_before}"/>')
    if spacing_after is not None:
        ppr_parts.append(f'<w:spacing w:after="{spacing_after}"/>')
    if indent_left is not None:
        ppr_parts.append(f'<w:ind w:left="{indent_left}"/>')
    ppr = f"<w:pPr>{''.join(ppr_parts)}</w:pPr>" if ppr_parts else ""
    r = f"<w:r>{rpr}<w:t>{_esc(text)}</w:t></w:r>" if text else ""
    return f"<w:p>{ppr}{r}</w:p>"


def _rpr(bold: bool, italic: bool, font: str | None, size: int | None) -> str:
    parts = []
    if bold or italic or font or size:
        rfonts = ""
        if font:
            rfonts = f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:eastAsia="{font}" w:cs="{font}"/>'
        b = "<w:b/>" if bold else ""
        i = "<w:i/>" if italic else ""
        parts.append(f"<w:rPr>{rfonts}{b}{i}")
        if size:
            parts.append(f'<w:sz w:val="{size}"/>')
        parts.append("</w:rPr>")
        return "".join(parts)
    return ""


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def write_docx(out_dir: str, name: str, body_xml: str, extra_parts: dict | None = None):
    path = os.path.join(out_dir, name)
    data = _w(body_xml, extra_parts)
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


# ---------------------------------------------------------------------------
# Corpus documents
# ---------------------------------------------------------------------------

def gen_corpus(out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    n = 0

    def doc(name, body_xml, extra=None):
        nonlocal n
        sz = write_docx(out_dir, name, body_xml, extra)
        n += 1
        return sz

    def body(*children):
        return f"<w:body>{''.join(children)}</w:body>"

    # 01 — Single paragraph, plain text
    doc("01-single-paragraph.docx", body(_p("Hello World")))

    # 02 — Multiple paragraphs
    doc("02-multiple-paragraphs.docx", body(
        _p("First paragraph."),
        _p("Second paragraph."),
        _p("Third paragraph."),
    ))

    # 03 — Bold text
    doc("03-bold.docx", body(_p("This is bold text.", bold=True)))

    # 04 — Italic text
    doc("04-italic.docx", body(_p("This is italic text.", italic=True)))

    # 05 — Bold + italic
    doc("05-bold-italic.docx", body(_p("Bold and italic together.", bold=True, italic=True)))

    # 06 — Font change (Times New Roman)
    doc("06-font-times.docx", body(_p("Text in Times New Roman.", font="Times New Roman")))

    # 07 — Font change (Arial)
    doc("07-font-arial.docx", body(_p("Text in Arial.", font="Arial")))

    # 08 — Font change (Courier New)
    doc("08-font-courier.docx", body(_p("Text in Courier New.", font="Courier New")))

    # 09 — Font size 14pt
    doc("09-font-size-14.docx", body(_p("Fourteen point text.", size=28)))

    # 10 — Font size 24pt
    doc("10-font-size-24.docx", body(_p("Twenty-four point text.", size=48)))

    # 11 — Heading style
    doc("11-heading.docx", body(
        _p("Main Heading", style_id="Heading1"),
        _p("Body text under the heading."),
    ))

    # 12 — Centered paragraph
    doc("12-centered.docx", body(_p("Centered text.", align="center")))

    # 13 — Right-aligned paragraph
    doc("13-right-aligned.docx", body(_p("Right-aligned text.", align="right")))

    # 14 — Justified paragraph
    doc("14-justified.docx", body(
        _p("This is a longer paragraph that should exercise line wrapping with justified alignment. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.", align="both"),
    ))

    # 15 — Indented paragraph
    doc("15-indented.docx", body(
        _p("Normal paragraph."),
        _p("Indented paragraph.", indent_left=720),
    ))

    # 16 — Page break
    doc("16-page-break.docx", "", {"word/document.xml":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document {WORD_NS}><w:body>'
        '<w:p><w:r><w:t>Content on page one.</w:t></w:r></w:p>'
        '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Content on page two.</w:t></w:r></w:p>'
        '</w:body></w:document>'
    })

    # 17 — Multi-page text (forces wrapping)
    long_text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " * 30
    doc("17-multi-page.docx", body(_p(long_text)))

    # 18 — Simple table 2x2
    doc("18-simple-table.docx", body(
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
        '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/>'
        '<w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>'
        '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>'
        '</w:tblBorders></w:tblPr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Cell A1</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:t>Cell B1</w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Cell A2</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:t>Cell B2</w:t></w:r></w:p></w:tc></w:tr>'
        '</w:tbl>'
    ))

    # 19 — Table with header row
    doc("19-table-header.docx", body(
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>'
        '<w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Name</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Alice</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Bob</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:t>99</w:t></w:r></w:p></w:tc></w:tr>'
        '</w:tbl>'
    ))

    # 20 — Table with multiple paragraphs in a cell
    doc("20-table-multi-para.docx", body(
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Para 1 in cell.</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>Para 2 in same cell.</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:t>Adjacent cell.</w:t></w:r></w:p></w:tc></w:tr>'
        '</w:tbl>'
    ))

    # 21 — Table with font change in cell
    doc("21-table-font.docx", body(
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>'
        '<w:tr><w:tc><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="28"/></w:rPr><w:t>Big Arial</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:p><w:r><w:rPr><w:i/><w:rFonts w:ascii="Times New Roman"/></w:rPr><w:t>Italic Times</w:t></w:r></w:p></w:tc></w:tr>'
        '</w:tbl>'
    ))

    # 22 — Mixed fonts in one paragraph
    doc("22-mixed-fonts.docx", body(
        "<w:p>"
        "<w:r><w:rPr><w:rFonts w:ascii=\"Calibri\"/></w:rPr><w:t>Calibri </w:t></w:r>"
        "<w:r><w:rPr><w:rFonts w:ascii=\"Arial\"/><w:b/></w:rPr><w:t>Bold Arial </w:t></w:r>"
        "<w:r><w:rPr><w:rFonts w:ascii=\"Courier New\"/><w:i/></w:rPr><w:t>Italic Courier</w:t></w:r>"
        "</w:p>"
    ))

    # 23 — Paragraph spacing
    doc("23-paragraph-spacing.docx", body(
        _p("Paragraph with 480 twips (24pt) before.", spacing_before=480),
        _p("Normal paragraph.", spacing_before=0),
        _p("Paragraph with 400 twips after.", spacing_before=0, spacing_after=400),
    ))

    # 24 — Consecutive page breaks
    doc("24-consecutive-page-breaks.docx", "", {"word/document.xml":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document {WORD_NS}>'
        '<w:body>'
        '<w:p><w:r><w:t>Page 1</w:t></w:r></w:p>'
        '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Page 2</w:t></w:r></w:p>'
        '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Page 3</w:t></w:r></w:p>'
        '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Page 4</w:t></w:r></w:p>'
        '</w:body></w:document>'
    })

    # 25 — Single word (stress test for empty/minimal content)
    doc("25-single-word.docx", body(_p("Hi")))

    # 26 — Empty document
    doc("26-empty.docx", body(""))

    # 27 — Long line (forces wrapping at word boundaries)
    words = " ".join(f"word{i}" for i in range(200))
    doc("27-long-line-wrapping.docx", body(_p(words)))

    # 28 — Multiple fonts on multiple pages
    fonts_28 = ["Calibri", "Arial", "Times New Roman", "Courier New", "Georgia"]
    doc("28-font-per-page.docx", "", {"word/document.xml":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document {WORD_NS}><w:body>'
        + ''.join([
            f'<w:p><w:r><w:rPr><w:rFonts w:ascii="{f}" w:hAnsi="{f}"/></w:rPr><w:t>Page {i+1}: text in {f}.</w:t></w:r></w:p>'
            + (f'<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t> </w:t></w:r></w:p>' if i < 4 else '')
            for i, f in enumerate(fonts_28)
        ])
        + '</w:body></w:document>'
    })

    # 29 — Nested table content (table followed by paragraph)
    doc("29-table-plus-text.docx", body(
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr>'
        '</w:tbl>',
        _p("Text after the table."),
        _p("More text below."),
    ))

    # 30 — Font size changes within paragraph
    doc("30-size-runs.docx", body(
        "<w:p>"
        "<w:r><w:rPr><w:sz w:val=\"16\"/></w:rPr><w:t>Small </w:t></w:r>"
        "<w:r><w:rPr><w:sz w:val=\"22\"/></w:rPr><w:t>Normal </w:t></w:r>"
        "<w:r><w:rPr><w:sz w:val=\"36\"/></w:rPr><w:t>Large </w:t></w:r>"
        "<w:r><w:rPr><w:sz w:val=\"22\"/></w:rPr><w:t>Normal again</w:t></w:r>"
        "</w:p>"
    ))

    print(f"Generated {n} documents in {out_dir}")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "cases"
    gen_corpus(out)
