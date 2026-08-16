//! Parser for Excel-style spreadsheet formulas.

use crate::ast::{BinaryOp, CellErr, Expr, FormulaError, UnaryOp};
use crate::lexer::{Lexer, Token};

/// Parser state
pub struct Parser<'a> {
    lexer: Lexer<'a>,
    current_token: Token,
    peek_token: Token,
}

impl<'a> Parser<'a> {
    pub fn new(input: &'a str) -> Self {
        let mut lexer = Lexer::new(input);
        let current_token = lexer.next_token();
        let peek_token = lexer.next_token();

        Self {
            lexer,
            current_token,
            peek_token,
        }
    }

    fn advance(&mut self) {
        self.current_token = std::mem::replace(&mut self.peek_token, self.lexer.next_token());
    }

    fn current_is(&self, token: &Token) -> bool {
        match (token, &self.current_token) {
            (Token::FormulaStart, Token::FormulaStart) => true,
            (Token::Plus, Token::Plus) => true,
            (Token::Minus, Token::Minus) => true,
            (Token::Multiply, Token::Multiply) => true,
            (Token::Divide, Token::Divide) => true,
            (Token::Power, Token::Power) => true,
            (Token::Equal, Token::Equal) => true,
            (Token::NotEqual, Token::NotEqual) => true,
            (Token::LessThan, Token::LessThan) => true,
            (Token::LessThanOrEqual, Token::LessThanOrEqual) => true,
            (Token::GreaterThan, Token::GreaterThan) => true,
            (Token::GreaterThanOrEqual, Token::GreaterThanOrEqual) => true,
            (Token::Concatenate, Token::Concatenate) => true,
            (Token::Range, Token::Range) => true,
            (Token::LParen, Token::LParen) => true,
            (Token::RParen, Token::RParen) => true,
            (Token::Comma, Token::Comma) => true,
            (Token::Semicolon, Token::Semicolon) => true,
            (Token::LBrace, Token::LBrace) => true,
            (Token::RBrace, Token::RBrace) => true,
            (Token::Bang, Token::Bang) => true,
            (Token::Dollar, Token::Dollar) => true,
            (Token::True, Token::True) => true,
            (Token::False, Token::False) => true,
            (Token::Eof, Token::Eof) => true,
            _ => false,
        }
    }

    fn peek_is(&self, token: &Token) -> bool {
        match (token, &self.peek_token) {
            (Token::FormulaStart, Token::FormulaStart) => true,
            (Token::Plus, Token::Plus) => true,
            (Token::Minus, Token::Minus) => true,
            (Token::Multiply, Token::Multiply) => true,
            (Token::Divide, Token::Divide) => true,
            (Token::Power, Token::Power) => true,
            (Token::Equal, Token::Equal) => true,
            (Token::NotEqual, Token::NotEqual) => true,
            (Token::LessThan, Token::LessThan) => true,
            (Token::LessThanOrEqual, Token::LessThanOrEqual) => true,
            (Token::GreaterThan, Token::GreaterThan) => true,
            (Token::GreaterThanOrEqual, Token::GreaterThanOrEqual) => true,
            (Token::Concatenate, Token::Concatenate) => true,
            (Token::Range, Token::Range) => true,
            (Token::LParen, Token::LParen) => true,
            (Token::RParen, Token::RParen) => true,
            (Token::Comma, Token::Comma) => true,
            (Token::Semicolon, Token::Semicolon) => true,
            (Token::LBrace, Token::LBrace) => true,
            (Token::RBrace, Token::RBrace) => true,
            (Token::Bang, Token::Bang) => true,
            (Token::Dollar, Token::Dollar) => true,
            (Token::True, Token::True) => true,
            (Token::False, Token::False) => true,
            (Token::Eof, Token::Eof) => true,
            _ => false,
        }
    }

    fn expect(&mut self, token: &Token) -> Result<(), FormulaError> {
        if !self.current_is(token) {
            return Err(FormulaError::Syntax {
                pos: self.lexer.position(),
                message: format!(
                    "Expected {:?}, got {:?}",
                    token.to_string(),
                    self.current_token.to_string()
                ),
            });
        }
        self.advance();
        Ok(())
    }

    pub fn parse(&mut self) -> Result<Expr, FormulaError> {
        if self.current_is(&Token::FormulaStart) {
            self.advance();
        }

        let expr = self.parse_expression(0)?;

        if !self.current_is(&Token::Eof) {
            // Try to parse more or ignore
        }

        Ok(expr)
    }

