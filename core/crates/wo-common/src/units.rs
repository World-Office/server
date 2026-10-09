//! Central unit-conversion matrix for the OO core.
//!
//! This module is the single conversion authority for the physical units used
//! across the OO formats (DOCX/XLSX/PPTX), mirroring the semantics of the
//! reference OO core (`OOXML/Base/Unit.{h,cpp}`): every scale is expressed in
//! English Metric Units (EMU), where 1 inch = 914,400 EMU.
//!
//! # Rounding
//!
//! Integer helpers use exact integer arithmetic only. `emu_to_pt` truncates
//! toward zero (matching C integer division in the OO reference). `emu_to_cm`
//! returns `f64` because centimetres are inherently fractional; no rounding
//! is applied.

/// EMU per centimetre: 1 cm = 360,000 EMU.
pub const CM_TO_EMU: i64 = 360_000;

/// EMU per inch: 1 in = 914,400 EMU.
pub const IN_TO_EMU: i64 = 914_400;

/// EMU per point: 1 pt = 1/72 in = 12,700 EMU.
pub const EMU_PER_PT: i64 = 12_700;

/// EMU per twip — the DXA→SX scale: 1 twip = 1/20 pt = 635 EMU.
pub const DX_TO_SX: i64 = 635;

/// Points per inch: 1 in = 72 pt.
pub const PT_PER_IN: f64 = 72.0;

/// Pixels per inch (CSS reference pixel, 96 DPI): 1 in = 96 px.
pub const PX_PER_IN: f64 = 96.0;

/// Twips per inch: 1 in = 1,440 twips.
pub const TWIPS_PER_IN: i64 = 1_440;

/// Convert points to EMU (exact).
pub const fn pt_to_emu(pt: i64) -> i64 {
    pt * EMU_PER_PT
}

/// Convert EMU to points (truncates toward zero, like C integer division).
pub const fn emu_to_pt(emu: i64) -> i64 {
    emu / EMU_PER_PT
}

/// Convert twips (DXA) to EMU (exact — the SX scale *is* EMU).
pub const fn twips_to_emu(twips: i64) -> i64 {
    twips * DX_TO_SX
}

/// Convert EMU to centimetres (f64, no rounding).
pub const fn emu_to_cm(emu: i64) -> f64 {
    emu as f64 / CM_TO_EMU as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_units_matrix() {
        // The exact OO Unit matrix.
        assert_eq!(IN_TO_EMU, 914_400); // 1in = 914400 EMU
        assert_eq!(CM_TO_EMU, 360_000); // 1cm = 360000 EMU
        assert_eq!(EMU_PER_PT, 12_700); // 1pt = 12700 EMU
        assert_eq!(DX_TO_SX, 635); // 1twip = 635 EMU (Sx == EMU)
        assert_eq!(PT_PER_IN, 72.0); // 1in = 72pt
        assert_eq!(PX_PER_IN, 96.0); // 1in = 96px
        assert_eq!(TWIPS_PER_IN, 1_440); // 1in = 1440 twips

        // Cross-matrix identities.
        assert_eq!(EMU_PER_PT * 72, IN_TO_EMU); // 72pt span one inch
        assert_eq!(TWIPS_PER_IN * DX_TO_SX, IN_TO_EMU); // 1440 twips span one inch

        // cm <-> in consistency: 2.54 cm == 1 in in EMU within 1 EMU.
        assert!((2.54 * CM_TO_EMU as f64 - IN_TO_EMU as f64).abs() < 1.0);
    }

    #[test]
    fn test_units_helpers() {
        assert_eq!(pt_to_emu(1), 12_700);
        assert_eq!(pt_to_emu(72), IN_TO_EMU);
        assert_eq!(emu_to_pt(12_700), 1);
        assert_eq!(emu_to_pt(72 * 12_700), 72);
        // Truncation documented: 25_399 EMU is just under 2pt.
        assert_eq!(emu_to_pt(25_399), 1);
        assert_eq!(twips_to_emu(1_440), IN_TO_EMU);
        assert_eq!(twips_to_emu(20), EMU_PER_PT);
        assert!((emu_to_cm(CM_TO_EMU) - 1.0).abs() < f64::EPSILON);
        assert!((emu_to_cm(IN_TO_EMU) - 2.54).abs() < 1e-9);
    }
}
