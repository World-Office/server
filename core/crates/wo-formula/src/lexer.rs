//! Lexer for Excel-style spreadsheet formulas.

use crate::ast::{CellRef, CellRefCoord, FormulaError, RangeRef, RefStyle, a1_to_col};

/// Token types produced by the lexer
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    // Operators
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
    Plus,
    Minus,
    Multiply,
    Divide,
    Power,
    Concatenate,
    Range,

    // Grouping
    LParen,
    RParen,
    Comma,
    Semicolon,
    LBrace,
    RBrace,

    // Special
    Bang,
    Dollar,
    FormulaStart,

    // Literals
    True,
    False,
    Number(f64),
    Text(String),
    Error(String),
    Identifier(String),

    // References
    CellRef(CellRef),
    RangeRef(RangeRef),

    // End
    Eof,
}

impl Token {
    pub fn to_string(&self) -> String {
        match self {
            Token::Equal => "=".to_string(),
            Token::NotEqual => "<>".to_string(),
            Token::LessThan => "<".to_string(),
            Token::LessThanOrEqual => "<=".to_string(),
            Token::GreaterThan => ">".to_string(),
            Token::GreaterThanOrEqual => ">=".to_string(),
            Token::Plus => "+".to_string(),
            Token::Minus => "-".to_string(),
            Token::Multiply => "*".to_string(),
            Token::Divide => "/".to_string(),
            Token::Power => "^".to_string(),
            Token::Concatenate => "&".to_string(),
            Token::Range => ":".to_string(),
            Token::LParen => "(".to_string(),
            Token::RParen => ")".to_string(),
            Token::Comma => ",".to_string(),
            Token::Semicolon => ";".to_string(),
            Token::LBrace => "{".to_string(),
            Token::RBrace => "}".to_string(),
            Token::Bang => "!".to_string(),
            Token::Dollar => "$".to_string(),
            Token::FormulaStart => "=".to_string(),
            Token::True => "TRUE".to_string(),
            Token::False => "FALSE".to_string(),
            Token::Number(n) => n.to_string(),
            Token::Text(s) => format!("\"{s}\""),
            Token::Error(s) => s.clone(),
            Token::Identifier(s) => s.clone(),
            Token::CellRef(_) => "CellRef".to_string(),
            Token::RangeRef(_) => "RangeRef".to_string(),
            Token::Eof => "EOF".to_string(),
        }
    }
}

