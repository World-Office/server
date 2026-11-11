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
    apply_scheme_color_transforms, AnimationData, Bounds, ChartAxis, ChartAxisKind,
    ChartCategories, ChartDLbls, ChartErrBar, ChartExternalData, ChartLayout, ChartLegendNode,
    ChartMarker, ChartNode, ChartNumData, ChartNumPt, ChartPlot, ChartPlotKind, ChartPrintSettings,
    ChartScaling, ChartSeries, ChartSpace, ChartStrPt, ChartTitleNode, ChartTrendline, ClrMap,
    ColorScheme, ConnectorShape, ConnectorShapeType, DocxProtection, DocxSettings, EffectList,
    Fill, FmtScheme, FontScheme, GradientFill, GradientKind, GradientStop, OoxmlDocument,
    OoxmlFormat, PictureShape, PlaceholderShape, PptxPresentation, PptxStyleReference,
    PptxTableStyle, PptxTableStyleBorder, PptxTableStylePart, PptxTableStyles, SchemeClr,
    SchemeClrTransform, ShadowEffect, Slide, SlideBodyProperties, SlideLayout, SlideMaster,
    SlideParagraph, SlideShape, SlideSize, SlideTextBody, SlideTextFit, TableCell, TableColumn,
    TableRow, TableShape, TextBody, TextBoxShape, TextBullet, Theme, ThemeColor, ThemeColorRef,
    ThemeEffectStyle, ThemeFillStyle, ThemeFont, ThemeGradientStop, ThemeLineStyle, ThemePreset,
    ThemeSystemColor, TimeNode, TimingCondition, TimingTree, XlsxBook, XlsxBrk, XlsxCfColor,
    XlsxCfvo, XlsxChartPart, XlsxColorScale, XlsxConditionalFormatKind, XlsxConditionalFormatRule,
    XlsxConditionalFormatting, XlsxDataBar, XlsxDxf, XlsxDynamicArray, XlsxFileSharing,
    XlsxHeaderFooter, XlsxHyperlink, XlsxIconSet, XlsxMetadata, XlsxMetadataRecord,
    XlsxPageMargins, XlsxPageSetup, XlsxPrintSettings, XlsxRichValue, XlsxRichValueRecord,
    XlsxRichValueRef, XlsxWorkbookProtection, XLSX_CHART_CONTENT_TYPE, XLSX_CHART_REL_TYPE,
    XLSX_RICH_VALUE_CONTENT_TYPE,
};
pub use parser::OoxmlParser;
pub use roundtrip::OoxmlRoundtrip;
pub use serializer::OoxmlSerializer;

pub use detector::{is_flat_opc_docx, is_ooxml};

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
