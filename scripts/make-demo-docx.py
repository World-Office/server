#!/usr/bin/env python3
"""Build the World-Office demo.docx (showcase document).

Regenerates server/assets/demo.docx AND the EMBEDDED_DEMO_DOCX_BASE64 concat!
block in core/crates/wo-docserver/src/lib.rs from the same bytes, so the
image-baked copy and the embedded fallback can never drift.

Showcases what the stack provably supports (each item covered by a green
probe/unit test): headings, bold/italic runs, centered embedded PNG banner,
bullet list, table with header row, native page break — in German, since
the demo audience is German.
"""
import base64
import io
import re
import struct
import zipfile
import zlib
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
OUT = SERVER / "assets" / "demo.docx"
LIB = SERVER / "core" / "crates" / "wo-docserver" / "src" / "lib.rs"

NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

# Banner display size in EMU (960x240 px source shown at 576x144 px @96dpi).
BANNER_W_EMU = 5486400
BANNER_H_EMU = 1371600


def make_banner_png() -> bytes:
    """WO-branded banner: deep-blue ground, white title, accent rule."""
    from PIL import Image, ImageDraw, ImageFont

    W, H = 960, 240
    img = Image.new("RGB", (W, H), (23, 42, 72))
    d = ImageDraw.Draw(img)
    # accent bar + faint document glyphs
    d.rectangle([0, 0, W, 10], fill=(247, 148, 30))
    for i, (x, h) in enumerate([(64, 26), (64, 26), (64, 26)]):
        d.rounded_rectangle([x, 150 + i * 0, x + 420, 150 + 26], 6, fill=(255, 255, 255, 18))
    d.rounded_rectangle([640, 56, 896, 184], 12, fill=(38, 62, 98))
    d.rectangle([664, 84, 872, 92], fill=(247, 148, 30))
    d.rectangle([664, 108, 840, 116], fill=(255, 255, 255))
    d.rectangle([664, 132, 800, 140], fill=(255, 255, 255))

    font_paths = [
        "/usr/share/fonts/droid/DroidSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    font = None
    for p in font_paths:
        if Path(p).exists():
            font = ImageFont.truetype(p, 72)
            break
    if font is None:  # degrade: bitmap font, upscaled
        small = Image.new("RGB", (W // 4, H // 4), (23, 42, 72))
        ImageDraw.Draw(small).text((16, 24), "World Office", fill=(255, 255, 255))
        img = small.resize((W, H), Image.NEAREST)
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return buf.getvalue()
    d.text((64, 56), "World Office", font=font, fill=(255, 255, 255))
    sub = ImageFont.truetype(font_paths[0], 28) if Path(font_paths[0]).exists() else font
    d.text((66, 152), "Dokumente bearbeiten — überall, gemeinsam, im Browser",
           font=sub, fill=(200, 212, 230))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF


BULLETS = "\n".join(
    f'<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
    f'<w:r><w:t>{t}</w:t></w:r></w:p>'
    for t in [
        "DOCX, XLSX und PPTX — lesen und schreiben mit dem OOXML-Core",
        "Reader für Word-2003-XML, RTF, ODT, EPUB und FB2",
        "DOCX-nach-PDF-Export (%PDF-1.7) mit seitengetreuem Layout",
        "WOPI-Co-Authoring und ein Agent-Kommandobus",
    ]
)

ROWS = "\n".join(
    "<w:tr>"
    + "".join(f"<w:tc><w:tcPr/><w:p><w:r><w:t>{c}</w:t></w:r></w:p></w:tc>" for c in row)
    + "</w:tr>"
    for row in [
        ["Format", "Richtung", "Vertrag"],
        ["DOCX", "lesen + schreiben", "F-1xx"],
        ["XLSX", "lesen + schreiben", "F-2xx"],
        ["PPTX", "lesen + schreiben", "F-3xx"],
        ["PDF", "Export", "F-403"],
    ]
)

BANNER_XML = f"""<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<wp:extent cx="{BANNER_W_EMU}" cy="{BANNER_H_EMU}"/><wp:docPr id="1" name="Banner" descr="World Office Banner"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="1" name="Banner"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{BANNER_W_EMU}" cy="{BANNER_H_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>Abbildung 1: World Office — das komplette Office im Browser.</w:t></w:r></w:p>"""

DOCUMENT = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document {NS} {R_NS}>
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Willkommen bei World Office</w:t></w:r></w:p>
    <w:p><w:r><w:t>Dieses Beispieldokument zeigt, was die Editier- und Konvertierungspipeline kann: </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>fette</w:t></w:r><w:r><w:t> und </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>kursive</w:t></w:r><w:r><w:t> Textpassagen, ein eingebettetes Bild, eine Liste, eine Tabelle mit Kopfzeile und einen echten Seitenumbruch.</w:t></w:r></w:p>
    {BANNER_XML}
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Fähigkeiten im Überblick</w:t></w:r></w:p>
    {BULLETS}
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Formatmatrix</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders/></w:tblPr><w:tblGrid><w:gridCol/><w:gridCol/><w:gridCol/></w:tblGrid>
      <w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:shd w:val="clear" w:fill="D9E2F3"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Format</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:shd w:val="clear" w:fill="D9E2F3"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Richtung</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:shd w:val="clear" w:fill="D9E2F3"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Vertrag</w:t></w:r></w:p></w:tc></w:tr>
      {ROWS}
    </w:tbl>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Seite zwei</w:t></w:r></w:p>
    <w:p><w:r><w:t>Die Überschrift oben beginnt eine neue Seite — Paginierung, Shared Strings und Einheitenkonvertierung folgen den OO-Core-Verträgen.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bearbeiten Sie dieses Dokument einfach weiter und speichern Sie: Der Server konvertiert alles zurück nach DOCX — inklusive Bild und Tabelle.</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>"""

STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {NS}>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="17324F"/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="17324F"/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>"""

NUMBERING = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering {NS}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>"""


def build() -> bytes:
    banner = make_banner_png()
    ct = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="png" ContentType="image/png"/>'
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
        '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/banner.png"/>'
        "</Relationships>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", DOCUMENT)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/numbering.xml", NUMBERING)
        z.writestr("word/media/banner.png", banner)
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
