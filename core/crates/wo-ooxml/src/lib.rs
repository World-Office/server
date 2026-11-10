// wo-ooxml -- World-Office OOXML format engine
//!
//! Pure Rust implementation of Office Open XML format parsing.
//! Supports DOCX, XLSX, PPTX (Office 2007+ formats).
//! OOXML is a ZIP-based XML format defined by ECMA-376/ISO 29500.

pub mod detector;
pub mod model;
pub mod parser;
pub mod roundtrip;
pub mod serializer;

#[cfg(test)]
mod style_chain_tests;

pub use model::builtin_theme_presets;
pub use model::{
    Bounds, ChartAxis, ChartAxisKind, ChartCategories, ChartDLbls, ChartErrBar, ChartExternalData,
    ChartLayout, ChartLegendNode, ChartMarker, ChartNode, ChartNumData, ChartNumPt, ChartPlot,
    ChartPlotKind, ChartPrintSettings, ChartScaling, ChartSeries, ChartSpace, ChartStrPt,
    ChartTitleNode, ChartTrendline, ColorScheme, ConnectorShape, ConnectorShapeType, EffectList,
    Fill, FontScheme, GradientFill, GradientKind, GradientStop, OoxmlDocument, OoxmlFormat,
    PictureShape, PlaceholderShape, PlotAreaNode, PptxPresentation, ShadowEffect, Slide,
    SlideLayout, SlideMaster, SlideShape, SlideSize, TableCell, TableColumn, TableRow, TableShape,
    TextBody, TextBoxShape, Theme, ThemeColor, ThemeFont, ThemePreset, XlsxBook, XlsxBrk,
    XlsxChartPart, XLSX_CHART_CONTENT_TYPE, XLSX_CHART_REL_TYPE, XlsxHeaderFooter, XlsxHyperlink,
    XlsxPageMargins, XlsxPageSetup, XlsxPrintSettings,
};
pub use parser::OoxmlParser;
pub use roundtrip::OoxmlRoundtrip;
pub use serializer::OoxmlSerializer;

pub const FORMAT_NAME: &str = "ooxml";

/// Check if data is an OOXML file (ZIP with [Content_Types].xml).
pub fn is_ooxml_file(data: &[u8]) -> bool {
    if data.len() < 4 || data[0] != 0x50 || data[1] != 0x4B {
        return false;
    }
    let cursor = std::io::Cursor::new(data);
    if let Ok(mut archive) = zip::ZipArchive::new(cursor) {
        if archive.by_name("[Content_Types].xml").is_ok() {
            return true;
        }
    }
    false
}
