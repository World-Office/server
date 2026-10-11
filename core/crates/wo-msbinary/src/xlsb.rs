//! Minimal XLSB (BIFF12, Excel Binary Workbook) sheet-data reader.
//!
//! XLSB is a ZIP package whose binary parts (`xl/workbook.bin`,
//! `xl/sharedStrings.bin`, `xl/worksheets/sheetN.bin`) contain a stream of
//! length-prefixed records:
//!
//! ```text
//! record = recType (1-2 bytes) recLen (1-4 bytes varint) data ;
//! ```
//!
//! The record type is a 14-bit value: one byte for types < 0x80, otherwise
//! two bytes `(b0 & 0x7F) | ((b1 & 0x7F) << 7)`. The record length is a
//! little-endian base-128 varint (up to 4 bytes).
//!
//! This module implements the minimal record set needed to read cell
//! values from typical XLSB files: BrtBundleSh (sheet name + rId),
//! BrtBeginSst/BrtSSTItem (shared strings), BrtRowHdr + BrtCellIsst /
//! BrtCellReal / BrtCellRk / BrtCellSt / BrtCellBool / BrtCellError and
//! BrtEndSheetData, a BrtWsDim helper. Unknown records are skipped by their
//! length, which is lossless for parsing.
//!
//! Caller (wo-x2t converter) handles the ZIP container + document rels.
//!
//! Scope note (F-209): read-only, value-level. Formulas are returned as
//! their cached result; formatting/pivots/charts are out of scope for this
//! minimal reader.

/// A cell value resolved from an XLSB sheet part.
#[derive(Debug, Clone, PartialEq)]
pub enum XlsbCellValue {
    /// Shared-string or inline text, resolved by the reader.
    Text(String),
    /// IEEE-754 double (BrtCellReal) or RK-encoded number.
    Number(f64),
    Bool(bool),
    /// Formula cached string result.
    CachedString(String),
    /// BIFF error code (e.g. 0x1F = #VALUE!).
    Err(u8),
    Blank,
}

/// One non-empty cell read from a sheet part; rows/cols are 0-based.
#[derive(Debug, Clone, PartialEq)]
pub struct XlsbCell {
    pub row: u32,
    pub col: u32,
    pub value: XlsbCellValue,
}

/// A sheet discovered in `xl/workbook.bin`.
#[derive(Debug, Clone, PartialEq)]
pub struct XlsbSheet {
    /// Sheet display name (from BrtBundleSh strName).
    pub name: String,
    /// Relationship id (e.g. "rId1") used to resolve the sheet part.
    pub rel_id: String,
    /// Sheets are order-stable by appearance in workbook.bin.
    pub index: usize,
}

/// Parse `xl/workbook.bin` for sheet names + relationship ids.
pub fn parse_xlsb_workbook(stream: &[u8]) -> Result<Vec<XlsbSheet>, String> {
    let mut sheets = Vec::new();
    let mut iter = RecordIter::new(stream);
    while let Some(rec) = iter.next() {
        if rec.ty == 0x90 {
            // BrtEndBundleShs — first sheet block wins (files may carry
            // a second, update-state copy of the workbook tree).
            break;
        }
        if rec.ty == 0x9C {
            // BrtBundleSh: hsState(4) iTabID(4) strRelID strName
            let mut r = Cursor::new(rec.data);
            r.skip(8).ok_or("bundle short")?;
            let rel_id = r.xl_string().ok_or("bad rel id")?;
            let name = r.xl_string().ok_or("bad name")?;
            sheets.push(XlsbSheet {
                name,
                rel_id,
                index: sheets.len(),
            });
        }
    }
    Ok(sheets)
}

/// Parse `xl/sharedStrings.bin` into the ordered string table.
pub fn parse_xlsb_sst(stream: &[u8]) -> Vec<String> {
    let mut strings = Vec::new();
    let mut iter = RecordIter::new(stream);
    while let Some(rec) = iter.next() {
        if rec.ty == 0x13 {
            // BrtSSTItem: fRichStr/fExtStr byte, then XLWideString (cch u32 + utf16)
            let mut r = Cursor::new(rec.data);
            r.skip(1); // flags
            if let Some(s) = r.xl_string() {
                strings.push(s);
            }
        }
    }
    strings
}

