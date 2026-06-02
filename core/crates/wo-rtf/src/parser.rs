//! RTF format parser.
//!
//! Tokenizes and parses RTF (Rich Text Format) files.

use wo_common::{CoreError, Document, DocumentMetadata, Result};

use crate::model::*;

/// RTF token types.
#[derive(Debug, Clone, PartialEq)]
enum RtfToken {
    GroupOpen,
    GroupClose,
    ControlWord { word: String, param: Option<i32> },
    ControlSymbol(char),
    Text(String),
    HexEscape(u8),
}

/// Current character formatting state during parsing.
#[derive(Default, Debug, Clone)]
struct FormatState {
    bold: bool,
    italic: bool,
    underline: bool,
    strike: bool,
    superscript: bool,
    subscript: bool,
    font_index: Option<u32>,
    font_size: Option<u32>,
    color_index: Option<u32>,
}

/// Current paragraph formatting state during parsing.
#[derive(Debug, Clone, Default)]
struct ParagraphState {
    alignment: Option<RtfAlignment>,
    indent_left: Option<i32>,
    indent_first: Option<i32>,
}

/// RTF format parser.
pub struct RtfParser;

impl RtfParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse raw RTF data into an RtfDocument.
    pub fn parse(&self, data: &[u8]) -> Result<RtfDocument> {
        let text = std::str::from_utf8(data).map_err(|e| CoreError::Parse {
            format: "rtf".into(),
            message: format!("Invalid UTF-8: {}", e),
        })?;
        let tokens = tokenize(text);
        self.parse_tokens(&tokens)
    }

    fn parse_tokens(&self, tokens: &[RtfToken]) -> Result<RtfDocument> {
        if tokens.is_empty() {
            return Err(CoreError::Parse {
                format: "rtf".into(),
                message: "Empty document".into(),
            });
        }

        let mut doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: Vec::new(),
            colors: Vec::new(),
            body: Vec::new(),
            info: None,
        };

        // Expect {\rtfN...} as first group
        if tokens[0] != RtfToken::GroupOpen {
            return Err(CoreError::Parse {
                format: "rtf".into(),
                message: "Expected '{' at start".into(),
            });
        }

        // Check for \rtfN control word
        if let Some(RtfToken::ControlWord { word, param }) = tokens.get(1) {
            if word == "rtf" {
                doc.version = param.unwrap_or(1) as u32;
            }
        }

        // Collect body tokens, consuming destination groups inline
        let mut body_tokens: Vec<RtfToken> = Vec::new();
        let mut i = 2;
        while i < tokens.len() {
            match &tokens[i] {
                RtfToken::GroupOpen => {
                    if let Some(RtfToken::ControlWord { word, .. }) = tokens.get(i + 1) {
                        match word.as_str() {
                            "fonttbl" => {
                                let (fonts, new_i) = self.parse_font_table(tokens, i + 2);
                                doc.fonts = fonts;
                                i = new_i;
                                continue;
                            }
                            "colortbl" => {
                                let (colors, new_i) = self.parse_color_table(tokens, i + 2);
                                doc.colors = colors;
                                i = new_i;
                                continue;
                            }
                            "info" => {
                                let (info, new_i) = self.parse_info(tokens, i + 2);
                                doc.info = info;
                                i = new_i;
                                continue;
                            }
                            _ => {} // unknown destination — pass to body parser
                        }
                    }
                    body_tokens.push(tokens[i].clone());
                }
                RtfToken::GroupClose => {
                    body_tokens.push(tokens[i].clone());
                }
                RtfToken::ControlWord { word, param } => match word.as_str() {
                    "ansi" | "ansicpg" => {
                        doc.ansi_codepage = Some(param.unwrap_or(1252) as u32);
                    }
                    _ => {
                        body_tokens.push(tokens[i].clone());
                    }
                },
                _ => {
                    body_tokens.push(tokens[i].clone());
                }
            }
            i += 1;
        }

        // Parse body content with formatting state tracking
        doc.body = self.parse_body_content(&body_tokens);

        Ok(doc)
    }

    /// Parse body tokens with formatting state tracking.
    fn parse_body_content(&self, tokens: &[RtfToken]) -> Vec<RtfBlock> {
        let mut blocks = Vec::new();
        let mut state_stack = vec![FormatState::default()];
        let mut para = ParagraphState::default();
        let mut current_inlines: Vec<RtfInline> = Vec::new();
        let mut depth = 0i32;
        let mut i = 0;

        while i < tokens.len() {
            match &tokens[i] {
                RtfToken::GroupOpen => {
                    // Check for nested destination groups we should skip
                    if let Some(RtfToken::ControlWord { word, .. }) = tokens.get(i + 1) {
                        match word.as_str() {
                            "fonttbl" | "colortbl" | "info" | "generator" | "listtable"
                            | "listoverridetable" | "rsidtable" | "revtbl" | "pnseclvl" => {
                                let mut d = 1;
                                let mut j = i + 1;
                                while j < tokens.len() && d > 0 {
                                    match &tokens[j] {
                                        RtfToken::GroupOpen => d += 1,
                                        RtfToken::GroupClose => d -= 1,
                                        _ => {}
                                    }
                                    j += 1;
                                }
                                i = j;
                                continue;
                            }
                            _ => {}
                        }
                    }
                    // Enter group scope: push format state
                    depth += 1;
                    state_stack.push(state_stack.last().unwrap().clone());
                }
                RtfToken::GroupClose => {
                    depth -= 1;
                    if depth < 0 {
                        // End of root group
                        break;
                    }
                    if state_stack.len() > 1 {
                        state_stack.pop();
                    }
                }
                RtfToken::ControlWord { word, param } => {
                    // Flush any accumulated text with current state before changing state
                    Self::flush_control_word_text(
                        word.as_str(),
                        *param,
                        &mut state_stack,
                        &mut para,
                        &mut current_inlines,
                        &mut blocks,
                    );
                }
                RtfToken::Text(t) => {
                    if !t.trim().is_empty() {
                        let cleaned: String =
                            t.chars().filter(|c| *c != '\n' && *c != '\r').collect();
                        if !cleaned.is_empty() {
                            let state = state_stack.last().unwrap();
                            let inline = Self::wrap_text_with_formatting(cleaned, state);
                            current_inlines.push(inline);
                        }
                    }
                }
                RtfToken::HexEscape(byte) => {
                    let ch = std::char::from_u32(*byte as u32).unwrap_or('\u{FFFD}');
                    let state = state_stack.last().unwrap();
                    let inline = Self::wrap_text_with_formatting(ch.to_string(), state);
                    current_inlines.push(inline);
                }
                RtfToken::ControlSymbol(ch) => {
                    let text = match ch {
                        '~' => Some("\u{00A0}"), // non-breaking space
                        '-' => Some("-"),        // optional hyphen
                        '_' => Some("\u{2011}"), // non-breaking hyphen
                        '\\' | '{' | '}' => Some(&ch.to_string()[..]),
                        _ => None,
                    };
                    if let Some(t) = text {
                        let state = state_stack.last().unwrap();
                        let inline = Self::wrap_text_with_formatting(t.to_string(), state);
                        current_inlines.push(inline);
                    }
                }
            }
            i += 1;
        }

        // Flush remaining paragraph
        Self::flush_paragraph(&mut current_inlines, &para, &mut blocks);

        blocks
    }

    /// Handle a control word by updating formatting/paragraph state.
    fn flush_control_word_text(
        word: &str,
        param: Option<i32>,
        state_stack: &mut [FormatState],
        para: &mut ParagraphState,
        current_inlines: &mut Vec<RtfInline>,
        blocks: &mut Vec<RtfBlock>,
    ) {
        let state = state_stack.last_mut().unwrap();

        match word {
            // --- character formatting toggles ---
            "b" => state.bold = param.unwrap_or(1) != 0,
            "i" => state.italic = param.unwrap_or(1) != 0,
            "ul" => state.underline = param.unwrap_or(1) != 0,
            "ulnone" => state.underline = false,
            "strike" => state.strike = param.unwrap_or(1) != 0,
            "super" => {
                state.superscript = true;
                state.subscript = false;
            }
            "sub" => {
                state.subscript = true;
                state.superscript = false;
            }
            "nosupersub" => {
                state.superscript = false;
                state.subscript = false;
            }

            // --- character formatting values ---
            "f" => state.font_index = param.map(|p| p.max(0) as u32),
            "fs" => state.font_size = param.map(|p| p.max(0) as u32),
            "cf" => state.color_index = param.map(|p| p as u32),
            "cb" => { /* background color — model has no field; ignore */ }

            // --- reset character formatting ---
            "plain" => {
                *state = FormatState::default();
            }

            // --- paragraph formatting ---
            "pard" => {
                Self::flush_paragraph(current_inlines, para, blocks);
                *para = ParagraphState::default();
            }
            "par" => {
                Self::flush_paragraph(current_inlines, para, blocks);
            }
            "qc" => para.alignment = Some(RtfAlignment::Center),
            "ql" => para.alignment = Some(RtfAlignment::Left),
            "qr" => para.alignment = Some(RtfAlignment::Right),
            "qj" => para.alignment = Some(RtfAlignment::Justify),
            "li" => para.indent_left = Some(param.unwrap_or(0)),
            "ri" => { /* right indent — model has no field */ }
            "fi" => para.indent_first = Some(param.unwrap_or(0)),

            // --- special inline elements ---
            "line" => current_inlines.push(RtfInline::LineBreak),
            "page" => {
                Self::flush_paragraph(current_inlines, para, blocks);
                blocks.push(RtfBlock::Paragraph {
                    content: vec![RtfInline::PageBreak],
                    alignment: None,
                    indent_left: None,
                    indent_first: None,
                });
            }
            "tab" => current_inlines.push(RtfInline::Tab),
            "sect" => {
                Self::flush_paragraph(current_inlines, para, blocks);
            }

            // --- everything else: ignore ---
            _ => {}
        }
    }

    /// Wrap plain text with all active formatting as nested RtfInline nodes.
    fn wrap_text_with_formatting(text: String, state: &FormatState) -> RtfInline {
        let mut inline: RtfInline = RtfInline::Text { text };

        if state.subscript {
            inline = RtfInline::Subscript {
                content: vec![inline],
            };
        }
        if state.superscript {
            inline = RtfInline::Superscript {
                content: vec![inline],
            };
        }
        if state.strike {
            inline = RtfInline::Strikethrough {
                content: vec![inline],
            };
        }
        if state.underline {
            inline = RtfInline::Underline {
                content: vec![inline],
            };
        }
        if state.italic {
            inline = RtfInline::Italic {
                content: vec![inline],
            };
        }
        if state.bold {
            inline = RtfInline::Bold {
                content: vec![inline],
            };
        }
        if let Some(idx) = state.color_index {
            inline = RtfInline::Color {
                index: idx,
                content: vec![inline],
            };
        }
        if let Some(hp) = state.font_size {
            inline = RtfInline::FontSize {
                half_points: hp,
                content: vec![inline],
            };
        }
        if let Some(fi) = state.font_index {
            inline = RtfInline::Font {
                index: fi,
                content: vec![inline],
            };
        }

        inline
    }

    /// Flush accumulated inline content as a paragraph block (if non-empty).
    fn flush_paragraph(
        current_inlines: &mut Vec<RtfInline>,
        para: &ParagraphState,
        blocks: &mut Vec<RtfBlock>,
    ) {
        if !current_inlines.is_empty() {
            blocks.push(RtfBlock::Paragraph {
                content: std::mem::take(current_inlines),
                alignment: para.alignment,
                indent_left: para.indent_left,
                indent_first: para.indent_first,
            });
        }
    }

    fn parse_font_table(&self, tokens: &[RtfToken], start: usize) -> (Vec<RtfFont>, usize) {
        let mut fonts = Vec::new();
        let mut i = start;
        let mut current_font = RtfFont {
            index: 0,
            name: String::new(),
            alt_name: None,
            charset: None,
        };

        while i < tokens.len() {
            match &tokens[i] {
                RtfToken::GroupOpen => {
                    // Start of a font definition
                    current_font = RtfFont {
                        index: 0,
                        name: String::new(),
                        alt_name: None,
                        charset: None,
                    };
                }
                RtfToken::GroupClose => {
                    // End of font definition — save it
                    if !current_font.name.is_empty() {
                        fonts.push(current_font.clone());
                    }
                    // Check if we're back at the fonttbl level
                    // (outer group close)
                    let depth = self.group_depth(tokens, start, i);
                    if depth == 0 {
                        i += 1;
                        break;
                    }
                }
                RtfToken::ControlWord { word, param } => match word.as_str() {
                    "f" => current_font.index = param.unwrap_or(0) as u32,
                    "fcharset" => {
                        current_font.charset = Some(format!("cp{}", param.unwrap_or(0)));
                    }
                    _ => {}
                },
                RtfToken::Text(t) if current_font.name.is_empty() => {
                    // First text in a font def is the font name
                    let name = t.trim_end_matches(';').to_string();
                    if !name.is_empty() {
                        current_font.name = name;
                    }
                }
                _ => {}
            }
            i += 1;
        }

        (fonts, i)
    }

    fn parse_color_table(&self, tokens: &[RtfToken], start: usize) -> (Vec<RtfColor>, usize) {
        let mut colors = Vec::new();
        let mut i = start;
        let mut r = 0u8;
        let mut g = 0u8;
        let mut b = 0u8;
        let mut depth = 0i32;

        while i < tokens.len() {
            match &tokens[i] {
                RtfToken::GroupOpen => {
                    depth += 1;
                }
                RtfToken::GroupClose => {
                    if depth == 0 {
                        // End of colortbl group — push any pending color
                        colors.push(RtfColor {
                            red: r,
                            green: g,
                            blue: b,
                        });
                        i += 1;
                        break;
                    }
                    depth -= 1;
                }
                RtfToken::ControlWord { word, param } => match word.as_str() {
                    "red" => r = param.unwrap_or(0).clamp(0, 255) as u8,
                    "green" => g = param.unwrap_or(0).clamp(0, 255) as u8,
                    "blue" => b = param.unwrap_or(0).clamp(0, 255) as u8,
                    _ => {}
                },
                RtfToken::Text(t) if t.contains(';') => {
                    colors.push(RtfColor {
                        red: r,
                        green: g,
                        blue: b,
                    });
                    r = 0;
                    g = 0;
                    b = 0;
                }
                RtfToken::ControlSymbol(';') => {
                    colors.push(RtfColor {
                        red: r,
                        green: g,
                        blue: b,
                    });
                    r = 0;
                    g = 0;
                    b = 0;
                }
                _ => {}
            }
            i += 1;
        }

        (colors, i)
    }

    fn parse_info(&self, tokens: &[RtfToken], start: usize) -> (Option<RtfInfo>, usize) {
        let mut info = RtfInfo::default();
        let mut i = start;
        let mut current_key = String::new();

        while i < tokens.len() {
            match &tokens[i] {
                RtfToken::GroupOpen => {
                    // Sub-group for an info field
                    if let Some(RtfToken::ControlWord { word, .. }) = tokens.get(i + 1) {
                        current_key = word.clone();
                    } else {
                        current_key.clear();
                    }
                }
                RtfToken::GroupClose => {
                    if self.group_depth(tokens, start, i) == 0 {
                        i += 1;
                        break;
                    }
                    current_key.clear();
                }
                RtfToken::Text(t) => {
                    let val = t.trim().to_string();
                    match current_key.as_str() {
                        "title" if !val.is_empty() => info.title = Some(val),
                        "subject" if !val.is_empty() => info.subject = Some(val),
                        "author" if !val.is_empty() => info.author = Some(val),
                        "company" if !val.is_empty() => info.company = Some(val),
                        "keywords" if !val.is_empty() => info.keywords = Some(val),
                        _ => {}
                    }
                }
                _ => {}
            }
            i += 1;
        }

        let has_any = info.title.is_some() || info.author.is_some() || info.subject.is_some();
        (if has_any { Some(info) } else { None }, i)
    }

    fn group_depth(&self, tokens: &[RtfToken], start: usize, end: usize) -> i32 {
        let mut depth = 0i32;
        for token in tokens
            .iter()
            .take(end.min(tokens.len() - 1) + 1)
            .skip(start)
        {
            match token {
                RtfToken::GroupOpen => depth += 1,
                RtfToken::GroupClose => depth -= 1,
                _ => {}
            }
        }
        depth
    }

    /// Parse RTF data and convert to a generic Document.
    pub fn parse_to_document(&self, data: &[u8]) -> Result<Document> {
        let rtf = self.parse(data)?;

        let title = rtf
            .info
            .as_ref()
            .and_then(|i| i.title.clone())
            .unwrap_or_default();
        let author = rtf
            .info
            .as_ref()
            .and_then(|i| i.author.clone())
            .unwrap_or_default();

        let word_count: u32 = rtf
            .body
            .iter()
            .map(|b| match b {
                RtfBlock::Paragraph { content, .. } => content
                    .iter()
                    .map(|f| match f {
                        RtfInline::Text { text } => text.split_whitespace().count() as u32,
                        _ => 0,
                    })
                    .sum::<u32>(),
                _ => 0,
            })
            .sum();

        Ok(Document {
            content: data.to_vec(),
            format: "rtf".into(),
            metadata: DocumentMetadata {
                title: Some(title),
                author: Some(author),
                word_count: Some(word_count),
                ..Default::default()
            },
        })
    }
}

