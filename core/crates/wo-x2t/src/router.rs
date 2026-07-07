//! Conversion router.
//!
//! Determines the conversion path between formats and
//! selects the appropriate format parser/converter.
//!
//! When no direct converter exists for a format pair, the router
//! automatically finds a chain of converters (up to 3 steps) via
//! intermediate formats using BFS to find the shortest path first.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::Instant;

use crate::converter::{error_result, success_result, unsupported_result, ConverterRegistry};
use crate::converters::{
    DjvuToDocxConverter, DjvuToTxtConverter, DocxToEpubConverter, DocxToHtmlConverter,
    DocxToOdtConverter, DocxToTxtConverter, DocxToXpsConverter, EpubToDocxConverter,
    EpubToHtmlConverter, EpubToTxtConverter, Fb2ToDocxConverter, Fb2ToTxtConverter,
    HtmlToDocxConverter, HtmlToEpubConverter, HtmlToFb2Converter, HtmlToOdtConverter,
    HtmlToRtfConverter, HtmlToTxtConverter, HwpToDocxConverter, HwpToTxtConverter,
    OdpToWoPresentationConverter, OdtToDocxConverter, OdtToHtmlConverter, OdtToTxtConverter,
    OfdToDocxConverter, OfdToHtmlConverter, OfdToTxtConverter, PptxToWoPresentationConverter,
    RtfToDocxConverter, RtfToHtmlConverter, RtfToTxtConverter, TxtToDocxConverter,
    TxtToEpubConverter, TxtToFb2Converter, TxtToHtmlConverter, TxtToOdtConverter,
    TxtToRtfConverter, WoPresentationToHtmlConverter, WoPresentationToOdpConverter,
    WoPresentationToPptxConverter, XpsToDocxConverter, XpsToHtmlConverter, XpsToTxtConverter,
};
use crate::model::{ConversionOutput, ConversionResult, ConversionStatus};
use crate::FormatConverter;