/// Parse one `xl/worksheets/sheetN.bin` part. `sst` resolves BrtCellIsst
/// and cached formula string indices; pass empty vec when absent.
pub fn parse_xlsb_sheet(stream: &[u8], sst: &[String]) -> Vec<XlsbCell> {
    let mut cells = Vec::new();
    let mut iter = RecordIter::new(stream);
    let mut row = 0u32;
    while let Some(rec) = iter.next() {
        match rec.ty {
            0x0000 => {
                // BrtRowHdr: rw(4) ...
                if rec.data.len() >= 4 {
                    row = u32::from_le_bytes([rec.data[0], rec.data[1], rec.data[2], rec.data[3]]);
                }
            }
            // BrtEndSheetData — stop at the first sheet-data block so update
            // copies appended by the producer are ignored (matches pyxlsb).
            0x0092 => break,
            // BrtCellIsst
            0x0007 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(idx)) = (r.u32(), r.u32(), r.u32()) {
                    let v = sst.get(idx as usize).cloned().unwrap_or_default();
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::Text(v),
                    });
                }
            }
            // BrtCellReal
            0x0005 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(f)) = (r.u32(), r.u32(), r.f64()) {
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::Number(f),
                    });
                }
            }
            // BrtCellRk
            0x0002 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(enc)) = (r.u32(), r.u32(), r.u32()) {
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::Number(decode_rk(enc).0),
                    });
                }
            }
            // BrtCellSt (inline string)
            0x0006 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(s)) = (r.u32(), r.u32(), r.xl_string()) {
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::Text(s),
                    });
                }
            }
            // BrtCellBool
            0x0004 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(b)) = (r.u32(), r.u32(), r.byte()) {
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::Bool(b != 0),
                    });
                }
            }
            // BrtCellError
            0x0003 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(b)) = (r.u32(), r.u32(), r.byte()) {
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::Err(b),
                    });
                }
            }
            // BrtFmlaString: cached string result
            0x0008 => {
                let mut r = Cursor::new(rec.data);
                if let (Some(col), Some(_), Some(s)) = (r.u32(), r.u32(), r.xl_string()) {
                    cells.push(XlsbCell {
                        row,
                        col,
                        value: XlsbCellValue::CachedString(s),
                    });
                }
            }
            _ => {}
        }
    }
    cells
}

/// One decoded record.
struct Record<'a> {
    ty: u16,
    data: &'a [u8],
}

/// Iterate a BIFF12 record stream, skipping unknown records by length.
struct RecordIter<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> RecordIter<'a> {
    fn new(data: &'a [u8]) -> Self {
        RecordIter { data, pos: 0 }
    }
    fn next(&mut self) -> Option<Record<'a>> {
        let d = &self.data[self.pos..];
        let (ty, used) = read_rec_type(d)?;
        let (len, lused) = read_rec_len(&d[used..])?;
        let start = used + lused;
        let end = start + len;
        if end > d.len() {
            return None;
        }
        self.pos += start + len;
        Some(Record {
            ty,
            data: &d[start..end],
        })
    }
}

/// Read a record type (1 or 2 bytes; 14-bit value).
fn read_rec_type(d: &[u8]) -> Option<(u16, usize)> {
    let b0 = *d.first()?;
    if b0 & 0x80 == 0 {
        return Some((b0 as u16, 1));
    }
    let b1 = *d.get(1)?;
    let ty = ((b0 & 0x7F) as u16) | (((b1 & 0x7F) as u16) << 7);
    Some((ty, 2))
}

/// Read a record length (1-4 bytes, base-128 little-endian varint).
fn read_rec_len(d: &[u8]) -> Option<(usize, usize)> {
    let mut value = 0usize;
    let mut shift = 0;
    let mut used = 0;
    for _ in 0..4 {
        let b = *d.get(used)?;
        used += 1;
        value |= ((b & 0x7F) as usize) << shift;
        if b & 0x80 == 0 {
            return Some((value, used));
        }
        shift += 7;
    }
    None
}