    pub fn parse_expr(input: &str) -> Result<Expr, FormulaError> {
        let mut parser = Parser::new(input);
        parser.parse()
    }

    fn get_precedence(&self, token: &Token) -> u8 {
        match token {
            Token::LParen => 10,
            Token::Range => 9,
            Token::Power => 7,
            Token::Multiply | Token::Divide => 6,
            Token::Plus | Token::Minus => 5,
            Token::Concatenate => 4,
            Token::Equal
            | Token::NotEqual
            | Token::LessThan
            | Token::LessThanOrEqual
            | Token::GreaterThan
            | Token::GreaterThanOrEqual => 3,
            _ => 0,
        }
    }

    fn is_right_associative(&self, token: &Token) -> bool {
        matches!(token, Token::Power)
    }

    fn is_unary_operator(&self, token: &Token) -> bool {
        matches!(token, Token::Plus | Token::Minus)
    }

    fn get_infix_operator(&self) -> Option<Token> {
        match &self.current_token {
            Token::Plus
            | Token::Minus
            | Token::Multiply
            | Token::Divide
            | Token::Power
            | Token::Concatenate
            | Token::Equal
            | Token::NotEqual
            | Token::LessThan
            | Token::LessThanOrEqual
            | Token::GreaterThan
            | Token::GreaterThanOrEqual
            | Token::Range => Some(self.current_token.clone()),
            _ => None,
        }
    }

    fn parse_expression(&mut self, min_precedence: u8) -> Result<Expr, FormulaError> {
        let mut left = self.parse_primary()?;

        while let Some(op) = self.get_infix_operator() {
            let op_precedence = self.get_precedence(&op);

            if op_precedence < min_precedence {
                break;
            }

            let next_min = if self.is_right_associative(&op) {
                op_precedence
            } else {
                op_precedence + 1
            };

            self.advance();
            let right = self.parse_expression(next_min)?;

            left = self.create_binary_expr(op, left, right)?;
        }

        Ok(left)
    }

    fn create_binary_expr(&self, op: Token, lhs: Expr, rhs: Expr) -> Result<Expr, FormulaError> {
        let op_enum = match op {
            Token::Plus => BinaryOp::Add,
            Token::Minus => BinaryOp::Subtract,
            Token::Multiply => BinaryOp::Multiply,
            Token::Divide => BinaryOp::Divide,
            Token::Power => BinaryOp::Power,
            Token::Concatenate => BinaryOp::Concatenate,
            Token::Equal => BinaryOp::Equal,
            Token::NotEqual => BinaryOp::NotEqual,
            Token::LessThan => BinaryOp::LessThan,
            Token::LessThanOrEqual => BinaryOp::LessThanOrEqual,
            Token::GreaterThan => BinaryOp::GreaterThan,
            Token::GreaterThanOrEqual => BinaryOp::GreaterThanOrEqual,
            Token::Range => BinaryOp::Range,
            _ => {
                return Err(FormulaError::InvalidToken(
                    "Invalid binary operator".to_string(),
                ));
            }
        };

        Ok(Expr::Binary {
            op: op_enum,
            lhs: Box::new(lhs),
            rhs: Box::new(rhs),
        })
    }

    fn parse_primary(&mut self) -> Result<Expr, FormulaError> {
        match self.current_token.clone() {
            Token::Number(n) => {
                self.advance();
                Ok(Expr::Num(n))
            }
            Token::Text(s) => {
                self.advance();
                Ok(Expr::Text(s))
            }
            Token::True => {
                self.advance();
                Ok(Expr::Bool(true))
            }
            Token::False => {
                self.advance();
                Ok(Expr::Bool(false))
            }
            Token::Identifier(name) => {
                if self.peek_is(&Token::LParen) {
                    self.advance();
                    self.parse_function_call(name.clone())
                } else {
                    self.advance();
                    Ok(Expr::NamedRange(name.clone()))
                }
            }
            Token::CellRef(cell_ref) => {
                self.advance();
                Ok(Expr::CellRef(cell_ref.clone()))
            }
            Token::RangeRef(range_ref) => {
                self.advance();
                Ok(Expr::RangeRef(range_ref.clone()))
            }
            Token::Error(err) => {
                self.advance();
                Ok(Expr::Error(match err.as_str() {
                    "#NULL!" => CellErr::Null,
                    "#DIV/0!" => CellErr::DivByZero,
                    "#VALUE!" => CellErr::Value,
                    "#REF!" => CellErr::Ref,
                    "#NAME?" => CellErr::Name,
                    "#NUM!" => CellErr::Num,
                    "#N/A" => CellErr::NA,
                    _ => CellErr::Value,
                }))
            }
            Token::LParen => {
                self.advance();
                let expr = self.parse_expression(0)?;
                self.expect(&Token::RParen)?;
                Ok(expr)
            }
            Token::LBrace => self.parse_array_literal(),
            Token::Plus | Token::Minus => self.parse_unary_expression(),
            Token::FormulaStart => {
                self.advance();
                self.parse_expression(0)
            }
            _ => Err(FormulaError::Syntax {
                pos: self.lexer.position(),
                message: format!("Unexpected token: {:?}", self.current_token.to_string()),
            }),
        }
    }