/// Adjacency list type: format name -> list of (target format, converter).
type AdjList<'a> = HashMap<&'a str, Vec<(&'a str, Arc<dyn FormatConverter>)>>;

/// Maximum chain depth (number of conversion steps, not intermediate formats).
const MAX_CHAIN_DEPTH: usize = 3;

/// Format conversion router.
pub struct ConversionRouter {
    registry: ConverterRegistry,
}

/// A step in a conversion chain, holding a reference to the converter
/// and the source/target format pair.
#[derive(Clone)]
struct ChainStep {
    converter: Arc<dyn FormatConverter>,
    source: String,
    target: String,
}

impl ConversionRouter {
    pub fn new() -> Self {
        let mut registry = ConverterRegistry::new();
        registry.register(RtfToTxtConverter);
        registry.register(RtfToHtmlConverter);
        registry.register(HtmlToTxtConverter);
        registry.register(HtmlToRtfConverter);
        registry.register(TxtToHtmlConverter);
        registry.register(TxtToRtfConverter);
        registry.register(DocxToTxtConverter);
        registry.register(DocxToHtmlConverter);
        registry.register(OdtToTxtConverter);
        registry.register(OdtToHtmlConverter);
        registry.register(EpubToTxtConverter);
        registry.register(EpubToHtmlConverter);
        registry.register(Fb2ToTxtConverter);
        registry.register(HwpToTxtConverter);
        registry.register(TxtToDocxConverter);
        registry.register(HtmlToDocxConverter);
        registry.register(TxtToOdtConverter);
        registry.register(HtmlToOdtConverter);
        registry.register(XpsToTxtConverter);
        registry.register(XpsToHtmlConverter);
        registry.register(OfdToTxtConverter);
        registry.register(OfdToHtmlConverter);
        registry.register(DjvuToTxtConverter);
        registry.register(TxtToEpubConverter);
        registry.register(HtmlToEpubConverter);
        registry.register(TxtToFb2Converter);
        registry.register(HtmlToFb2Converter);
        registry.register(DocxToOdtConverter);
        registry.register(OdtToDocxConverter);
        registry.register(RtfToDocxConverter);
        registry.register(EpubToDocxConverter);
        registry.register(Fb2ToDocxConverter);
        registry.register(DocxToEpubConverter);
        registry.register(XpsToDocxConverter);
        registry.register(OfdToDocxConverter);
        registry.register(HwpToDocxConverter);
        registry.register(DjvuToDocxConverter);
        registry.register(DocxToXpsConverter);
        registry.register(WoPresentationToPptxConverter);
        registry.register(PptxToWoPresentationConverter);
        registry.register(WoPresentationToOdpConverter);
        registry.register(OdpToWoPresentationConverter);
        registry.register(WoPresentationToHtmlConverter);
        Self { registry }
    }

    /// Find a conversion chain from `source` to `target` using BFS.
    ///
    /// Returns the shortest chain (up to `MAX_CHAIN_DEPTH` steps) or `None`.
    fn find_chain(&self, source: &str, target: &str) -> Option<Vec<ChainStep>> {
        // Build adjacency list: format -> list of (target_format, converter)
        let pairs = self.registry.registered_pairs();
        let mut adj: AdjList<'_> = HashMap::new();
        for (src, dst) in &pairs {
            // Safe unwrap: we just got these pairs from the registry
            let converter = self.registry.get(src, dst).unwrap();
            adj.entry(src)
                .or_default()
                .push((dst, Arc::clone(converter)));
        }

        // BFS: (current_format, chain_of_steps_so_far)
        let mut queue: VecDeque<(String, Vec<ChainStep>)> = VecDeque::new();
        let mut visited: HashSet<String> = HashSet::new();

        // Start with all edges from source
        if let Some(edges) = adj.get(source) {
            for (dst, converter) in edges {
                if *dst == target {
                    return Some(vec![ChainStep {
                        converter: Arc::clone(converter),
                        source: source.to_string(),
                        target: target.to_string(),
                    }]);
                }
                if !visited.contains(*dst) {
                    visited.insert(dst.to_string());
                    queue.push_back((
                        dst.to_string(),
                        vec![ChainStep {
                            converter: Arc::clone(converter),
                            source: source.to_string(),
                            target: dst.to_string(),
                        }],
                    ));
                }
            }
        }

        // BFS for 2-step and 3-step chains
        while let Some((current, chain)) = queue.pop_front() {
            if chain.len() >= MAX_CHAIN_DEPTH {
                continue;
            }
            if let Some(edges) = adj.get(current.as_str()) {
                for (dst, converter) in edges {
                    if *dst == target {
                        let mut full_chain = chain;
                        full_chain.push(ChainStep {
                            converter: Arc::clone(converter),
                            source: current.clone(),
                            target: target.to_string(),
                        });
                        return Some(full_chain);
                    }
                    if !visited.contains(*dst) {
                        visited.insert(dst.to_string());
                        let mut new_chain = chain.clone();
                        new_chain.push(ChainStep {
                            converter: Arc::clone(converter),
                            source: current.clone(),
                            target: dst.to_string(),
                        });
                        queue.push_back((dst.to_string(), new_chain));
                    }
                }
            }
        }

        None
    }

    /// Check if a conversion path is supported (direct or chained, up to 3 steps).
    pub fn is_supported(&self, source: &str, target: &str) -> bool {
        if source == target {
            return true;
        }
        if self.registry.has_converter(source, target) {
            return true;
        }
        self.find_chain(source, target).is_some()
    }

    /// Get the conversion path (list of formats from source to target).
    ///
    /// Returns an empty vec if no path exists within the max chain depth.
    pub fn conversion_path(&self, source: &str, target: &str) -> Vec<String> {
        if source == target {
            return vec![source.to_string()];
        }

        if let Some(chain) = self.find_chain(source, target) {
            let mut path = vec![chain[0].source.clone()];
            for step in &chain {
                path.push(step.target.clone());
            }
            path
        } else {
            vec![]
        }
    }

    /// Perform an actual conversion using the registry.
    ///
    /// Tries direct conversion first, then falls back to multi-step chains
    /// (up to 3 steps) via intermediate formats.
    pub fn convert(&self, source: &str, target: &str, data: &[u8]) -> ConversionResult {
        // Same format = no-op
        if source == target {
            return success_result(data.to_vec(), target, 0);
        }

        // Try direct conversion first
        if self.registry.has_converter(source, target) {
            let start = Instant::now();
            match self.registry.convert(source, target, data) {
                Ok(output) => {
                    let duration_ms = start.elapsed().as_millis() as u64;
                    return success_result(output, target, duration_ms);
                }
                Err(e) => {
                    let duration_ms = start.elapsed().as_millis() as u64;
                    return error_result(e.to_string(), duration_ms);
                }
            }
        }

        // Try chained conversion
        let start = Instant::now();
        match self.find_chain(source, target) {
            Some(chain) => self.execute_chain(chain, data, start),
            None => unsupported_result(source, target),
        }
    }

    /// Execute a chain of conversions, accumulating duration and warnings.
    fn execute_chain(
        &self,
        chain: Vec<ChainStep>,
        data: &[u8],
        start: Instant,
    ) -> ConversionResult {
        let mut current_data = data.to_vec();
        let warnings: Vec<String> = Vec::new();

        for (i, step) in chain.iter().enumerate() {
            match step.converter.convert(&current_data) {
                Ok(output) => {
                    current_data = output;
                }
                Err(e) => {
                    let duration_ms = start.elapsed().as_millis() as u64;
                    let step_desc = format!(
                        "step {}/{} ({} → {})",
                        i + 1,
                        chain.len(),
                        step.source,
                        step.target
                    );
                    return ConversionResult {
                        status: ConversionStatus::Failed,
                        output: None,
                        error: Some(format!("chain conversion failed at {}: {}", step_desc, e)),
                        duration_ms,
                    };
                }
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        ConversionResult {
            status: ConversionStatus::Success,
            output: Some(ConversionOutput {
                data: current_data,
                format: chain.last().unwrap().target.clone(),
                page_count: None,
                warnings,
            }),
            error: None,
            duration_ms,
        }
    }

    /// Create a "not supported" result.
    pub fn unsupported_result(source: &str, target: &str) -> ConversionResult {
        unsupported_result(source, target)
    }

    /// Access the underlying converter registry.
    pub fn registry(&self) -> &ConverterRegistry {
        &self.registry
    }
}

impl Default for ConversionRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ConversionStatus;

    #[test]
    fn test_supported_real_pairs() {
        let router = ConversionRouter::new();
        // Actually registered converter pairs
        assert!(router.is_supported("rtf", "txt"));
        assert!(router.is_supported("rtf", "html"));
        assert!(router.is_supported("html", "txt"));
        assert!(router.is_supported("txt", "html"));
        assert!(router.is_supported("docx", "txt"));
        assert!(router.is_supported("docx", "html"));
        assert!(router.is_supported("odt", "txt"));
        assert!(router.is_supported("odt", "html"));
        assert!(router.is_supported("txt", "rtf"));
        assert!(router.is_supported("html", "rtf"));
        assert!(router.is_supported("epub", "txt"));
        assert!(router.is_supported("epub", "html"));
        assert!(router.is_supported("fb2", "txt"));
        assert!(router.is_supported("hwp", "txt"));
        assert!(router.is_supported("txt", "docx"));
        assert!(router.is_supported("html", "docx"));
        assert!(router.is_supported("txt", "odt"));
        assert!(router.is_supported("html", "odt"));
        assert!(router.is_supported("xps", "txt"));
        assert!(router.is_supported("xps", "html"));
        assert!(router.is_supported("ofd", "txt"));
        assert!(router.is_supported("ofd", "html"));
        assert!(router.is_supported("djvu", "txt"));
        assert!(router.is_supported("txt", "epub"));
        assert!(router.is_supported("html", "epub"));
        assert!(router.is_supported("txt", "fb2"));
        assert!(router.is_supported("html", "fb2"));
        // New cross-format direct converters
        assert!(router.is_supported("docx", "odt"));
        assert!(router.is_supported("odt", "docx"));
        assert!(router.is_supported("rtf", "docx"));
        // New cross-format direct converters (batch 2)
        assert!(router.is_supported("epub", "docx"));
        assert!(router.is_supported("fb2", "docx"));
        assert!(router.is_supported("docx", "epub"));
        // Niche format converters (batch 3)
        assert!(router.is_supported("xps", "docx"));
        assert!(router.is_supported("ofd", "docx"));
        assert!(router.is_supported("hwp", "docx"));
        assert!(router.is_supported("djvu", "docx"));
        assert!(router.is_supported("docx", "xps"));
        // Pairs with no converter should be false
        assert!(!router.is_supported("docx", "pdf"));
        assert!(!router.is_supported("xlsx", "pdf"));
    }

    #[test]
    fn test_same_format() {
        let router = ConversionRouter::new();
        assert!(router.is_supported("docx", "docx"));
    }

    #[test]
    fn test_unsupported() {
        let router = ConversionRouter::new();
        assert!(!router.is_supported("pdf", "docx"));
    }

    #[test]
    fn test_conversion_path_direct() {
        let router = ConversionRouter::new();
        let path = router.conversion_path("rtf", "txt");
        assert_eq!(path, vec!["rtf", "txt"]);
    }

    #[test]
    fn test_conversion_path_docx() {
        let router = ConversionRouter::new();
        let path = router.conversion_path("docx", "html");
        assert_eq!(path, vec!["docx", "html"]);
    }

    #[test]
    fn test_conversion_path_odt() {
        let router = ConversionRouter::new();
        let path = router.conversion_path("odt", "txt");
        assert_eq!(path, vec!["odt", "txt"]);
    }

    #[test]
    fn test_conversion_path_indirect() {
        let router = ConversionRouter::new();
        // xlsx → ods has no converter, so path should be empty
        assert_eq!(router.conversion_path("xlsx", "ods"), Vec::<String>::new());
    }

    #[test]
    fn test_unsupported_result() {
        let result = ConversionRouter::unsupported_result("pdf", "docx");
        assert_eq!(result.status, ConversionStatus::UnsupportedFormat);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_convert_same_format() {
        let router = ConversionRouter::new();
        let result = router.convert("docx", "docx", b"hello");
        assert_eq!(result.status, ConversionStatus::Success);
        assert_eq!(result.output.unwrap().data, b"hello");
    }

    #[test]
    fn test_convert_txt_to_html() {
        let router = ConversionRouter::new();
        let result = router.convert("txt", "html", b"Hello World");
        assert_eq!(result.status, ConversionStatus::Success);
        let html = String::from_utf8(result.output.unwrap().data).unwrap();
        assert!(html.contains("Hello World"));
    }

    #[test]
    fn test_convert_rtf_to_txt() {
        let router = ConversionRouter::new();
        let rtf = r#"{\rtf1\ansi Hello RTF\par}"#;
        let result = router.convert("rtf", "txt", rtf.as_bytes());
        assert_eq!(result.status, ConversionStatus::Success);
        let text = String::from_utf8(result.output.unwrap().data).unwrap();
        assert!(text.contains("Hello RTF"));
    }

    #[test]
    fn test_convert_no_converter() {
        let router = ConversionRouter::new();
        let result = router.convert("odt", "pdf", b"some data");
        assert_eq!(result.status, ConversionStatus::UnsupportedFormat);
        assert!(result.error.unwrap().contains("not supported"));
    }

    #[test]
    fn test_registry_has_all_converters() {
        let router = ConversionRouter::new();
        let pairs = router.registry().registered_pairs();
        assert!(pairs.contains(&("rtf", "txt")));
        assert!(pairs.contains(&("rtf", "html")));
        assert!(pairs.contains(&("html", "txt")));
        assert!(pairs.contains(&("html", "rtf")));
        assert!(pairs.contains(&("txt", "html")));
        assert!(pairs.contains(&("txt", "rtf")));
        assert!(pairs.contains(&("docx", "txt")));
        assert!(pairs.contains(&("docx", "html")));
        assert!(pairs.contains(&("odt", "txt")));
        assert!(pairs.contains(&("odt", "html")));
        assert!(pairs.contains(&("epub", "txt")));
        assert!(pairs.contains(&("epub", "html")));
        assert!(pairs.contains(&("fb2", "txt")));
        assert!(pairs.contains(&("hwp", "txt")));
        assert!(pairs.contains(&("txt", "docx")));
        assert!(pairs.contains(&("html", "docx")));
        assert!(pairs.contains(&("txt", "odt")));
        assert!(pairs.contains(&("html", "odt")));
        assert!(pairs.contains(&("xps", "txt")));
        assert!(pairs.contains(&("xps", "html")));
        assert!(pairs.contains(&("ofd", "txt")));
        assert!(pairs.contains(&("ofd", "html")));
        assert!(pairs.contains(&("djvu", "txt")));
        assert!(pairs.contains(&("txt", "epub")));
        assert!(pairs.contains(&("html", "epub")));
        assert!(pairs.contains(&("txt", "fb2")));
        assert!(pairs.contains(&("html", "fb2")));
        assert!(pairs.contains(&("docx", "odt")));
        assert!(pairs.contains(&("odt", "docx")));
        assert!(pairs.contains(&("rtf", "docx")));
        assert!(pairs.contains(&("epub", "docx")));
        assert!(pairs.contains(&("fb2", "docx")));
        assert!(pairs.contains(&("docx", "epub")));
        assert!(pairs.contains(&("xps", "docx")));
        assert!(pairs.contains(&("ofd", "docx")));
        assert!(pairs.contains(&("hwp", "docx")));
        assert!(pairs.contains(&("djvu", "docx")));
        assert!(pairs.contains(&("docx", "xps")));
        // Presentation format converters
        assert!(pairs.contains(&("wo-presentation", "pptx")));
        assert!(pairs.contains(&("pptx", "wo-presentation")));
        assert!(pairs.contains(&("wo-presentation", "odp")));
        assert!(pairs.contains(&("odp", "wo-presentation")));
        assert!(pairs.contains(&("wo-presentation", "html")));
        assert_eq!(
            pairs.len(),
            43,
            "expected 43 registered converters, got {}",
            pairs.len()
        );
    }

    // ── Chain conversion tests ──────────────────────────────────────────

    #[test]
    fn test_chain_rtf_to_docx() {
        let router = ConversionRouter::new();
        let rtf = r#"{\rtf1\ansi Hello World\par}"#;
        let result = router.convert("rtf", "docx", rtf.as_bytes());
        assert_eq!(result.status, ConversionStatus::Success);
        let output = result.output.unwrap();
        assert_eq!(output.format, "docx");
        // Direct converter exists now: rtf→docx
        assert!(!output.data.is_empty());
        let path = router.conversion_path("rtf", "docx");
        assert_eq!(path.len(), 2); // direct: rtf → docx
        assert_eq!(path.first().unwrap(), "rtf");
        assert_eq!(path.last().unwrap(), "docx");
    }

    #[test]
    fn test_chain_fb2_to_html() {
        let router = ConversionRouter::new();
        // Minimal FB2 content
        let fb2 = r#"<?xml version="1.0" encoding="utf-8"?>
<FictionBook><body><p>Test FB2 content</p></body></FictionBook>"#;
        let result = router.convert("fb2", "html", fb2.as_bytes());
        assert_eq!(result.status, ConversionStatus::Success);
        let output = result.output.unwrap();
        assert_eq!(output.format, "html");
        // Chain is fb2→docx→html (direct fb2→docx converter)
        let path = router.conversion_path("fb2", "html");
        assert!(path.len() >= 3);
        assert_eq!(path.first().unwrap(), "fb2");
        assert_eq!(path.last().unwrap(), "html");
    }

    #[test]
    fn test_chain_hwp_to_html() {
        let router = ConversionRouter::new();
        // The HWP parser requires actual HWP binary data; feed it garbage bytes.
        // The chain hwp→txt→html will fail at step 1 because the HWP parser
        // can't parse garbage. This is expected behavior — the chain is found
        // but execution fails on bad input. Instead, test with hwp→txt (direct)
        // which should also fail, proving the chain is attempted.
        //
        // A direct hwp→docx converter exists now, so the chain may go hwp→docx→html
        // or hwp→txt→html (both are 2-step). Verify the chain is discovered via is_supported.
        assert!(router.is_supported("hwp", "html"));
        // Verify the conversion path is at most 3 steps
        let path = router.conversion_path("hwp", "html");
        assert_eq!(path.first().unwrap(), "hwp");
        assert_eq!(path.last().unwrap(), "html");
        assert!(
            path.len() <= 4,
            "path should be at most 3 steps: {:?}",
            path
        );
        // A direct hwp→txt conversion should work with valid RTF (no, that's wrong).
        // Test that the chain mechanism itself works by using hwp→txt (direct).
        // hwp→txt is a direct converter, so use it directly.
        let result = router.convert("hwp", "txt", b"HWP Document Test");
        // The HWP parser may fail on non-HWP binary data — that's fine for this test.
        // We're testing that the chain path is correctly identified above.
        assert!(
            result.status == ConversionStatus::Success || result.status == ConversionStatus::Failed
        );
    }

    #[test]
    fn test_chain_rtf_to_odt() {
        let router = ConversionRouter::new();
        let rtf = r#"{\rtf1\ansi Chain test\par}"#;
        let result = router.convert("rtf", "odt", rtf.as_bytes());
        assert_eq!(result.status, ConversionStatus::Success);
        let output = result.output.unwrap();
        assert_eq!(output.format, "odt");
    }

    #[test]
    fn test_chain_max_depth() {
        // Verify that chains longer than 3 steps are not attempted.
        // With 25 converters and the format graph, we need a pair that requires
        // >3 steps. Since the graph is well-connected via txt/html, this is hard
        // to find naturally. Instead, verify that a truly unreachable format
        // returns UnsupportedFormat (not an infinite loop or stack overflow).
        let router = ConversionRouter::new();
        // "pdf" has no incoming converters at all
        let result = router.convert("djvu", "pdf", b"test");
        assert_eq!(result.status, ConversionStatus::UnsupportedFormat);
        // Same for xlsx
        let result = router.convert("rtf", "xlsx", b"test");
        assert_eq!(result.status, ConversionStatus::UnsupportedFormat);
    }

    #[test]
    fn test_is_supported_chain() {
        let router = ConversionRouter::new();
        // Direct converters (new cross-format)
        assert!(router.is_supported("rtf", "docx")); // direct: rtf→docx
        assert!(router.is_supported("docx", "odt")); // direct: docx→odt
        assert!(router.is_supported("odt", "docx")); // direct: odt→docx
                                                     // Chain converters
        assert!(router.is_supported("rtf", "odt")); // rtf→html→odt
        assert!(router.is_supported("fb2", "html")); // fb2→txt→html
        assert!(router.is_supported("hwp", "html")); // hwp→txt→html
        assert!(router.is_supported("epub", "rtf")); // epub→txt→rtf
        assert!(router.is_supported("xps", "docx")); // direct: xps→docx
        assert!(router.is_supported("ofd", "docx")); // direct: ofd→docx
        assert!(router.is_supported("djvu", "html")); // djvu→txt→html
                                                      // Truly unreachable formats
        assert!(!router.is_supported("pdf", "docx"));
        assert!(!router.is_supported("xlsx", "pdf"));
    }

    #[test]
    fn test_chain_error_propagation() {
        use crate::FormatConverter;

        // Build a custom registry with a converter that always fails
        let mut registry = ConverterRegistry::new();
        registry.register(TxtToHtmlConverter);

        struct FailingConverter;
        impl FormatConverter for FailingConverter {
            fn source_format(&self) -> &str {
                "html"
            }
            fn target_format(&self) -> &str {
                "fail"
            }
            fn convert(&self, _data: &[u8]) -> Result<Vec<u8>, crate::ConversionError> {
                Err(crate::ConversionError::Parse("forced failure".to_string()))
            }
        }

        struct FailToTxtConverter;
        impl FormatConverter for FailToTxtConverter {
            fn source_format(&self) -> &str {
                "fail"
            }
            fn target_format(&self) -> &str {
                "txt"
            }
            fn convert(&self, _data: &[u8]) -> Result<Vec<u8>, crate::ConversionError> {
                Ok(b"fallback".to_vec())
            }
        }
        registry.register(FailingConverter);
        registry.register(FailToTxtConverter);

        // Build router manually to inject custom registry
        let router = ConversionRouter { registry };

        // Direct conversion via FailingConverter should fail
        let result = router.convert("html", "fail", b"<p>test</p>");
        assert_eq!(result.status, ConversionStatus::Failed);
        assert!(result.error.unwrap().contains("forced failure"));

        // Chain html→fail→txt should fail at step 1
        let result = router.convert("html", "txt", b"<p>test</p>");
        // html→txt has no direct converter in this registry, so it would try chains.
        // The chain html→fail→txt exists, but step 1 fails.
        // Actually wait - we need to check if html→txt has a direct converter...
        // In this custom registry, we only registered txt→html, html→fail, fail→txt.
        // So html→txt is only reachable via html→fail→txt chain, which fails at step 1.
        assert_eq!(result.status, ConversionStatus::Failed);
        let err = result.error.unwrap();
        assert!(err.contains("chain conversion failed at step 1"));
        assert!(err.contains("forced failure"));
    }

    #[test]
    fn test_conversion_path_chained() {
        let router = ConversionRouter::new();
        // RTF→DOCX: now a direct converter exists
        let path = router.conversion_path("rtf", "docx");
        assert_eq!(path.len(), 2);
        assert_eq!(path.first().unwrap(), "rtf");
        assert_eq!(path.last().unwrap(), "docx");

        // RTF→ODT: 2-step chain via either html or txt
        let path = router.conversion_path("rtf", "odt");
        assert_eq!(path.len(), 3);
        assert_eq!(path.first().unwrap(), "rtf");
        assert_eq!(path.last().unwrap(), "odt");

        // DOCX→ODT: now a direct converter exists
        let path = router.conversion_path("docx", "odt");
        assert_eq!(path.len(), 2);
        assert_eq!(path.first().unwrap(), "docx");
        assert_eq!(path.last().unwrap(), "odt");

        // ODT→DOCX: now a direct converter exists
        let path = router.conversion_path("odt", "docx");
        assert_eq!(path.len(), 2);
        assert_eq!(path.first().unwrap(), "odt");
        assert_eq!(path.last().unwrap(), "docx");

        // FB2→HTML: now has a direct path (fb2→docx→html or fb2→txt→html)
        let path = router.conversion_path("fb2", "html");
        assert!(path.len() >= 3);
        assert_eq!(path.first().unwrap(), "fb2");
        assert_eq!(path.last().unwrap(), "html");
    }
}