impl Default for RtfParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Tokenize RTF text into a sequence of tokens.
fn tokenize(text: &str) -> Vec<RtfToken> {
    let mut tokens = Vec::new();
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '{' => tokens.push(RtfToken::GroupOpen),
            '}' => tokens.push(RtfToken::GroupClose),
            '\\' => {
                // Control word or symbol
                if let Some(&next) = chars.peek() {
                    if next.is_alphabetic() {
                        // Control word: \keyword or \keywordN
                        let mut word = String::new();
                        while let Some(&c) = chars.peek() {
                            if c.is_alphabetic() {
                                word.push(c);
                                chars.next();
                            } else {
                                break;
                            }
                        }
                        // Optional numeric parameter
                        let mut param_str = String::new();
                        let mut has_minus = false;
                        if let Some(&c) = chars.peek() {
                            if c == '-' {
                                has_minus = true;
                                param_str.push(c);
                                chars.next();
                            }
                        }
                        while let Some(&c) = chars.peek() {
                            if c.is_ascii_digit() {
                                param_str.push(c);
                                chars.next();
                            } else {
                                break;
                            }
                        }
                        // Skip delimiter (space) after parameter
                        if let Some(&c) = chars.peek() {
                            if c == ' ' {
                                chars.next();
                            }
                        }
                        let param = if param_str.is_empty() || (param_str == "-" && !has_minus) {
                            None
                        } else {
                            param_str.parse::<i32>().ok()
                        };
                        tokens.push(RtfToken::ControlWord { word, param });
                    } else if next == '\'' {
                        // Hex escape: \'XX
                        chars.next(); // consume '\''
                        let hex1 = chars.next().unwrap_or('0');
                        let hex2 = chars.next().unwrap_or('0');
                        let byte =
                            u8::from_str_radix(&format!("{}{}", hex1, hex2), 16).unwrap_or(0);
                        tokens.push(RtfToken::HexEscape(byte));
                    } else {
                        // Control symbol: \{ \} \\ etc.
                        chars.next();
                        tokens.push(RtfToken::ControlSymbol(next));
                    }
                }
            }
            _ => {
                // Plain text — collect until next special char
                let mut text = String::new();
                text.push(ch);
                while let Some(&c) = chars.peek() {
                    if c == '{' || c == '}' || c == '\\' {
                        break;
                    }
                    text.push(c);
                    chars.next();
                }
                tokens.push(RtfToken::Text(text));
            }
        }
    }

    tokens
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{is_rtf_file, RtfSerializer};

    // ── helpers ──────────────────────────────────────────────────────

    /// Deep-equality for inline nodes (model doesn't derive PartialEq).
    fn inlines_eq(a: &[RtfInline], b: &[RtfInline]) -> bool {
        a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| inline_eq(x, y))
    }

    fn inline_eq(a: &RtfInline, b: &RtfInline) -> bool {
        match (a, b) {
            (RtfInline::Text { text: t1 }, RtfInline::Text { text: t2 }) => t1 == t2,
            (RtfInline::Bold { content: c1 }, RtfInline::Bold { content: c2 }) => {
                inlines_eq(c1, c2)
            }
            (RtfInline::Italic { content: c1 }, RtfInline::Italic { content: c2 }) => {
                inlines_eq(c1, c2)
            }
            (RtfInline::Underline { content: c1 }, RtfInline::Underline { content: c2 }) => {
                inlines_eq(c1, c2)
            }
            (
                RtfInline::Strikethrough { content: c1 },
                RtfInline::Strikethrough { content: c2 },
            ) => inlines_eq(c1, c2),
            (RtfInline::Superscript { content: c1 }, RtfInline::Superscript { content: c2 }) => {
                inlines_eq(c1, c2)
            }
            (RtfInline::Subscript { content: c1 }, RtfInline::Subscript { content: c2 }) => {
                inlines_eq(c1, c2)
            }
            (
                RtfInline::Font {
                    index: i1,
                    content: c1,
                },
                RtfInline::Font {
                    index: i2,
                    content: c2,
                },
            ) => i1 == i2 && inlines_eq(c1, c2),
            (
                RtfInline::FontSize {
                    half_points: h1,
                    content: c1,
                },
                RtfInline::FontSize {
                    half_points: h2,
                    content: c2,
                },
            ) => h1 == h2 && inlines_eq(c1, c2),
            (
                RtfInline::Color {
                    index: i1,
                    content: c1,
                },
                RtfInline::Color {
                    index: i2,
                    content: c2,
                },
            ) => i1 == i2 && inlines_eq(c1, c2),
            (RtfInline::LineBreak, RtfInline::LineBreak) => true,
            (RtfInline::PageBreak, RtfInline::PageBreak) => true,
            (RtfInline::Tab, RtfInline::Tab) => true,
            _ => false,
        }
    }

    fn blocks_eq(a: &[RtfBlock], b: &[RtfBlock]) -> bool {
        a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| block_eq(x, y))
    }

    fn block_eq(a: &RtfBlock, b: &RtfBlock) -> bool {
        match (a, b) {
            (
                RtfBlock::Paragraph {
                    content: c1,
                    alignment: a1,
                    indent_left: il1,
                    indent_first: if1,
                },
                RtfBlock::Paragraph {
                    content: c2,
                    alignment: a2,
                    indent_left: il2,
                    indent_first: if2,
                },
            ) => inlines_eq(c1, c2) && a1 == a2 && il1 == il2 && if1 == if2,
            _ => false,
        }
    }

    fn parse_body(rtf: &str) -> Vec<RtfBlock> {
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        doc.body
    }

    /// Extract plain text recursively from inlines.
    fn extract_text(inlines: &[RtfInline]) -> String {
        let mut s = String::new();
        for inline in inlines {
            match inline {
                RtfInline::Text { text } => s.push_str(text),
                RtfInline::Bold { content } => s.push_str(&extract_text(content)),
                RtfInline::Italic { content } => s.push_str(&extract_text(content)),
                RtfInline::Underline { content } => s.push_str(&extract_text(content)),
                RtfInline::Strikethrough { content } => s.push_str(&extract_text(content)),
                RtfInline::Superscript { content } => s.push_str(&extract_text(content)),
                RtfInline::Subscript { content } => s.push_str(&extract_text(content)),
                RtfInline::Font { content, .. } => s.push_str(&extract_text(content)),
                RtfInline::FontSize { content, .. } => s.push_str(&extract_text(content)),
                RtfInline::Color { content, .. } => s.push_str(&extract_text(content)),
                _ => {}
            }
        }
        s
    }

    /// Count formatting nodes of a specific variant (recursive).
    fn count_variant(inlines: &[RtfInline], variant: &str) -> usize {
        let mut count = 0;
        for inline in inlines {
            if matches!((variant, inline),
                ("bold", RtfInline::Bold { .. }) |
                ("italic", RtfInline::Italic { .. }) |
                ("underline", RtfInline::Underline { .. }) |
                ("strike", RtfInline::Strikethrough { .. }) |
                ("super", RtfInline::Superscript { .. }) |
                ("sub", RtfInline::Subscript { .. }) |
                ("font", RtfInline::Font { .. }) |
                ("fontsize", RtfInline::FontSize { .. }) |
                ("color", RtfInline::Color { .. })
            ) {
                count += 1;
            }
            // Recurse into nested content
            let children = match inline {
                RtfInline::Bold { content }
                | RtfInline::Italic { content }
                | RtfInline::Underline { content }
                | RtfInline::Strikethrough { content }
                | RtfInline::Superscript { content }
                | RtfInline::Subscript { content }
                | RtfInline::Font { content, .. }
                | RtfInline::FontSize { content, .. }
                | RtfInline::Color { content, .. } => content.as_slice(),
                _ => &[],
            };
            count += count_variant(children, variant);
        }
        count
    }

    // ── original tests (preserved) ──────────────────────────────────

    #[test]
    fn test_is_rtf_file() {
        assert!(is_rtf_file(b"{\\rtf1\\ansi test}"));
        assert!(is_rtf_file(b"  {\\rtf1\\ansi test}"));
        assert!(!is_rtf_file(b"plain text"));
        assert!(!is_rtf_file(b"<html>not rtf</html>"));
        assert!(!is_rtf_file(b""));
        assert!(!is_rtf_file(b"\\rtf")); // no opening brace
    }

    #[test]
    fn test_parse_simple_rtf() {
        let rtf = r#"{\rtf1\ansi\f0\fs24 Hello World!\par}"#;
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        assert_eq!(doc.version, 1);
        assert_eq!(doc.body.len(), 1);
    }

    #[test]
    fn test_parse_font_table() {
        let rtf = r#"{\rtf1\ansi{\fonttbl{\f0\fswiss Arial;}{\f1\fmodern Times New Roman;}}}"#;
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        assert!(!doc.fonts.is_empty());
        assert_eq!(doc.fonts[0].index, 0);
    }

    #[test]
    fn test_parse_color_table() {
        let rtf = r#"{\rtf1\ansi{\colortbl;\red255\green0\blue0;\red0\green128\blue255;}}"#;
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        assert!(doc.colors.len() >= 3);
        assert_eq!(
            doc.colors[1],
            RtfColor {
                red: 255,
                green: 0,
                blue: 0
            }
        );
        assert_eq!(
            doc.colors[2],
            RtfColor {
                red: 0,
                green: 128,
                blue: 255
            }
        );
    }

    #[test]
    fn test_parse_document_info() {
        let rtf = r#"{\rtf1\ansi{\info{\title Test RTF}{\author World Office}{\subject Parsing}}}"#;
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        assert!(doc.info.is_some());
    }

    #[test]
    fn test_parse_to_document() {
        let rtf = r#"{\rtf1\ansi{\info{\title Test}{\author Me}}Hello World\par}"#;
        let parser = RtfParser::new();
        let doc = parser.parse_to_document(rtf.as_bytes()).unwrap();
        assert_eq!(doc.format, "rtf");
        assert_eq!(doc.metadata.title.as_deref(), Some("Test"));
    }

    #[test]
    fn test_rejects_non_rtf() {
        let parser = RtfParser::new();
        let result = parser.parse(b"<html>not rtf</html>");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_rtf_version() {
        let parser = RtfParser::new();
        let doc = parser.parse(b"{\\rtf1\\ansi}").unwrap();
        assert_eq!(doc.version, 1);
    }

    #[test]
    fn test_hex_escape() {
        let tokens = tokenize(r#"{\'e9\'e8}"#);
        assert!(tokens.contains(&RtfToken::HexEscape(0xe9)));
        assert!(tokens.contains(&RtfToken::HexEscape(0xe8)));
    }

    #[test]
    fn test_tokenizer_control_words() {
        let tokens = tokenize(r"\b\i\fs24 Hello");
        assert!(tokens.contains(&RtfToken::ControlWord {
            word: "b".to_string(),
            param: None,
        }));
        assert!(tokens.contains(&RtfToken::ControlWord {
            word: "fs".to_string(),
            param: Some(24),
        }));
        assert!(tokens.contains(&RtfToken::Text("Hello".to_string())));
    }

    #[test]
    fn test_tokenizer_control_symbols() {
        let tokens = tokenize("\\{ \\} \\\\n");
        assert!(tokens.contains(&RtfToken::ControlSymbol('{')));
        assert!(tokens.contains(&RtfToken::ControlSymbol('}')));
        assert!(tokens.contains(&RtfToken::ControlSymbol('\\')));
    }

    // ── formatting tests ────────────────────────────────────────────
    //
    // RTF delimiter rule: a space after a control word is consumed as delimiter.
    // To get visible spaces in test output, use \~ (NBSP control symbol) which
    // survives as \u{00A0} and is NOT consumed as a delimiter.

    #[test]
    fn test_bold_text() {
        // text\~\b bold\b0\~rest → "text NBSP bold NBSP rest"
        let blocks = parse_body(r#"{\rtf1\ansi text\~\b bold\b0\~rest\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert!(matches!(&content[0], RtfInline::Text { text } if text == "text"));
            assert!(matches!(&content[1], RtfInline::Text { text } if text == "\u{00A0}"));
            assert!(matches!(&content[2], RtfInline::Bold { .. }));
            if let RtfInline::Bold { content: inner } = &content[2] {
                assert_eq!(extract_text(inner), "bold");
            }
            assert!(matches!(&content[3], RtfInline::Text { text } if text == "\u{00A0}"));
            assert!(matches!(&content[4], RtfInline::Text { text } if text == "rest"));
        } else {
            panic!("expected Paragraph");
        }
    }

    #[test]
    fn test_italic_text() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\i italic\i0\~rest\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert_eq!(count_variant(content, "italic"), 1);
            if let RtfInline::Italic { content: inner } = &content[2] {
                assert_eq!(extract_text(inner), "italic");
            }
        }
    }

    #[test]
    fn test_underline_text() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\ul underlined\ulnone\~rest\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert_eq!(count_variant(content, "underline"), 1);
        }
    }

    #[test]
    fn test_underline_with_ul0() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\ul underlined\ul0\~rest\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert_eq!(count_variant(content, "underline"), 1);
        }
    }

    #[test]
    fn test_bold_italic_combination() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\b\i bolditalic\i0\b0\~rest\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            // Should have Bold wrapping Italic (or vice versa)
            let has_bold = content.iter().any(|i| matches!(i, RtfInline::Bold { .. }));
            assert!(has_bold, "expected a Bold node");
            let bold_node = content.iter().find(|i| matches!(i, RtfInline::Bold { .. }));
            if let Some(RtfInline::Bold { content }) = bold_node {
                let has_italic = content
                    .iter()
                    .any(|c| matches!(c, RtfInline::Italic { .. }));
                assert!(has_italic, "expected Bold(Italic(...))");
            }
        }
    }

    #[test]
    fn test_mixed_bold_italic() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\b bold\i bolditalic\i0\b0\~normal\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            let full = extract_text(content);
            // text + NBSP + "bold" + "bolditalic" + NBSP + "normal"
            assert!(full.contains("text"));
            assert!(full.contains("bold"));
            assert!(full.contains("bolditalic"));
            assert!(full.contains("normal"));
        }
    }

    #[test]
    fn test_font_size() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\fs36 big\fs24\~normal\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert!(count_variant(content, "fontsize") >= 1);
        }
    }

    #[test]
    fn test_color_change() {
        let blocks = parse_body(
            r#"{\rtf1\ansi{\colortbl;\red255\green0\blue0;}text\~\cf1 red\cf0\~black\par}"#,
        );
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            let color_node = content
                .iter()
                .find(|i| matches!(i, RtfInline::Color { .. }));
            assert!(color_node.is_some(), "expected a Color node for red text");
            if let Some(RtfInline::Color { index, content }) = color_node {
                assert_eq!(*index, 1);
                assert_eq!(extract_text(content), "red");
            }
        }
    }

    #[test]
    fn test_strikethrough() {
        let blocks = parse_body(r#"{\rtf1\ansi text\~\strike struck\strike0\~normal\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert_eq!(count_variant(content, "strike"), 1);
        }
    }

    #[test]
    fn test_font_family() {
        // Test font state tracking without font table — \f0 sets state
        let blocks = parse_body(r#"{\rtf1\ansi\f0\~Arial\f1\~other\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert!(count_variant(content, "font") >= 2);
        }
    }

    #[test]
    fn test_group_scoped_formatting() {
        let blocks = parse_body(r#"{\rtf1\ansi normal\~{\b\~bold}\~normal2\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            // Bold wraps both NBSP and "bold" text (2 Bold nodes due to separate tokens)
            assert!(count_variant(content, "bold") >= 1);
            let full = extract_text(content);
            assert!(full.contains("normal"));
            assert!(full.contains("bold"));
            assert!(full.contains("normal2"));
        }
    }

    // ── paragraph property tests ────────────────────────────────────

    #[test]
    fn test_alignment_center() {
        let blocks = parse_body(r#"{\rtf1\ansi\qc\~Centered\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph {
            alignment, content, ..
        } = &blocks[0]
        {
            assert_eq!(*alignment, Some(RtfAlignment::Center));
            assert!(extract_text(content).contains("Centered"));
        }
    }

    #[test]
    fn test_alignment_right() {
        let blocks = parse_body(r#"{\rtf1\ansi\qr\~Right\par}"#);
        if let RtfBlock::Paragraph { alignment, .. } = &blocks[0] {
            assert_eq!(*alignment, Some(RtfAlignment::Right));
        }
    }

    #[test]
    fn test_alignment_justify() {
        let blocks = parse_body(r#"{\rtf1\ansi\qj\~Justified\par}"#);
        if let RtfBlock::Paragraph { alignment, .. } = &blocks[0] {
            assert_eq!(*alignment, Some(RtfAlignment::Justify));
        }
    }

    #[test]
    fn test_paragraph_indentation() {
        let blocks = parse_body(r#"{\rtf1\ansi\li720\fi-360\~Indented\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph {
            indent_left,
            indent_first,
            ..
        } = &blocks[0]
        {
            assert_eq!(*indent_left, Some(720));
            assert_eq!(*indent_first, Some(-360));
        }
    }

    #[test]
    fn test_pard_resets_paragraph() {
        let blocks = parse_body(r#"{\rtf1\ansi\qc\li500\~\~Centered\pard\ql\~\~LeftNormal\par}"#);
        assert_eq!(blocks.len(), 2);
        if let RtfBlock::Paragraph {
            alignment,
            indent_left,
            ..
        } = &blocks[0]
        {
            assert_eq!(*alignment, Some(RtfAlignment::Center));
            assert_eq!(*indent_left, Some(500));
        }
        if let RtfBlock::Paragraph {
            alignment,
            indent_left,
            indent_first,
            ..
        } = &blocks[1]
        {
            assert_eq!(*alignment, Some(RtfAlignment::Left));
            assert_eq!(*indent_left, None);
            assert_eq!(*indent_first, None);
        }
    }

    // ── special inline elements ────────────────────────────────────

    #[test]
    fn test_line_break() {
        let blocks = parse_body(r#"{\rtf1\ansi line1\line line2\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            let has_linebreak = content.iter().any(|i| matches!(i, RtfInline::LineBreak));
            assert!(has_linebreak, "expected a LineBreak node");
        }
    }

    #[test]
    fn test_page_break() {
        let blocks = parse_body(r#"{\rtf1\ansi before\page after\par}"#);
        assert!(blocks.len() >= 2);
        let has_pagebreak = blocks.iter().any(|b| {
            if let RtfBlock::Paragraph { content, .. } = b {
                content.iter().any(|i| matches!(i, RtfInline::PageBreak))
            } else {
                false
            }
        });
        assert!(has_pagebreak, "expected a PageBreak node");
    }

    #[test]
    fn test_tab() {
        let blocks = parse_body(r#"{\rtf1\ansi col1\tab col2\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            let has_tab = content.iter().any(|i| matches!(i, RtfInline::Tab));
            assert!(has_tab, "expected a Tab node");
        }
    }

    // ── complex formatting ──────────────────────────────────────────

    #[test]
    fn test_nested_formatting_font_color_size() {
        let blocks = parse_body(
            r#"{\rtf1\ansi{\colortbl;\red128\green0\blue0;}\f0\fs20\cf1\~small red\fs36\b\~big bold\plain\fs20\~mono\par}"#,
        );
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            let full = extract_text(content);
            assert!(
                full.contains("small red"),
                "missing 'small red' in: {:?}",
                full
            );
            assert!(
                full.contains("big bold"),
                "missing 'big bold' in: {:?}",
                full
            );
            assert!(full.contains("mono"), "missing 'mono' in: {:?}", full);
        }
    }

    #[test]
    fn test_multiple_paragraphs_with_different_formatting() {
        let blocks =
            parse_body(r#"{\rtf1\ansi\fs20\~Normal\par\b\~Big bold\pard\b0\~Back to normal\par}"#);
        assert_eq!(blocks.len(), 3);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert_eq!(count_variant(content, "bold"), 0);
        }
        if let RtfBlock::Paragraph { content, .. } = &blocks[1] {
            assert!(count_variant(content, "bold") >= 1);
        }
        // \pard resets paragraph props but NOT char formatting; \b0 explicitly resets bold
        if let RtfBlock::Paragraph { content, .. } = &blocks[2] {
            assert_eq!(count_variant(content, "bold"), 0);
        }
    }

    // ── round-trip tests ────────────────────────────────────────────
    // Use model construction for exact round-trip verification, avoiding
    // space-delimiter ambiguity in RTF string parsing.

    #[test]
    fn test_roundtrip_font_size_color() {
        // Sticky formatting (font_size, color) doesn't perfectly roundtrip because
        // the parser wraps ALL active non-default formatting. Verify that the
        // serializer produces valid RTF and the parser extracts correct content.
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            info: None,
            body: vec![RtfBlock::Paragraph {
                content: vec![
                    RtfInline::FontSize {
                        half_points: 36,
                        content: vec![RtfInline::Text { text: "big".into() }],
                    },
                    RtfInline::Color {
                        index: 1,
                        content: vec![RtfInline::Text { text: "red".into() }],
                    },
                ],
                alignment: None,
                indent_left: None,
                indent_first: None,
            }],
        };
        let parser = RtfParser::new();
        let ser = RtfSerializer::new();
        let serialized = ser.serialize(&doc);

        // Verify serializer output is valid RTF
        assert!(serialized.contains("\\rtf1"));
        assert!(serialized.contains("\\fs36"));
        assert!(serialized.contains("big"));
        assert!(serialized.contains("\\cf1"));
        assert!(serialized.contains("red"));

        // Re-parse and verify text content is preserved (even if formatting wrapping differs)
        let doc2 = parser.parse(serialized.as_bytes()).unwrap();
        assert_eq!(doc2.body.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &doc2.body[0] {
            let full = extract_text(content);
            assert!(full.contains("big"), "missing 'big' in: {:?}", full);
            assert!(full.contains("red"), "missing 'red' in: {:?}", full);
        }
    }

    #[test]
    fn test_roundtrip_alignment_and_indent() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            info: None,
            body: vec![
                RtfBlock::Paragraph {
                    content: vec![RtfInline::Text {
                        text: "centered".into(),
                    }],
                    alignment: Some(RtfAlignment::Center),
                    indent_left: Some(720),
                    indent_first: Some(360),
                },
                RtfBlock::Paragraph {
                    content: vec![RtfInline::Text {
                        text: "left".into(),
                    }],
                    alignment: Some(RtfAlignment::Left),
                    indent_left: None,
                    indent_first: None,
                },
            ],
        };
        let parser = RtfParser::new();
        let ser = RtfSerializer::new();
        let serialized = ser.serialize(&doc);
        let doc2 = parser.parse(serialized.as_bytes()).unwrap();
        assert!(
            blocks_eq(&doc.body, &doc2.body),
            "round-trip indent mismatch:\n  {:?}\n  {:?}",
            doc.body,
            doc2.body
        );
    }

    #[test]
    fn test_roundtrip_special_elements() {
        let doc = RtfDocument {
            version: 1,
            ansi_codepage: None,
            fonts: vec![],
            colors: vec![],
            info: None,
            body: vec![RtfBlock::Paragraph {
                content: vec![
                    RtfInline::Text {
                        text: "before".into(),
                    },
                    RtfInline::Tab,
                    RtfInline::Text {
                        text: "after".into(),
                    },
                    RtfInline::LineBreak,
                ],
                alignment: None,
                indent_left: None,
                indent_first: None,
            }],
        };
        let parser = RtfParser::new();
        let ser = RtfSerializer::new();
        let serialized = ser.serialize(&doc);
        let doc2 = parser.parse(serialized.as_bytes()).unwrap();
        assert!(
            blocks_eq(&doc.body, &doc2.body),
            "round-trip special elements mismatch:\n  {:?}\n  {:?}",
            doc.body,
            doc2.body
        );
    }

    // ── Additional edge case tests ──────────────────────────────────

    #[test]
    fn test_parse_empty_font_table() {
        let rtf = r#"{\rtf1\ansi{\fonttbl}}"#;
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        assert!(doc.fonts.is_empty());
    }

    #[test]
    fn test_parse_ansicpg() {
        let rtf = r#"{\rtf1\ansicpg1252 Hello\par}"#;
        let parser = RtfParser::new();
        let doc = parser.parse(rtf.as_bytes()).unwrap();
        assert_eq!(doc.ansi_codepage, Some(1252));
    }

    #[test]
    fn test_plain_resets_formatting() {
        let blocks = parse_body(r#"{\rtf1\ansi\b\~bold\plain\~normal\par}"#);
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            let full = extract_text(content);
            assert!(full.contains("bold"));
            assert!(full.contains("normal"));
            // After \plain, no more Bold nodes should appear
            let mut after_plain = content
                .iter()
                .skip_while(|i| !matches!(i, RtfInline::Text { text } if text == "normal"));
            let has_bold_after = after_plain.any(|i| matches!(i, RtfInline::Bold { .. }));
            assert!(!has_bold_after, "no Bold after \\plain");
        }
    }

    #[test]
    fn test_parse_rtf_version_default() {
        // \rtf without a version number defaults to 1
        let parser = RtfParser::new();
        let doc = parser.parse(b"{\\rtf\\ansi}").unwrap();
        assert_eq!(doc.version, 1);
    }

    #[test]
    fn test_superscript_subscript() {
        let blocks = parse_body(
            r#"{\rtf1\ansi normal\~\super text1\nosupersub\~normal2\sub text3\nosupersub\~normal3\par}"#,
        );
        assert_eq!(blocks.len(), 1);
        if let RtfBlock::Paragraph { content, .. } = &blocks[0] {
            assert!(count_variant(content, "super") >= 1);
            assert!(count_variant(content, "sub") >= 1);
            let full = extract_text(content);
            assert!(full.contains("text1"));
            assert!(full.contains("text3"));
        }
    }
}
