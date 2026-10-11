// wo-msbinary -- World-Office legacy binary format engine
//!
//! Pure Rust implementation of legacy Microsoft binary format parsers:
//! .doc (Word Binary), .xls (BIFF), .ppt (OLE compound).
//!
//! Replaces the C++ MsBinaryFile module (2,954 files).

pub mod biff8;
pub mod detector;
pub mod model;
pub mod ole;
pub mod ppt;
pub mod xlsb;
pub mod roundtrip;

pub use biff8::{parse_biff8_workbook, Biff8Cell, Biff8CellValue, Biff8Sheet, Biff8Workbook};

pub use detector::detect_binary_format;
pub use model::{BinaryFormat, MsBinaryDocument};
pub use ole::OleCompoundDoc;
pub use ppt::{parse_ppt_text, PptDocument, PptSlide};
pub use roundtrip::MsbinaryRoundtrip;
pub use xlsb::{parse_xlsb_sheet, parse_xlsb_sst, parse_xlsb_workbook, XlsbCell, XlsbCellValue};

pub const FORMAT_NAME: &str = "msbinary";