/// Byte cursor with fixed-endian readers plus XLWideString.
struct Cursor<'a> {
    data: &'a [u8],
    off: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Cursor { data, off: 0 }
    }
    fn skip(&mut self, n: usize) -> Option<()> {
        if self.off + n > self.data.len() {
            return None;
        }
        self.off += n;
        Some(())
    }
    fn u32(&mut self) -> Option<u32> {
        if self.off + 4 > self.data.len() {
            return None;
        }
        let v = u32::from_le_bytes([
            self.data[self.off],
            self.data[self.off + 1],
            self.data[self.off + 2],
            self.data[self.off + 3],
        ]);
        self.off += 4;
        Some(v)
    }
    fn f64(&mut self) -> Option<f64> {
        if self.off + 8 > self.data.len() {
            return None;
        }
        let mut b = [0u8; 8];
        b.copy_from_slice(&self.data[self.off..self.off + 8]);
        self.off += 8;
        Some(f64::from_le_bytes(b))
    }
    fn byte(&mut self) -> Option<u8> {
        let b = *self.data.get(self.off)?;
        self.off += 1;
        Some(b)
    }
    /// XLWideString: cch (u32) + cch UTF-16LE code units.
    fn xl_string(&mut self) -> Option<String> {
        let cch = self.u32()? as usize;
        if self.off + cch * 2 > self.data.len() {
            return None;
        }
        let bytes = &self.data[self.off..self.off + cch * 2];
        self.off += cch * 2;
        let s: String = bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| {
                let u = u16::from_le_bytes([c[0], c[1]]);
                char::from_u32(u as u32).unwrap_or('\u{FFFD}')
            })
            .collect();
        Some(s)
    }
}