    fn parse_unary_expression(&mut self) -> Result<Expr, FormulaError> {
        let op = if self.current_is(&Token::Plus) {
            UnaryOp::Plus
        } else {
            UnaryOp::Minus
        };

        self.advance();
        let operand = self.parse_primary()?;

        Ok(Expr::Unary {
            op,
            operand: Box::new(operand),
        })
    }

    fn parse_function_call(&mut self, name: String) -> Result<Expr, FormulaError> {
        let mut args = Vec::new();

        self.expect(&Token::LParen)?;

        if !self.current_is(&Token::RParen) {
            loop {
                args.push(self.parse_expression(0)?);

                if self.current_is(&Token::RParen) {
                    break;
                }

                self.expect(&Token::Comma)?;

                if self.current_is(&Token::RParen) {
                    break;
                }
            }
        }

        self.expect(&Token::RParen)?;

        Ok(Expr::Func { name, args })
    }

    fn parse_array_literal(&mut self) -> Result<Expr, FormulaError> {
        self.expect(&Token::LBrace)?;

        let mut rows = Vec::new();
        let mut current_row = Vec::new();

        // Parse first element
        if !self.current_is(&Token::RBrace) {
            current_row.push(self.parse_expression(0)?);
        }

        loop {
            match &self.current_token {
                Token::Comma => {
                    self.advance();
                    current_row.push(self.parse_expression(0)?);
                }
                Token::Semicolon => {
                    self.advance();
                    rows.push(current_row);
                    current_row = Vec::new();
                    if !self.current_is(&Token::RBrace) {
                        current_row.push(self.parse_expression(0)?);
                    }
                }
                Token::RBrace => {
                    rows.push(current_row);
                    self.advance();
                    break;
                }
                _ => {
                    return Err(FormulaError::Syntax {
                        pos: self.lexer.position(),
                        message: format!(
                            "Expected comma, semicolon, or }}: {:?}",
                            self.current_token.to_string()
                        ),
                    });
                }
            }
        }

        Ok(Expr::Array(rows))
    }
}

