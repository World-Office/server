#!/usr/bin/env python3
"""Build the World-Office demo.docx (showcase document).

Regenerates server/assets/demo.docx AND the EMBEDDED_DEMO_DOCX_BASE64 concat!
block in core/crates/wo-docserver/src/lib.rs from the same bytes, so the
image-baked copy and the embedded fallback can never drift.

Showcases what the stack provably supports today (each item is covered by a
green probe/unit test): headings, bold/italic runs, bullet list, table,
page break, hyperlink-free plain paragraphs, and is round-trip verified via
the wo-x2t parser (docx->txt / docx->pdf) by scripts after generation.
"""
import base64
import re
import zipfile
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
OUT = SERVER / "assets" / "demo.docx"
LIB = SERVER / "core" / "crates" / "wo-docserver" / "src" / "lib.rs"

NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

BULLETS = "\n".join(
    f'<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
    f'<w:r><w:t>{t}</w:t></w:r></w:p>'
    for t in [
        "DOCX, XLSX and PPTX read/write with the OOXML core",
        "Word 2003 XML, RTF, ODT, EPUB and FB2 readers",
        "DOCX to PDF export (%PDF-1.7) and page-faithful layout",
        "WOPI co-authoring and an agent command bus",
    ]
)

ROWS = "\n".join(
    "<w:tr>"
    + "".join(f"<w:tc><w:tcPr/><w:p><w:r><w:t>{c}</w:t></w:r></w:p></w:tc>" for c in row)
    + "</w:tr>"
    for row in [
        ["Format", "Direction", "Contract"],
        ["DOCX", "read + write", "F-1xx"],
        ["XLSX", "read + write", "F-2xx"],
        ["PPTX", "read + write", "F-3xx"],
    ]
)

DOCUMENT = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document {NS}>
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Welcome to World Office</w:t></w:r></w:p>
    <w:p><w:r><w:t>This demo document exercises the editing and conversion stack: </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t> and </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r><w:r><w:t> runs, a bullet list, a table and a page break (pageBreakBefore).</w:t></w:r></w:p>
    {BULLETS}
    <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders/></w:tblPr><w:tblGrid><w:gridCol/><w:gridCol/><w:gridCol/></w:tblGrid>{ROWS}</w:tbl>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t>Page two</w:t></w:r></w:p>
    <w:p><w:r><w:t>The heading above starts a fresh page — pagination, shared strings and unit conversion all follow the OO core contracts.</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:tw="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>"""

STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {NS}>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>"""

NUMBERING = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering {NS}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>"""


def build() -> bytes:
    ct = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
        "</Relationships>"
    )
    import io

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", DOCUMENT)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/numbering.xml", NUMBERING)
    return buf.getvalue()


def update_embedded(data: bytes) -> None:
    b64 = base64.b64encode(data).decode()
    lines = ['    "' + b64[i:i + 72] + '",' for i in range(0, len(b64), 72)]
    block = "const EMBEDDED_DEMO_DOCX_BASE64: &str = concat!(\n" + "\n".join(lines) + "\n);"
    src = LIB.read_text()
    new, n = re.subn(
        r"const EMBEDDED_DEMO_DOCX_BASE64: &str = concat!\((?:.|\n)*?\n\);",
        block,
        src,
        count=1,
    )
    assert n == 1, "EMBEDDED_DEMO_DOCX_BASE64 block not found"
    LIB.write_text(new)
    print(f"lib.rs embedded block updated ({len(lines)} lines)")


if __name__ == "__main__":
    data = build()
    OUT.write_bytes(data)
    print(f"wrote {OUT} ({len(data)} bytes)")
    update_embedded(data)