/// Decode an RK number (BIFF11/BIFF12 share the BIFF8 RK layout).
fn decode_rk(enc: u32) -> (f64, bool) {
    let is_int = enc & 0x02 != 0;
    let div100 = enc & 0x01 != 0;
    if is_int {
        let i = ((enc >> 2) as i32) as f64;
        (if div100 { i / 100.0 } else { i }, true)
    } else {
        let half = enc & 0xFFFF_FFFC;
        let d = f64::from_bits((half as u64) << 32);
        (if div100 { d / 100.0 } else { d }, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enc_id(v: u16) -> Vec<u8> {
        if v < 0x80 {
            vec![v as u8]
        } else {
            vec![(v & 0x7F) as u8 | 0x80, (v >> 7) as u8]
        }
    }

    fn enc_len(mut n: usize) -> Vec<u8> {
        let mut out = Vec::new();
        loop {
            let b = (n & 0x7F) as u8;
            n >>= 7;
            if n != 0 {
                out.push(b | 0x80);
            } else {
                out.push(b);
                break;
            }
        }
        out
    }

    fn rec(ty: u16, data: &[u8]) -> Vec<u8> {
        let mut v = enc_id(ty);
        v.extend(enc_len(data.len()));
        v.extend(data);
        v
    }

    fn xlws(s: &str) -> Vec<u8> {
        let mut v = (s.encode_utf16().count() as u32).to_le_bytes().to_vec();
        for u in s.encode_utf16() {
            v.extend(u.to_le_bytes());
        }
        v
    }

    #[test]
    fn workbook_lists_sheets() {
        let mut wb = rec(0x83, b""); // BeginBook
        wb.extend(rec(0x8F, b"")); // BeginBundleShs
        let mut b1 = 0u32.to_le_bytes().to_vec();
        b1.extend(0u32.to_le_bytes());
        b1.extend(xlws("rId1"));
        b1.extend(xlws("Names"));
        wb.extend(rec(0x9C, &b1));
        let mut b2 = 0u32.to_le_bytes().to_vec();
        b2.extend(0u32.to_le_bytes());
        b2.extend(xlws("rId2"));
        b2.extend(xlws("Data"));
        wb.extend(rec(0x9C, &b2));
        wb.extend(rec(0x90, b""));
        wb.extend(rec(0x84, b""));

        let sheets = parse_xlsb_workbook(&wb).unwrap();
        assert_eq!(sheets.len(), 2);
        assert_eq!(sheets[0].name, "Names");
        assert_eq!(sheets[0].rel_id, "rId1");
        assert_eq!(sheets[1].name, "Data");
        assert_eq!(sheets[1].rel_id, "rId2");
    }

    #[test]
    fn sst_reads_strings() {
        let mut sst = rec(0x9F, &[0, 0, 0, 0, 2, 0, 0, 0]); // BeginSst
        let mut item = vec![0u8]; // flags
        item.extend(xlws("Hello"));
        sst.extend(rec(0x13, &item));
        let mut item2 = vec![0u8];
        item2.extend(xlws("Wörld"));
        sst.extend(rec(0x13, &item2));
        sst.extend(rec(0xA0, b""));

        assert_eq!(parse_xlsb_sst(&sst), vec!["Hello", "Wörld"]);
    }

    #[test]
    fn sheet_reads_cells_with_shared_strings() {
        let sst = vec!["Alpha".to_string(), "Beta".to_string()];
        let mut sh = rec(0x94, &[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]); // WsDim
        sh.extend(rec(0x91, b"")); // BeginSheetData
        // row 0
        let mut r0 = 0u32.to_le_bytes().to_vec();
        r0.extend(vec![0u8; 14]);
        sh.extend(rec(0x0000, &r0));
        let mut c0 = 0u32.to_le_bytes().to_vec();
        c0.extend(0u32.to_le_bytes());
        c0.extend(0u32.to_le_bytes()); // isst idx 0
        sh.extend(rec(0x0007, &c0));
        // row 1
        let mut r1 = 1u32.to_le_bytes().to_vec();
        r1.extend(vec![0u8; 14]);
        sh.extend(rec(0x0000, &r1));
        let mut c1 = 1u32.to_le_bytes().to_vec();
        c1.extend(0u32.to_le_bytes());
        c1.extend(1u8.to_le_bytes()); // bool true
        sh.extend(rec(0x0004, &c1));
        let mut c2 = 0u32.to_le_bytes().to_vec();
        c2.extend(0u32.to_le_bytes());
        c2.extend((42u32 << 2 | 2).to_le_bytes()); // rk=42
        sh.extend(rec(0x0002, &c2));
        sh.extend(rec(0x92, b""));

        let cells = parse_xlsb_sheet(&sh, &sst);
        assert_eq!(cells.len(), 3);
        assert_eq!(cells[0].row, 0);
        assert_eq!(cells[0].col, 0);
        assert_eq!(cells[0].value, XlsbCellValue::Text("Alpha".into()));
        assert_eq!(cells[1].value, XlsbCellValue::Bool(true));
        assert_eq!(cells[2].value, XlsbCellValue::Number(42.0));
    }

    #[test]
    fn real_fixture_roundtrip() {
        // data.xlsb built by python + pyxlsb, in repo fixtures dir.
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../wo-x2t/tests/fixtures/legacy-data.xlsb"
        );
        let data = std::fs::read(path).unwrap();
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(data)).unwrap();
        let read = |zip: &mut zip::ZipArchive<_>, name: &str| -> Vec<u8> {
            let mut f = zip.by_name(name).unwrap();
            let mut v = Vec::new();
            std::io::Read::read_to_end(&mut f, &mut v).unwrap();
            v
        };
        let wb = read(&mut zip, "xl/workbook.bin");
        let sheets = parse_xlsb_workbook(&wb).unwrap();
        assert_eq!(sheets.len(), 2);
        assert_eq!(sheets[0].name, "Names");
        assert_eq!(sheets[1].name, "Data");
        let sst = parse_xlsb_sst(&read(&mut zip, "xl/sharedStrings.bin"));
        assert_eq!(sst, vec!["Name", "Score", "Alpha", "Beta", "Gamma"]);

        let s1 = parse_xlsb_sheet(&read(&mut zip, "xl/worksheets/sheet1.bin"), &sst);
        fn get<'a>(cells: &'a [XlsbCell], r: u32, c: u32) -> &'a XlsbCellValue {
            &cells
                .iter()
                .find(|x| x.row == r && x.col == c)
                .unwrap()
                .value
        }
        // rows are 0-based here
        assert_eq!(get(&s1, 0, 0), &XlsbCellValue::Text("Name".into()));
        assert_eq!(get(&s1, 0, 1), &XlsbCellValue::Text("Score".into()));
        assert_eq!(get(&s1, 1, 0), &XlsbCellValue::Text("Alpha".into()));
        let f = get(&s1, 1, 1);
        match f {
            XlsbCellValue::Number(n) => assert!((n - 42.5).abs() < 1e-9),
            other => panic!("expected number, got {other:?}"),
        }
        assert_eq!(get(&s1, 2, 0), &XlsbCellValue::Text("Beta".into()));
        match get(&s1, 2, 1) {
            XlsbCellValue::Number(n) => assert!((n - 42.0).abs() < 1e-9),
            other => panic!("expected number 42, got {other:?}"),
        }

        let s2 = parse_xlsb_sheet(&read(&mut zip, "xl/worksheets/sheet2.bin"), &sst);
        assert_eq!(get(&s2, 0, 0), &XlsbCellValue::Text("Gamma".into()));
        assert_eq!(get(&s2, 0, 1), &XlsbCellValue::Bool(true));
        assert_eq!(get(&s2, 1, 0), &XlsbCellValue::Text("Name".into()));
        assert_eq!(get(&s2, 1, 1), &XlsbCellValue::Err(0x1F));
    }
}