/// Parse a formula string into an AST expression
pub fn parse(input: &str) -> Result<Expr, FormulaError> {
    let mut parser = Parser::new(input);
    parser.parse()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Basic number tests
    #[test]
    fn test_parse_number() {
        assert_eq!(parse("123").unwrap(), Expr::Num(123.0));
        assert_eq!(parse("456.789").unwrap(), Expr::Num(456.789));
    }

    // Basic text tests
    #[test]
    fn test_parse_text() {
        assert_eq!(
            parse(r#""Hello""#).unwrap(),
            Expr::Text("Hello".to_string())
        );
    }

    // Boolean tests
    #[test]
    fn test_parse_boolean() {
        assert_eq!(parse("TRUE").unwrap(), Expr::Bool(true));
        assert_eq!(parse("FALSE").unwrap(), Expr::Bool(false));
    }

    // Binary operator tests
    #[test]
    fn test_parse_addition() {
        let expr = parse("1+2").unwrap();
        match expr {
            Expr::Binary { op, lhs, rhs } => {
                assert_eq!(op, BinaryOp::Add);
                assert_eq!(*lhs, Expr::Num(1.0));
                assert_eq!(*rhs, Expr::Num(2.0));
            }
            _ => panic!("Expected Binary"),
        }
    }

    #[test]
    fn test_parse_multiplication() {
        let expr = parse("2*3").unwrap();
        match expr {
            Expr::Binary {
                op: BinaryOp::Multiply,
                ..
            } => {}
            _ => panic!("Expected Multiplication"),
        }
    }

    // Function call tests
    #[test]
    fn test_parse_function() {
        let expr = parse("SUM(1,2,3)").unwrap();
        match expr {
            Expr::Func { name, args } => {
                assert_eq!(name, "SUM");
                assert_eq!(args.len(), 3);
            }
            _ => panic!("Expected Func"),
        }
    }

    // Formula start tests
    #[test]
    fn test_parse_formula_start() {
        let expr = parse("=1+2").unwrap();
        match expr {
            Expr::Binary { .. } => {}
            _ => panic!("Expected binary expression"),
        }
    }

    // Operator precedence tests
    #[test]
    fn test_operator_precedence() {
        let expr = parse("1+2*3").unwrap();
        match expr {
            Expr::Binary {
                op: BinaryOp::Add,
                rhs,
                ..
            } => match *rhs {
                Expr::Binary {
                    op: BinaryOp::Multiply,
                    ..
                } => {}
                _ => panic!("Expected multiplication in right side"),
            },
            _ => panic!("Expected addition"),
        }
    }

    // 30 grammar tests from contract
    #[test]
    fn grammar_test_01() {
        assert!(parse("1+2").is_ok());
    }
    #[test]
    fn grammar_test_02() {
        assert!(parse("5-3").is_ok());
    }
    #[test]
    fn grammar_test_03() {
        assert!(parse("2*3").is_ok());
    }
    #[test]
    fn grammar_test_04() {
        assert!(parse("10/2").is_ok());
    }
    #[test]
    fn grammar_test_05() {
        assert!(parse("2^3").is_ok());
    }
    #[test]
    fn grammar_test_06() {
        assert!(parse("A1=B1").is_ok());
    }
    #[test]
    fn grammar_test_07() {
        assert!(parse("A1<>B1").is_ok());
    }
    #[test]
    fn grammar_test_08() {
        assert!(parse("A1<B1").is_ok());
    }
    #[test]
    fn grammar_test_09() {
        assert!(parse("A1<=B1").is_ok());
    }
    #[test]
    fn grammar_test_10() {
        assert!(parse("A1>B1").is_ok());
    }
    #[test]
    fn grammar_test_11() {
        assert!(parse("A1>=B1").is_ok());
    }
    #[test]
    fn grammar_test_12() {
        assert!(parse(r#""A"&"B""#).is_ok());
    }
    #[test]
    fn grammar_test_13() {
        assert!(parse("A1").is_ok());
    }
    #[test]
    fn grammar_test_14() {
        assert!(parse("$A$1").is_ok());
    }
    #[test]
    fn grammar_test_15() {
        assert!(parse("A$1").is_ok());
    }
    #[test]
    fn grammar_test_16() {
        assert!(parse("$A1").is_ok());
    }
    #[test]
    fn grammar_test_17() {
        assert!(parse("R1C1").is_ok());
    }
    #[test]
    fn grammar_test_18() {
        assert!(parse("R[1]C[1]").is_ok());
    }
    #[test]
    fn grammar_test_19() {
        assert!(parse("Sheet1!A1").is_ok());
    }
    #[test]
    fn grammar_test_20() {
        assert!(parse("Sheet1!$A$1").is_ok());
    }
    #[test]
    fn grammar_test_21() {
        assert!(parse("A1:B2").is_ok());
    }
    #[test]
    fn grammar_test_22() {
        assert!(parse("Sheet1!A1:B2").is_ok());
    }
    #[test]
    fn grammar_test_23() {
        assert!(parse("{1,2,3}").is_ok());
    }
    #[test]
    fn grammar_test_24() {
        assert!(parse("{1,2;3,4}").is_ok());
    }
    #[test]
    fn grammar_test_25() {
        assert!(parse("NOW()").is_ok());
    }
    #[test]
    fn grammar_test_26() {
        assert!(parse("SUM(A1)").is_ok());
    }
    #[test]
    fn grammar_test_27() {
        assert!(parse("SUM(A1,B2)").is_ok());
    }
    #[test]
    fn grammar_test_28() {
        assert!(parse("SUM(SUM(A1))").is_ok());
    }
    #[test]
    fn grammar_test_29() {
        assert!(parse("=A1+B1").is_ok());
    }
    #[test]
    fn grammar_test_30() {
        assert!(parse("=SUM(A1:B2)*MAX(C1:C10)").is_ok());
    }
}