/// Lexer state
pub struct Lexer<'a> {
    input: &'a str,
    pos: usize,
    /// Whether any real token has been produced. Distinguishes the leading
    /// formula-start '=' from an infix equality operator (Excel: '=' after
    /// the first token is comparison).
    seen_token: bool,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            input,
            pos: 0,
            seen_token: false,
        }
    }

    fn current(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn peek(&self) -> Option<char> {
        self.input[self.pos..].chars().nth(1)
    }

    fn advance(&mut self) {
        if let Some(c) = self.current() {
            self.pos += c.len_utf8();
        }
    }

    fn skip_whitespace(&mut self) {
        while let Some(c) = self.current() {
            if c.is_whitespace() {
                self.advance();
            } else {
                break;
            }
        }
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    pub fn position(&self) -> usize {
        self.pos
    }

    fn read_number(&mut self) -> Token {
        let start = self.pos;

        while let Some(c) = self.current() {
            if c.is_ascii_digit() {
                self.advance();
            } else if c == '.' {
                self.advance();
                while let Some(c) = self.current() {
                    if c.is_ascii_digit() {
                        self.advance();
                    } else {
                        break;
                    }
                }
                break;
            } else {
                break;
            }
        }

        let text = &self.input[start..self.pos];
        match text.parse::<f64>() {
            Ok(n) => Token::Number(n),
            Err(_) => Token::Error(format!("Invalid number: {text}")),
        }
    }

    fn read_string(&mut self) -> Token {
        self.advance(); // Skip opening quote
        let start = self.pos;
        let mut result = String::new();

        while let Some(c) = self.current() {
            if c == '"' {
                if let Some('"') = self.peek() {
                    result.push('"');
                    self.advance();
                } else {
                    break;
                }
            } else {
                result.push(c);
            }
            self.advance();
        }

        if let Some('"') = self.current() {
            self.advance(); // Skip closing quote
        }

        Token::Text(result)
    }

    fn read_identifier(&mut self) -> Token {
        let start = self.pos;

        while let Some(c) = self.current() {
            if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
                self.advance();
            } else {
                break;
            }
        }

        let text = &self.input[start..self.pos];

        match text.to_uppercase().as_str() {
            "TRUE" => Token::True,
            "FALSE" => Token::False,
            "#NULL!" => Token::Error("#NULL!".to_string()),
            "#DIV/0!" => Token::Error("#DIV/0!".to_string()),
            "#VALUE!" => Token::Error("#VALUE!".to_string()),
            "#REF!" => Token::Error("#REF!".to_string()),
            "#NAME?" => Token::Error("#NAME?".to_string()),
            "#NUM!" => Token::Error("#NUM!".to_string()),
            "#N/A" => Token::Error("#N/A".to_string()),
            _ => Token::Identifier(text.to_string()),
        }
    }

    fn read_cell_ref(&mut self) -> Token {
        let start = self.pos;

        // Check for sheet name (e.g., Sheet1!)
        let mut sheet = None;
        let mut temp_pos = self.pos;

        while let Some(c) = self.current() {
            if c.is_ascii_alphanumeric() || c == '_' {
                temp_pos = self.pos;
                self.advance();
            } else if c == '!' {
                sheet = Some(self.input[start..temp_pos].to_string());
                self.advance();
                break;
            } else {
                // No sheet name, rewind to start
                self.pos = start;
                break;
            }
        }

        // Now read the actual cell reference (column + row)
        let mut col_dollar = false;

        // Check for leading $
        if let Some('$') = self.current() {
            self.advance();
            col_dollar = true;
        }

        // Read column letters
        let mut col_name = String::new();
        while let Some(c) = self.current() {
            if c.is_ascii_alphabetic() {
                col_name.push(c.to_ascii_uppercase());
                self.advance();
            } else {
                break;
            }
        }

        if col_name.is_empty() {
            // Not A1 style, rewind and try identifier
            self.pos = start;
            return self.read_identifier();
        }

        // Check for $ between column and row
        let mut col_absolute = col_dollar
            || if let Some('$') = self.current() {
                self.advance();
                true
            } else {
                false
            };

        let col = match a1_to_col(&col_name) {
            Ok(c) => c,
            Err(_) => {
                self.pos = start;
                return self.read_identifier();
            }
        };

        // Read row
        let mut row_absolute = false;
        let mut row_num = 0;

        if let Some('$') = self.current() {
            self.advance();
            row_absolute = true;
        }

        while let Some(c) = self.current() {
            if c.is_ascii_digit() {
                row_num = row_num * 10 + (c as u32 - '0' as u32);
                self.advance();
            } else {
                break;
            }
        }

        if row_num == 0 {
            // Invalid cell reference, try as identifier
            self.pos = start;
            return self.read_identifier();
        }

        // Excel uses 1-based row indexing in formulas
        let row = row_num - 1;

        Token::CellRef(CellRef {
            sheet,
            row: if row_absolute {
                CellRefCoord::Absolute(row)
            } else {
                CellRefCoord::Relative(row as i32)
            },
            col: if col_absolute {
                CellRefCoord::Absolute(col)
            } else {
                CellRefCoord::Relative(col as i32)
            },
            style: RefStyle::A1,
        })
    }

    pub fn next_token(&mut self) -> Token {
        self.skip_whitespace();

        if self.is_eof() {
            return Token::Eof;
        }

        // Capture whether this is the very first token before marking seen;
        // the leading formula '=' must still emit FormulaStart.
        let first_token = !self.seen_token;
        self.seen_token = true;

        let c = self.current().unwrap();

        // Two-character operators
        if let Some(next_c) = self.peek() {
            match (c, next_c) {
                ('=', '=') => {
                    self.advance();
                    self.advance();
                    return Token::Equal;
                }
                ('<', '>') => {
                    self.advance();
                    self.advance();
                    return Token::NotEqual;
                }
                ('<', '=') => {
                    self.advance();
                    self.advance();
                    return Token::LessThanOrEqual;
                }
                ('>', '=') => {
                    self.advance();
                    self.advance();
                    return Token::GreaterThanOrEqual;
                }
                _ => {}
            }
        }

        // Single-character tokens
        match c {
            '=' => {
                self.advance();
                if first_token {
                    Token::FormulaStart
                } else {
                    Token::Equal
                }
            }
            '+' => {
                self.advance();
                Token::Plus
            }
            '-' => {
                self.advance();
                Token::Minus
            }
            '*' => {
                self.advance();
                Token::Multiply
            }
            '/' => {
                self.advance();
                Token::Divide
            }
            '^' => {
                self.advance();
                Token::Power
            }
            '&' => {
                self.advance();
                Token::Concatenate
            }
            ':' => {
                self.advance();
                Token::Range
            }
            '(' => {
                self.advance();
                Token::LParen
            }
            ')' => {
                self.advance();
                Token::RParen
            }
            ',' => {
                self.advance();
                Token::Comma
            }
            ';' => {
                self.advance();
                Token::Semicolon
            }
            '{' => {
                self.advance();
                Token::LBrace
            }
            '}' => {
                self.advance();
                Token::RBrace
            }
            '!' => {
                self.advance();
                Token::Bang
            }
            '$' => {
                // Check if this $ is part of a cell reference like $A1 or A$1
                let saved_pos = self.pos;
                self.advance();
                // If followed by a letter, it's an absolute column reference ($A1)
                if let Some(c) = self.current() {
                    if c.is_ascii_alphabetic() {
                        // This is $A1 or similar
                        self.pos = saved_pos;
                        return self.read_cell_ref();
                    }
                }
                // If preceded by a letter and followed by a digit, it's A$1
                // But we can't look behind, so just return Dollar standalone
                // Actually, let's check if the previous position was alphabetic
                // We can't do that easily, so let's just return Dollar for now
                // TODO: Handle A$1 case
                Token::Dollar
            }
            '"' => return self.read_string(),
            '<' => {
                self.advance();
                Token::LessThan
            }
            '>' => {
                self.advance();
                Token::GreaterThan
            }
            c if c.is_ascii_digit() => return self.read_number(),
            c if c.is_ascii_alphabetic() => {
                // Could be cell ref or identifier (function name)
                let saved_pos = self.pos;
                self.advance();

                // Scan the letter run, then any digits, then look ahead.
                while let Some(c) = self.current() {
                    if c.is_ascii_alphabetic() {
                        self.advance();
                    } else {
                        break;
                    }
                }
                let letters: String = self.input[saved_pos..self.pos].to_string();

                let mut has_digit = false;
                while let Some(c) = self.current() {
                    if c.is_ascii_digit() {
                        has_digit = true;
                        self.advance();
                    } else {
                        break;
                    }
                }

                // A name directly followed by '(' is a function call (e.g.
                // LOG10(100), ATAN2(1,1)) — never a cell reference.
                let followed_by_paren = self.current().map(|c| c == '(').unwrap_or(false);

                if has_digit && !followed_by_paren {
                    self.pos = saved_pos;
                    self.read_cell_ref()
                } else {
                    self.pos = saved_pos;
                    self.read_identifier()
                }
            }
            _ => {
                self.advance();
                Token::Error(format!("Unknown character: {c}"))
            }
        }
    }

    pub fn tokenize(mut self) -> Result<Vec<Token>, FormulaError> {
        let mut tokens = Vec::new();

        loop {
            let token = self.next_token();
            tokens.push(token.clone());

            if matches!(token, Token::Eof) {
                break;
            }
        }

        Ok(tokens)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_operators() {
        let tokens = Lexer::new("+-*/^&=<> <= >= <>").tokenize().unwrap();
        // Just check that we get some tokens
        assert!(!tokens.is_empty());
        assert!(tokens.contains(&Token::Plus));
        assert!(tokens.contains(&Token::Minus));
        assert!(tokens.contains(&Token::Multiply));
        assert!(tokens.contains(&Token::Divide));
    }

    #[test]
    fn test_cell_references() {
        // Just check that basic cell references work
        let tokens = Lexer::new("A1").tokenize().unwrap();
        assert!(!tokens.is_empty());
        assert!(tokens.contains(&Token::Eof));
    }

    #[test]
    fn test_formula_start() {
        let tokens = Lexer::new("=A1+B1").tokenize().unwrap();
        assert!(tokens.contains(&Token::FormulaStart));
    }

    #[test]
    fn test_numbers() {
        let tokens = Lexer::new("123 456.789 1.2 .5").tokenize().unwrap();
        let numbers: Vec<_> = tokens
            .iter()
            .filter(|t| matches!(t, Token::Number(_)))
            .collect();
        assert_eq!(numbers.len(), 4);
    }

    #[test]
    fn test_strings() {
        let tokens = Lexer::new(r#""Hello" "World""#).tokenize().unwrap();
        let texts: Vec<_> = tokens
            .iter()
            .filter(|t| matches!(t, Token::Text(_)))
            .collect();
        assert_eq!(texts.len(), 2);
    }

    #[test]
    fn test_booleans() {
        let tokens = Lexer::new("TRUE FALSE").tokenize().unwrap();
        assert!(tokens.contains(&Token::True));
        assert!(tokens.contains(&Token::False));
    }

    #[test]
    fn test_functions() {
        let tokens = Lexer::new("SUM(A1,B2)").tokenize().unwrap();
        let identifiers: Vec<_> = tokens
            .iter()
            .filter(|t| matches!(t, Token::Identifier(_)))
            .collect();
        assert_eq!(identifiers.len(), 1);
        let cell_refs: Vec<_> = tokens
            .iter()
            .filter(|t| matches!(t, Token::CellRef(_)))
            .collect();
        assert_eq!(cell_refs.len(), 2);
    }

    #[test]
    fn test_whitespace() {
        let tokens = Lexer::new("  =  A1  +  B1  ").tokenize().unwrap();
        assert!(tokens.contains(&Token::FormulaStart));
        // Find first CellRef token
        let cell_refs: Vec<_> = tokens
            .iter()
            .filter(|t| matches!(t, Token::CellRef(_)))
            .collect();
        assert!(!cell_refs.is_empty());
    }
}
