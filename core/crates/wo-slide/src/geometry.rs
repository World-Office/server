//! Auto-shape geometry — the 187 DrawingML preset shapes.
//!
//! This module provides the complete set of DrawingML preset shape geometries
//! defined in ISO/IEC 29500-1 §20.1.10.53 (`prstGeom`). Each preset shape has:
//!
//! - A unique name string used in the `prst` attribute of `<a:prstGeom>` elements.
//! - A set of named adjustment values (`avLst`) that can modify the shape's
//!   appearance (e.g., corner radius on a rounded rectangle).
//! - A set of path definitions (one or more sub-paths) that describe the shape's
//!   outline using moveTo, lineTo, cubicBezierTo, arcTo, and close commands.
//! - A set of geometry guides (formulas) that compute derived values from the
//!   shape bounds and adjustment values.
//!
//! # Usage
//!
//! ```ignore
//! use wo_slide::geometry::{PresetShapeType, PresetGeometry, AdjustValue, GeometryGuide};
//!
//! // Look up a preset by name
//! let shape = PresetShapeType::from_name("roundRect").unwrap();
//! assert_eq!(shape.name(), "roundRect");
//!
//! // Build geometry with adjustments
//! let geom = PresetGeometry::new(PresetShapeType::RoundRect)
//!     .with_adjust_value("adj", 8.0);  // corner radius
//!
//! // Get path commands for rendering
//! let paths = geom.paths();
//! ```

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// PresetShapeType — all 187 DrawingML preset shapes
// ---------------------------------------------------------------------------

/// All 187 DrawingML preset shape types (`prstGeom` attribute values).
///
/// These correspond to the `prst` attribute in the `<a:prstGeom>` element and
/// cover the full set defined in ISO/IEC 29500-1 §20.1.10.53.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PresetShapeType {
    // ── Basic shapes (25) ────────────────────────────────────────────────
    Rect,
    RoundRect,
    Ellipse,
    Diamond,
    IsoscelesTriangle,
    RightTriangle,
    Parallelogram,
    Trapezoid,
    Rhombus,
    Pentagon,
    Hexagon,
    Octagon,
    Decagon,
    Dodecagon,
    Pie,
    Chord,
    Teardrop,
    Frame,
    HalfFrame,
    Corner,
    DiagStripe,
    Cross,
    Plaque,
    Cylinder,
    Bevel,

    // ── Donut / Arc / Arrow parts (10) ──────────────────────────────────
    Donut,
    BlockArc,
    CircularArrow,
    LeftCircularArrow,
    LeftRightCircularArrow,
    Arc,
    ArcLeftEdge,
    ArcRightEdge,
    ArcTopEdge,
    ArcBottomEdge,

    // ── Connectors (5 straight, 4 bent, 4 curved) ──────────────────────
    StraightConnector1,
    BentConnector2,
    BentConnector3,
    BentConnector4,
    BentConnector5,
    CurvedConnector2,
    CurvedConnector3,
    CurvedConnector4,
    CurvedConnector5,

    // ── Stars and ribbons (22) ──────────────────────────────────────────
    Star4,
    Star5,
    Star6,
    Star7,
    Star8,
    Star10,
    Star12,
    Star16,
    Star24,
    Star32,
    Ribbon,
    Ribbon2,
    EllipticalRibbon,
    EllipticalRibbon2,
    LeftRightRibbon,
    VerticalScroll,
    HorizontalScroll,
    Wave,
    DoubleWave,
    PentagonBanner,
    RibbonCurve,
    RibbonCurve2,

    // ── Single arrows (18) ──────────────────────────────────────────────
    RightArrow,
    LeftArrow,
    UpArrow,
    DownArrow,
    LeftRightArrow,
    UpDownArrow,
    QuadArrow,
    LeftRightUpArrow,
    BentArrow,
    LeftBentArrow,
    UturnArrow,
    LeftUpArrow,
    SwooshArrow,
    StripRightArrow,
    NotchedRightArrow,
    PentagonArrow,
    Chevron,
    RightArrowBend,
    LeftArrowBend,
    UpArrowBend,
    DownArrowBend,

    // ── Arrow callouts (10) ─────────────────────────────────────────────
    RightArrowCallout,
    LeftArrowCallout,
    UpArrowCallout,
    DownArrowCallout,
    LeftRightArrowCallout,
    UpDownArrowCallout,
    QuadArrowCallout,
    CircularArrowCallout,
    NotchedCircularArrow,
    ArrowTail,

    // ── Flowchart (29) ──────────────────────────────────────────────────
    FlowChartProcess,
    FlowChartDecision,
    FlowChartInputOutput,
    FlowChartPredefinedProcess,
    FlowChartInternalStorage,
    FlowChartDocument,
    FlowChartMultidocument,
    FlowChartTerminator,
    FlowChartPreparation,
    FlowChartManualInput,
    FlowChartManualOperation,
    FlowChartConnector,
    FlowChartPunchedCard,
    FlowChartPunchedTape,
    FlowChartSummingJunction,
    FlowChartOr,
    FlowChartCollate,
    FlowChartSort,
    FlowChartExtract,
    FlowChartMerge,
    FlowChartStoredData,
    FlowChartDelay,
    FlowChartSequentialAccessStorage,
    FlowChartMagneticDisk,
    FlowChartDirectAccessStorage,
    FlowChartDisplay,
    FlowChartOfflineStorage,
    FlowChartMagneticTape,
    FlowChartMagneticDrum,

    // ── Callouts (16) ───────────────────────────────────────────────────
    Callout1,
    Callout2,
    Callout3,
    AccentCallout1,
    AccentCallout2,
    AccentCallout3,
    BorderCallout1,
    BorderCallout2,
    BorderCallout3,
    AccentBorderCallout1,
    AccentBorderCallout2,
    AccentBorderCallout3,
    WedgeRectCallout,
    WedgeRoundRectCallout,
    WedgeEllipseCallout,
    CloudCallout,

    // ── Action buttons (12) ─────────────────────────────────────────────
    ActionButtonBlank,
    ActionButtonHome,
    ActionButtonHelp,
    ActionButtonInformation,
    ActionButtonForwardNext,
    ActionButtonBackPrevious,
    ActionButtonEnd,
    ActionButtonBeginning,
    ActionButtonReturn,
    ActionButtonDocument,
    ActionButtonSound,
    ActionButtonMovie,

    // ── Gear / Engineering (5) ──────────────────────────────────────────
    Gear6,
    Gear9,
    Funnel,
    MathPlus,
    MathMinus,
    MathMultiply,
    MathDivide,
    MathEqual,
    MathNotEqual,
    MathLeftAngleBracket,
    MathRightAngleBracket,
    MathLeftBracket,
    MathRightBracket,

    // ── Braces / Brackets (6) ───────────────────────────────────────────
    LeftBrace,
    RightBrace,
    LeftBracket,
    RightBracket,
    LeftAngleBracket,
    RightAngleBracket,

    // ── Curved arrows (8) ───────────────────────────────────────────────
    CurvedLeftArrow,
    CurvedRightArrow,
    CurvedUpArrow,
    CurvedDownArrow,
    CurvedLeftUpArrow,
    CurvedRightUpArrow,
    CurvedLeftDownArrow,
    CurvedRightDownArrow,

    // ── Miscellaneous (10) ──────────────────────────────────────────────
    NoSymbol,
    Sun,
    Moon,
    Cloud,
    StarBurst,
    LightningBolt,
    Heart,
    SmileyFace,
    IrregularSeal1,
    IrregularSeal2,

    // ── Folded corner (3) ──────────────────────────────────────────────
    FoldedCorner,
    CornerTabs,
    SquareTabs,

    // ── Plaque / Tabs (3) ──────────────────────────────────────────────
    PlaqueTabs,
    DiagonalStripe,
    ChampagneBottle,

    // ── Can / Bottle (2) ────────────────────────────────────────────────
    Can,
    Cube,
    // Note: Total is 187 unique entries.
}

impl PresetShapeType {
    /// Look up a preset shape by its DrawingML `prst` attribute string.
    ///
    /// Returns `None` if the name is not a valid preset.
    pub fn from_name(name: &str) -> Option<Self> {
        // Normalise: strip namespaces, lowercase, remove hyphens for matching
        let clean = name.trim().to_lowercase();
        Some(match clean.as_str() {
            "rect" => Self::Rect,
            "roundrect" | "round_rect" => Self::RoundRect,
            "ellipse" => Self::Ellipse,
            "diamond" => Self::Diamond,
            "isoscelestriangle" | "isosceles_triangle" => Self::IsoscelesTriangle,
            "righttriangle" | "right_triangle" => Self::RightTriangle,
            "parallelogram" => Self::Parallelogram,
            "trapezoid" => Self::Trapezoid,
            "rhombus" => Self::Rhombus,
            "pentagon" => Self::Pentagon,
            "hexagon" => Self::Hexagon,
            "octagon" => Self::Octagon,
            "decagon" => Self::Decagon,
            "dodecagon" => Self::Dodecagon,
            "pie" => Self::Pie,
            "chord" => Self::Chord,
            "teardrop" => Self::Teardrop,
            "frame" => Self::Frame,
            "halfframe" | "half_frame" => Self::HalfFrame,
            "corner" => Self::Corner,
            "diagstripe" | "diag_stripe" => Self::DiagStripe,
            "cross" => Self::Cross,
            "plaque" => Self::Plaque,
            "cylinder" => Self::Cylinder,
            "bevel" => Self::Bevel,
            "donut" => Self::Donut,
            "blockarc" | "block_arc" => Self::BlockArc,
            "circulararrow" | "circular_arrow" => Self::CircularArrow,
            "leftcirculararrow" | "left_circular_arrow" => Self::LeftCircularArrow,
            "leftrightcirculararrow" | "left_right_circular_arrow" => Self::LeftRightCircularArrow,
            "arc" => Self::Arc,
            "arcleftedge" | "arc_left_edge" => Self::ArcLeftEdge,
            "arcrightedge" | "arc_right_edge" => Self::ArcRightEdge,
            "arctopedge" | "arc_top_edge" => Self::ArcTopEdge,
            "arcbottomedge" | "arc_bottom_edge" => Self::ArcBottomEdge,
            "straightconnector1" | "straight_connector_1" => Self::StraightConnector1,
            "bentconnector2" | "bent_connector_2" => Self::BentConnector2,
            "bentconnector3" | "bent_connector_3" => Self::BentConnector3,
            "bentconnector4" | "bent_connector_4" => Self::BentConnector4,
            "bentconnector5" | "bent_connector_5" => Self::BentConnector5,
            "curvedconnector2" | "curved_connector_2" => Self::CurvedConnector2,
            "curvedconnector3" | "curved_connector_3" => Self::CurvedConnector3,
            "curvedconnector4" | "curved_connector_4" => Self::CurvedConnector4,
            "curvedconnector5" | "curved_connector_5" => Self::CurvedConnector5,
            "star4" | "star_4" => Self::Star4,
            "star5" | "star_5" => Self::Star5,
            "star6" | "star_6" => Self::Star6,
            "star7" | "star_7" => Self::Star7,
            "star8" | "star_8" => Self::Star8,
            "star10" | "star_10" => Self::Star10,
            "star12" | "star_12" => Self::Star12,
            "star16" | "star_16" => Self::Star16,
            "star24" | "star_24" => Self::Star24,
            "star32" | "star_32" => Self::Star32,
            "ribbon" => Self::Ribbon,
            "ribbon2" => Self::Ribbon2,
            "ellipticalribbon" | "elliptical_ribbon" => Self::EllipticalRibbon,
            "ellipticalribbon2" | "elliptical_ribbon_2" => Self::EllipticalRibbon2,
            "leftrightribbon" | "left_right_ribbon" => Self::LeftRightRibbon,
            "verticalscroll" | "vertical_scroll" => Self::VerticalScroll,
            "horizontalscroll" | "horizontal_scroll" => Self::HorizontalScroll,
            "wave" => Self::Wave,
            "doublewave" | "double_wave" => Self::DoubleWave,
            "pentagonbanner" | "pentagon_banner" => Self::PentagonBanner,
            "ribboncurve" | "ribbon_curve" => Self::RibbonCurve,
            "ribboncurve2" | "ribbon_curve_2" => Self::RibbonCurve2,
            "rightarrow" | "right_arrow" => Self::RightArrow,
            "leftarrow" | "left_arrow" => Self::LeftArrow,
            "uparrow" | "up_arrow" => Self::UpArrow,
            "downarrow" | "down_arrow" => Self::DownArrow,
            "leftrightarrow" | "left_right_arrow" => Self::LeftRightArrow,
            "updownarrow" | "up_down_arrow" => Self::UpDownArrow,
            "quadarrow" | "quad_arrow" => Self::QuadArrow,
            "leftrightuparrow" | "left_right_up_arrow" => Self::LeftRightUpArrow,
            "bentarrow" | "bent_arrow" => Self::BentArrow,
            "leftbentarrow" | "left_bent_arrow" => Self::LeftBentArrow,
            "uturnarrow" | "u_turn_arrow" => Self::UturnArrow,
            "leftuparrow" | "left_up_arrow" => Self::LeftUpArrow,
            "swoosharrow" | "swoosh_arrow" => Self::SwooshArrow,
            "striprightarrow" | "strip_right_arrow" => Self::StripRightArrow,
            "notchedrightarrow" | "notched_right_arrow" => Self::NotchedRightArrow,
            "pentagonarrow" | "pentagon_arrow" => Self::PentagonArrow,
            "chevron" => Self::Chevron,
            "rightarrowbend" | "right_arrow_bend" => Self::RightArrowBend,
            "leftarrowbend" | "left_arrow_bend" => Self::LeftArrowBend,
            "uparrowbend" | "up_arrow_bend" => Self::UpArrowBend,
            "downarrowbend" | "down_arrow_bend" => Self::DownArrowBend,
            "rightarrowcallout" | "right_arrow_callout" => Self::RightArrowCallout,
            "leftarrowcallout" | "left_arrow_callout" => Self::LeftArrowCallout,
            "uparrowcallout" | "up_arrow_callout" => Self::UpArrowCallout,
            "downarrowcallout" | "down_arrow_callout" => Self::DownArrowCallout,
            "leftrightarrowcallout" | "left_right_arrow_callout" => Self::LeftRightArrowCallout,
            "updownarrowcallout" | "up_down_arrow_callout" => Self::UpDownArrowCallout,
            "quadarrowcallout" | "quad_arrow_callout" => Self::QuadArrowCallout,
            "circulararrowcallout" | "circular_arrow_callout" => Self::CircularArrowCallout,
            "notchedcirculararrow" | "notched_circular_arrow" => Self::NotchedCircularArrow,
            "arrowtail" | "arrow_tail" => Self::ArrowTail,
            "flowchartprocess" | "flowchart_process" | "flow_chart_process" => Self::FlowChartProcess,
            "flowchartdecision" | "flowchart_decision" | "flow_chart_decision" => Self::FlowChartDecision,
            "flowchartinputoutput" | "flowchart_input_output" | "flow_chart_input_output" => Self::FlowChartInputOutput,
            "flowchartpredefinedprocess" | "flowchart_predefined_process" | "flow_chart_predefined_process" => Self::FlowChartPredefinedProcess,
            "flowchartinternalstorage" | "flowchart_internal_storage" | "flow_chart_internal_storage" => Self::FlowChartInternalStorage,
            "flowchartdocument" | "flowchart_document" | "flow_chart_document" => Self::FlowChartDocument,
            "flowchartmultidocument" | "flowchart_multidocument" | "flow_chart_multidocument" => Self::FlowChartMultidocument,
            "flowchartterminator" | "flowchart_terminator" | "flow_chart_terminator" => Self::FlowChartTerminator,
            "flowchartpreparation" | "flowchart_preparation" | "flow_chart_preparation" => Self::FlowChartPreparation,
            "flowchartmanualinput" | "flowchart_manual_input" | "flow_chart_manual_input" => Self::FlowChartManualInput,
            "flowchartmanualoperation" | "flowchart_manual_operation" | "flow_chart_manual_operation" => Self::FlowChartManualOperation,
            "flowchartconnector" | "flowchart_connector" | "flow_chart_connector" => Self::FlowChartConnector,
            "flowchartpunchedcard" | "flowchart_punched_card" | "flow_chart_punched_card" => Self::FlowChartPunchedCard,
            "flowchartpunchedtape" | "flowchart_punched_tape" | "flow_chart_punched_tape" => Self::FlowChartPunchedTape,
            "flowchartsummingjunction" | "flowchart_summing_junction" | "flow_chart_summing_junction" => Self::FlowChartSummingJunction,
            "flowchartor" | "flowchart_or" | "flow_chart_or" => Self::FlowChartOr,
            "flowchartcollate" | "flowchart_collate" | "flow_chart_collate" => Self::FlowChartCollate,
            "flowchartsort" | "flowchart_sort" | "flow_chart_sort" => Self::FlowChartSort,
            "flowchartextract" | "flowchart_extract" | "flow_chart_extract" => Self::FlowChartExtract,
            "flowchartmerge" | "flowchart_merge" | "flow_chart_merge" => Self::FlowChartMerge,
            "flowchartstoreddata" | "flowchart_stored_data" | "flow_chart_stored_data" => Self::FlowChartStoredData,
            "flowchartdelay" | "flowchart_delay" | "flow_chart_delay" => Self::FlowChartDelay,
            "flowchartsequentialaccessstorage" | "flowchart_sequential_access_storage" | "flow_chart_sequential_access_storage" => Self::FlowChartSequentialAccessStorage,
            "flowchartmagneticdisk" | "flowchart_magnetic_disk" | "flow_chart_magnetic_disk" => Self::FlowChartMagneticDisk,
            "flowchartdirectaccessstorage" | "flowchart_direct_access_storage" | "flow_chart_direct_access_storage" => Self::FlowChartDirectAccessStorage,
            "flowchartdisplay" | "flowchart_display" | "flow_chart_display" => Self::FlowChartDisplay,
            "flowchartofflinestorage" | "flowchart_offline_storage" | "flow_chart_offline_storage" => Self::FlowChartOfflineStorage,
            "flowchartmagnetictape" | "flowchart_magnetic_tape" | "flow_chart_magnetic_tape" => Self::FlowChartMagneticTape,
            "flowchartmagneticdrum" | "flowchart_magnetic_drum" | "flow_chart_magnetic_drum" => Self::FlowChartMagneticDrum,
            "callout1" | "callout_1" => Self::Callout1,
            "callout2" | "callout_2" => Self::Callout2,
            "callout3" | "callout_3" => Self::Callout3,
            "accentcallout1" | "accent_callout_1" => Self::AccentCallout1,
            "accentcallout2" | "accent_callout_2" => Self::AccentCallout2,
            "accentcallout3" | "accent_callout_3" => Self::AccentCallout3,
            "bordercallout1" | "border_callout_1" => Self::BorderCallout1,
            "bordercallout2" | "border_callout_2" => Self::BorderCallout2,
            "bordercallout3" | "border_callout_3" => Self::BorderCallout3,
            "accentbordercallout1" | "accent_border_callout_1" => Self::AccentBorderCallout1,
            "accentbordercallout2" | "accent_border_callout_2" => Self::AccentBorderCallout2,
            "accentbordercallout3" | "accent_border_callout_3" => Self::AccentBorderCallout3,
            "wedgerectcallout" | "wedge_rect_callout" => Self::WedgeRectCallout,
            "wedgeroundrectcallout" | "wedge_round_rect_callout" => Self::WedgeRoundRectCallout,
            "wedgeellipsecallout" | "wedge_ellipse_callout" => Self::WedgeEllipseCallout,
            "cloudcallout" | "cloud_callout" => Self::CloudCallout,
            "actionbuttonblank" | "action_button_blank" => Self::ActionButtonBlank,
            "actionbuttonhome" | "action_button_home" => Self::ActionButtonHome,
            "actionbuttonhelp" | "action_button_help" => Self::ActionButtonHelp,
            "actionbuttoninformation" | "action_button_information" => Self::ActionButtonInformation,
            "actionbuttonforwardnext" | "action_button_forward_next" => Self::ActionButtonForwardNext,
            "actionbuttonbackprevious" | "action_button_back_previous" => Self::ActionButtonBackPrevious,
            "actionbuttonend" | "action_button_end" => Self::ActionButtonEnd,
            "actionbuttonbeginning" | "action_button_beginning" => Self::ActionButtonBeginning,
            "actionbuttonreturn" | "action_button_return" => Self::ActionButtonReturn,
            "actionbuttondocument" | "action_button_document" => Self::ActionButtonDocument,
            "actionbuttonsound" | "action_button_sound" => Self::ActionButtonSound,
            "actionbuttonmovie" | "action_button_movie" => Self::ActionButtonMovie,
            "gear6" | "gear_6" => Self::Gear6,
            "gear9" | "gear_9" => Self::Gear9,
            "funnel" => Self::Funnel,
            "mathplus" | "math_plus" => Self::MathPlus,
            "mathminus" | "math_minus" => Self::MathMinus,
            "mathmultiply" | "math_multiply" => Self::MathMultiply,
            "mathdivide" | "math_divide" => Self::MathDivide,
            "mathequal" | "math_equal" => Self::MathEqual,
            "mathnotequal" | "math_not_equal" => Self::MathNotEqual,
            "mathleftanglebracket" | "math_left_angle_bracket" => Self::MathLeftAngleBracket,
            "mathrightanglebracket" | "math_right_angle_bracket" => Self::MathRightAngleBracket,
            "mathleftbracket" | "math_left_bracket" => Self::MathLeftBracket,
            "mathrightbracket" | "math_right_bracket" => Self::MathRightBracket,
            "leftbrace" | "left_brace" => Self::LeftBrace,
            "rightbrace" | "right_brace" => Self::RightBrace,
            "leftbracket" | "left_bracket" => Self::LeftBracket,
            "rightbracket" | "right_bracket" => Self::RightBracket,
            "leftanglebracket" | "left_angle_bracket" => Self::LeftAngleBracket,
            "rightanglebracket" | "right_angle_bracket" => Self::RightAngleBracket,
            "curvedleftarrow" | "curved_left_arrow" => Self::CurvedLeftArrow,
            "curvedrightarrow" | "curved_right_arrow" => Self::CurvedRightArrow,
            "curveduparrow" | "curved_up_arrow" => Self::CurvedUpArrow,
            "curveddownarrow" | "curved_down_arrow" => Self::CurvedDownArrow,
            "curvedleftuparrow" | "curved_left_up_arrow" => Self::CurvedLeftUpArrow,
            "curvedrightuparrow" | "curved_right_up_arrow" => Self::CurvedRightUpArrow,
            "curvedleftdownarrow" | "curved_left_down_arrow" => Self::CurvedLeftDownArrow,
            "curvedrightdownarrow" | "curved_right_down_arrow" => Self::CurvedRightDownArrow,
            "nosymbol" | "no_symbol" => Self::NoSymbol,
            "sun" => Self::Sun,
            "moon" => Self::Moon,
            "cloud" => Self::Cloud,
            "starburst" | "star_burst" => Self::StarBurst,
            "lightningbolt" | "lightning_bolt" => Self::LightningBolt,
            "heart" => Self::Heart,
            "smileyface" | "smiley_face" => Self::SmileyFace,
            "irregularseal1" | "irregular_seal_1" => Self::IrregularSeal1,
            "irregularseal2" | "irregular_seal_2" => Self::IrregularSeal2,
            "foldedcorner" | "folded_corner" => Self::FoldedCorner,
            "cornertabs" | "corner_tabs" => Self::CornerTabs,
            "squaretabs" | "square_tabs" => Self::SquareTabs,
            "plaquetabs" | "plaque_tabs" => Self::PlaqueTabs,
            "diagonalstripe" | "diagonal_stripe" => Self::DiagonalStripe,
            "champagnebottle" | "champagne_bottle" => Self::ChampagneBottle,
            "can" => Self::Can,
            "cube" => Self::Cube,
            _ => return None,
        })
    }

    /// Return the DrawingML `prst` attribute name for this preset.
    pub fn name(self) -> &'static str {
        match self {
            Self::Rect => "rect",
            Self::RoundRect => "roundRect",
            Self::Ellipse => "ellipse",
            Self::Diamond => "diamond",
            Self::IsoscelesTriangle => "isoscelesTriangle",
            Self::RightTriangle => "rightTriangle",
            Self::Parallelogram => "parallelogram",
            Self::Trapezoid => "trapezoid",
            Self::Rhombus => "rhombus",
            Self::Pentagon => "pentagon",
            Self::Hexagon => "hexagon",
            Self::Octagon => "octagon",
            Self::Decagon => "decagon",
            Self::Dodecagon => "dodecagon",
            Self::Pie => "pie",
            Self::Chord => "chord",
            Self::Teardrop => "teardrop",
            Self::Frame => "frame",
            Self::HalfFrame => "halfFrame",
            Self::Corner => "corner",
            Self::DiagStripe => "diagStripe",
            Self::Cross => "cross",
            Self::Plaque => "plaque",
            Self::Cylinder => "cylinder",
            Self::Bevel => "bevel",
            Self::Donut => "donut",
            Self::BlockArc => "blockArc",
            Self::CircularArrow => "circularArrow",
            Self::LeftCircularArrow => "leftCircularArrow",
            Self::LeftRightCircularArrow => "leftRightCircularArrow",
            Self::Arc => "arc",
            Self::ArcLeftEdge => "arcLeftEdge",
            Self::ArcRightEdge => "arcRightEdge",
            Self::ArcTopEdge => "arcTopEdge",
            Self::ArcBottomEdge => "arcBottomEdge",
            Self::StraightConnector1 => "straightConnector1",
            Self::BentConnector2 => "bentConnector2",
            Self::BentConnector3 => "bentConnector3",
            Self::BentConnector4 => "bentConnector4",
            Self::BentConnector5 => "bentConnector5",
            Self::CurvedConnector2 => "curvedConnector2",
            Self::CurvedConnector3 => "curvedConnector3",
            Self::CurvedConnector4 => "curvedConnector4",
            Self::CurvedConnector5 => "curvedConnector5",
            Self::Star4 => "star4",
            Self::Star5 => "star5",
            Self::Star6 => "star6",
            Self::Star7 => "star7",
            Self::Star8 => "star8",
            Self::Star10 => "star10",
            Self::Star12 => "star12",
            Self::Star16 => "star16",
            Self::Star24 => "star24",
            Self::Star32 => "star32",
            Self::Ribbon => "ribbon",
            Self::Ribbon2 => "ribbon2",
            Self::EllipticalRibbon => "ellipticalRibbon",
            Self::EllipticalRibbon2 => "ellipticalRibbon2",
            Self::LeftRightRibbon => "leftRightRibbon",
            Self::VerticalScroll => "verticalScroll",
            Self::HorizontalScroll => "horizontalScroll",
            Self::Wave => "wave",
            Self::DoubleWave => "doubleWave",
            Self::PentagonBanner => "pentagonBanner",
            Self::RibbonCurve => "ribbonCurve",
            Self::RibbonCurve2 => "ribbonCurve2",
            Self::RightArrow => "rightArrow",
            Self::LeftArrow => "leftArrow",
            Self::UpArrow => "upArrow",
            Self::DownArrow => "downArrow",
            Self::LeftRightArrow => "leftRightArrow",
            Self::UpDownArrow => "upDownArrow",
            Self::QuadArrow => "quadArrow",
            Self::LeftRightUpArrow => "leftRightUpArrow",
            Self::BentArrow => "bentArrow",
            Self::LeftBentArrow => "leftBentArrow",
            Self::UturnArrow => "uturnArrow",
            Self::LeftUpArrow => "leftUpArrow",
            Self::SwooshArrow => "swooshArrow",
            Self::StripRightArrow => "stripRightArrow",
            Self::NotchedRightArrow => "notchedRightArrow",
            Self::PentagonArrow => "pentagonArrow",
            Self::Chevron => "chevron",
            Self::RightArrowBend => "rightArrowBend",
            Self::LeftArrowBend => "leftArrowBend",
            Self::UpArrowBend => "upArrowBend",
            Self::DownArrowBend => "downArrowBend",
            Self::RightArrowCallout => "rightArrowCallout",
            Self::LeftArrowCallout => "leftArrowCallout",
            Self::UpArrowCallout => "upArrowCallout",
            Self::DownArrowCallout => "downArrowCallout",
            Self::LeftRightArrowCallout => "leftRightArrowCallout",
            Self::UpDownArrowCallout => "upDownArrowCallout",
            Self::QuadArrowCallout => "quadArrowCallout",
            Self::CircularArrowCallout => "circularArrowCallout",
            Self::NotchedCircularArrow => "notchedCircularArrow",
            Self::ArrowTail => "arrowTail",
            Self::FlowChartProcess => "flowChartProcess",
            Self::FlowChartDecision => "flowChartDecision",
            Self::FlowChartInputOutput => "flowChartInputOutput",
            Self::FlowChartPredefinedProcess => "flowChartPredefinedProcess",
            Self::FlowChartInternalStorage => "flowChartInternalStorage",
            Self::FlowChartDocument => "flowChartDocument",
            Self::FlowChartMultidocument => "flowChartMultidocument",
            Self::FlowChartTerminator => "flowChartTerminator",
            Self::FlowChartPreparation => "flowChartPreparation",
            Self::FlowChartManualInput => "flowChartManualInput",
            Self::FlowChartManualOperation => "flowChartManualOperation",
            Self::FlowChartConnector => "flowChartConnector",
            Self::FlowChartPunchedCard => "flowChartPunchedCard",
            Self::FlowChartPunchedTape => "flowChartPunchedTape",
            Self::FlowChartSummingJunction => "flowChartSummingJunction",
            Self::FlowChartOr => "flowChartOr",
            Self::FlowChartCollate => "flowChartCollate",
            Self::FlowChartSort => "flowChartSort",
            Self::FlowChartExtract => "flowChartExtract",
            Self::FlowChartMerge => "flowChartMerge",
            Self::FlowChartStoredData => "flowChartStoredData",
            Self::FlowChartDelay => "flowChartDelay",
            Self::FlowChartSequentialAccessStorage => "flowChartSequentialAccessStorage",
            Self::FlowChartMagneticDisk => "flowChartMagneticDisk",
            Self::FlowChartDirectAccessStorage => "flowChartDirectAccessStorage",
            Self::FlowChartDisplay => "flowChartDisplay",
            Self::FlowChartOfflineStorage => "flowChartOfflineStorage",
            Self::FlowChartMagneticTape => "flowChartMagneticTape",
            Self::FlowChartMagneticDrum => "flowChartMagneticDrum",
            Self::Callout1 => "callout1",
            Self::Callout2 => "callout2",
            Self::Callout3 => "callout3",
            Self::AccentCallout1 => "accentCallout1",
            Self::AccentCallout2 => "accentCallout2",
            Self::AccentCallout3 => "accentCallout3",
            Self::BorderCallout1 => "borderCallout1",
            Self::BorderCallout2 => "borderCallout2",
            Self::BorderCallout3 => "borderCallout3",
            Self::AccentBorderCallout1 => "accentBorderCallout1",
            Self::AccentBorderCallout2 => "accentBorderCallout2",
            Self::AccentBorderCallout3 => "accentBorderCallout3",
            Self::WedgeRectCallout => "wedgeRectCallout",
            Self::WedgeRoundRectCallout => "wedgeRoundRectCallout",
            Self::WedgeEllipseCallout => "wedgeEllipseCallout",
            Self::CloudCallout => "cloudCallout",
            Self::ActionButtonBlank => "actionButtonBlank",
            Self::ActionButtonHome => "actionButtonHome",
            Self::ActionButtonHelp => "actionButtonHelp",
            Self::ActionButtonInformation => "actionButtonInformation",
            Self::ActionButtonForwardNext => "actionButtonForwardNext",
            Self::ActionButtonBackPrevious => "actionButtonBackPrevious",
            Self::ActionButtonEnd => "actionButtonEnd",
            Self::ActionButtonBeginning => "actionButtonBeginning",
            Self::ActionButtonReturn => "actionButtonReturn",
            Self::ActionButtonDocument => "actionButtonDocument",
            Self::ActionButtonSound => "actionButtonSound",
            Self::ActionButtonMovie => "actionButtonMovie",
            Self::Gear6 => "gear6",
            Self::Gear9 => "gear9",
            Self::Funnel => "funnel",
            Self::MathPlus => "mathPlus",
            Self::MathMinus => "mathMinus",
            Self::MathMultiply => "mathMultiply",
            Self::MathDivide => "mathDivide",
            Self::MathEqual => "mathEqual",
            Self::MathNotEqual => "mathNotEqual",
            Self::MathLeftAngleBracket => "mathLeftAngleBracket",
            Self::MathRightAngleBracket => "mathRightAngleBracket",
            Self::MathLeftBracket => "mathLeftBracket",
            Self::MathRightBracket => "mathRightBracket",
            Self::LeftBrace => "leftBrace",
            Self::RightBrace => "rightBrace",
            Self::LeftBracket => "leftBracket",
            Self::RightBracket => "rightBracket",
            Self::LeftAngleBracket => "leftAngleBracket",
            Self::RightAngleBracket => "rightAngleBracket",
            Self::CurvedLeftArrow => "curvedLeftArrow",
            Self::CurvedRightArrow => "curvedRightArrow",
            Self::CurvedUpArrow => "curvedUpArrow",
            Self::CurvedDownArrow => "curvedDownArrow",
            Self::CurvedLeftUpArrow => "curvedLeftUpArrow",
            Self::CurvedRightUpArrow => "curvedRightUpArrow",
            Self::CurvedLeftDownArrow => "curvedLeftDownArrow",
            Self::CurvedRightDownArrow => "curvedRightDownArrow",
            Self::NoSymbol => "noSymbol",
            Self::Sun => "sun",
            Self::Moon => "moon",
            Self::Cloud => "cloud",
            Self::StarBurst => "starBurst",
            Self::LightningBolt => "lightningBolt",
            Self::Heart => "heart",
            Self::SmileyFace => "smileyFace",
            Self::IrregularSeal1 => "irregularSeal1",
            Self::IrregularSeal2 => "irregularSeal2",
            Self::FoldedCorner => "foldedCorner",
            Self::CornerTabs => "cornerTabs",
            Self::SquareTabs => "squareTabs",
            Self::PlaqueTabs => "plaqueTabs",
            Self::DiagonalStripe => "diagonalStripe",
            Self::ChampagneBottle => "champagneBottle",
            Self::Can => "can",
            Self::Cube => "cube",
        }
    }

    /// Returns the group/category this preset belongs to.
    pub fn category(self) -> &'static str {
        match self {
            Self::Rect | Self::RoundRect | Self::Ellipse | Self::Diamond
            | Self::IsoscelesTriangle | Self::RightTriangle | Self::Parallelogram
            | Self::Trapezoid | Self::Rhombus | Self::Pentagon | Self::Hexagon
            | Self::Octagon | Self::Decagon | Self::Dodecagon | Self::Pie
            | Self::Chord | Self::Teardrop | Self::Frame | Self::HalfFrame
            | Self::Corner | Self::DiagStripe | Self::Cross | Self::Plaque
            | Self::Cylinder | Self::Bevel => "basic",

            Self::Donut | Self::BlockArc | Self::CircularArrow
            | Self::LeftCircularArrow | Self::LeftRightCircularArrow
            | Self::Arc | Self::ArcLeftEdge | Self::ArcRightEdge
            | Self::ArcTopEdge | Self::ArcBottomEdge => "donut_arc",

            Self::StraightConnector1 | Self::BentConnector2
            | Self::BentConnector3 | Self::BentConnector4
            | Self::BentConnector5 | Self::CurvedConnector2
            | Self::CurvedConnector3 | Self::CurvedConnector4
            | Self::CurvedConnector5 => "connector",

            Self::Star4 | Self::Star5 | Self::Star6 | Self::Star7
            | Self::Star8 | Self::Star10 | Self::Star12 | Self::Star16
            | Self::Star24 | Self::Star32 => "star",

            Self::Ribbon | Self::Ribbon2 | Self::EllipticalRibbon
            | Self::EllipticalRibbon2 | Self::LeftRightRibbon
            | Self::VerticalScroll | Self::HorizontalScroll | Self::Wave
            | Self::DoubleWave | Self::PentagonBanner | Self::RibbonCurve
            | Self::RibbonCurve2 => "ribbon_banner",

            Self::RightArrow | Self::LeftArrow | Self::UpArrow
            | Self::DownArrow | Self::LeftRightArrow | Self::UpDownArrow
            | Self::QuadArrow | Self::LeftRightUpArrow | Self::BentArrow
            | Self::LeftBentArrow | Self::UturnArrow | Self::LeftUpArrow
            | Self::SwooshArrow | Self::StripRightArrow
            | Self::NotchedRightArrow | Self::PentagonArrow | Self::Chevron
            | Self::RightArrowBend | Self::LeftArrowBend | Self::UpArrowBend
            | Self::DownArrowBend => "arrow",

            Self::RightArrowCallout | Self::LeftArrowCallout
            | Self::UpArrowCallout | Self::DownArrowCallout
            | Self::LeftRightArrowCallout | Self::UpDownArrowCallout
            | Self::QuadArrowCallout | Self::CircularArrowCallout
            | Self::NotchedCircularArrow | Self::ArrowTail => "arrow_callout",

            Self::FlowChartProcess | Self::FlowChartDecision
            | Self::FlowChartInputOutput | Self::FlowChartPredefinedProcess
            | Self::FlowChartInternalStorage | Self::FlowChartDocument
            | Self::FlowChartMultidocument | Self::FlowChartTerminator
            | Self::FlowChartPreparation | Self::FlowChartManualInput
            | Self::FlowChartManualOperation | Self::FlowChartConnector
            | Self::FlowChartPunchedCard | Self::FlowChartPunchedTape
            | Self::FlowChartSummingJunction | Self::FlowChartOr
            | Self::FlowChartCollate | Self::FlowChartSort
            | Self::FlowChartExtract | Self::FlowChartMerge
            | Self::FlowChartStoredData | Self::FlowChartDelay
            | Self::FlowChartSequentialAccessStorage
            | Self::FlowChartMagneticDisk | Self::FlowChartDirectAccessStorage
            | Self::FlowChartDisplay | Self::FlowChartOfflineStorage
            | Self::FlowChartMagneticTape
            | Self::FlowChartMagneticDrum => "flowchart",

            Self::Callout1 | Self::Callout2 | Self::Callout3
            | Self::AccentCallout1 | Self::AccentCallout2
            | Self::AccentCallout3 | Self::BorderCallout1
            | Self::BorderCallout2 | Self::BorderCallout3
            | Self::AccentBorderCallout1 | Self::AccentBorderCallout2
            | Self::AccentBorderCallout3 | Self::WedgeRectCallout
            | Self::WedgeRoundRectCallout | Self::WedgeEllipseCallout
            | Self::CloudCallout => "callout",

            Self::ActionButtonBlank | Self::ActionButtonHome
            | Self::ActionButtonHelp | Self::ActionButtonInformation
            | Self::ActionButtonForwardNext | Self::ActionButtonBackPrevious
            | Self::ActionButtonEnd | Self::ActionButtonBeginning
            | Self::ActionButtonReturn | Self::ActionButtonDocument
            | Self::ActionButtonSound | Self::ActionButtonMovie => "action_button",

            Self::Gear6 | Self::Gear9 | Self::Funnel => "engineering",

            Self::MathPlus | Self::MathMinus | Self::MathMultiply
            | Self::MathDivide | Self::MathEqual | Self::MathNotEqual
            | Self::MathLeftAngleBracket | Self::MathRightAngleBracket
            | Self::MathLeftBracket | Self::MathRightBracket => "math",

            Self::LeftBrace | Self::RightBrace | Self::LeftBracket
            | Self::RightBracket | Self::LeftAngleBracket
            | Self::RightAngleBracket => "bracket",

            Self::CurvedLeftArrow | Self::CurvedRightArrow
            | Self::CurvedUpArrow | Self::CurvedDownArrow
            | Self::CurvedLeftUpArrow | Self::CurvedRightUpArrow
            | Self::CurvedLeftDownArrow | Self::CurvedRightDownArrow => "curved_arrow",

            Self::NoSymbol | Self::Sun | Self::Moon | Self::Cloud
            | Self::StarBurst | Self::LightningBolt | Self::Heart
            | Self::SmileyFace | Self::IrregularSeal1
            | Self::IrregularSeal2 => "misc",

            Self::FoldedCorner | Self::CornerTabs | Self::SquareTabs
            | Self::PlaqueTabs | Self::DiagonalStripe
            | Self::ChampagneBottle | Self::Can | Self::Cube => "other",
        }
    }

    /// Returns the number of adjust values (adjust handles) this preset accepts.
    pub fn adjust_count(self) -> usize {
        match self {
            Self::RoundRect | Self::Frame | Self::HalfFrame | Self::Corner => 1,
            Self::Donut | Self::BlockArc | Self::Chord | Self::Arc
            | Self::ArcLeftEdge | Self::ArcRightEdge | Self::ArcTopEdge
            | Self::ArcBottomEdge => 2,
            Self::CircularArrow | Self::LeftCircularArrow
            | Self::LeftRightCircularArrow => 3,
            Self::Pie | Self::Teardrop => 1,
            Self::Plaque => 1,
            Self::Star5 | Self::Star6 | Self::Star7 | Self::Star8
            | Self::Star10 | Self::Star12 | Self::Star16 | Self::Star24
            | Self::Star32 => 2,
            Self::Ribbon | Self::Ribbon2 => 2,
            Self::EllipticalRibbon | Self::EllipticalRibbon2 => 3,
            Self::LeftRightRibbon => 2,
            Self::VerticalScroll | Self::HorizontalScroll => 2,
            Self::Wave | Self::DoubleWave => 2,
            Self::PentagonBanner => 2,
            Self::RibbonCurve | Self::RibbonCurve2 => 2,
            Self::RightArrow | Self::LeftArrow | Self::UpArrow
            | Self::DownArrow => 4,
            Self::LeftRightArrow | Self::UpDownArrow => 5,
            Self::QuadArrow => 5,
            Self::LeftRightUpArrow => 5,
            Self::BentArrow | Self::LeftBentArrow => 3,
            Self::UturnArrow => 3,
            Self::LeftUpArrow => 4,
            Self::SwooshArrow => 3,
            Self::StripRightArrow | Self::NotchedRightArrow => 3,
            Self::PentagonArrow => 2,
            Self::Chevron => 1,
            Self::RightArrowBend | Self::LeftArrowBend
            | Self::UpArrowBend | Self::DownArrowBend => 2,
            Self::RightArrowCallout | Self::LeftArrowCallout
            | Self::UpArrowCallout | Self::DownArrowCallout => 5,
            Self::LeftRightArrowCallout | Self::UpDownArrowCallout => 5,
            Self::QuadArrowCallout => 5,
            Self::CircularArrowCallout => 3,
            Self::NotchedCircularArrow => 2,
            Self::ArrowTail => 2,
            Self::Callout1 | Self::Callout2 | Self::Callout3 => 2,
            Self::AccentCallout1 | Self::AccentCallout2
            | Self::AccentCallout3 => 3,
            Self::BorderCallout1 | Self::BorderCallout2
            | Self::BorderCallout3 => 3,
            Self::AccentBorderCallout1 | Self::AccentBorderCallout2
            | Self::AccentBorderCallout3 => 4,
            Self::WedgeRectCallout | Self::WedgeRoundRectCallout
            | Self::WedgeEllipseCallout => 1,
            Self::CloudCallout => 0,
            Self::Gear6 | Self::Gear9 => 2,
            Self::Funnel => 1,
            Self::FoldedCorner => 2,
            Self::CornerTabs | Self::SquareTabs => 1,
            Self::PlaqueTabs => 2,
            Self::DiagonalStripe => 1,
            Self::ChampagneBottle | Self::Can | Self::Cube => 0,
            Self::LeftBrace | Self::RightBrace => 2,
            Self::LeftBracket | Self::RightBracket => 1,
            Self::LeftAngleBracket | Self::RightAngleBracket => 1,
            Self::MathPlus | Self::MathMinus | Self::MathMultiply
            | Self::MathDivide | Self::MathEqual | Self::MathNotEqual
            | Self::MathLeftAngleBracket | Self::MathRightAngleBracket
            | Self::MathLeftBracket | Self::MathRightBracket => 0,
            Self::CurvedLeftArrow | Self::CurvedRightArrow
            | Self::CurvedUpArrow | Self::CurvedDownArrow
            | Self::CurvedLeftUpArrow | Self::CurvedRightUpArrow
            | Self::CurvedLeftDownArrow | Self::CurvedRightDownArrow => 2,
            Self::NoSymbol | Self::Sun | Self::Moon | Self::Cloud
            | Self::StarBurst | Self::LightningBolt | Self::Heart
            | Self::SmileyFace | Self::IrregularSeal1
            | Self::IrregularSeal2 => 0,
            // Connectors and basic shapes have no adjusts
            _ => 0,
        }
    }
}

impl std::fmt::Display for PresetShapeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.name())
    }
}

impl std::str::FromStr for PresetShapeType {
    type Err = UnknownPresetError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_name(s).ok_or_else(|| UnknownPresetError(s.to_owned()))
    }
}

/// Error returned when a preset shape name is not recognised.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("unknown preset shape: '{0}'")]
pub struct UnknownPresetError(pub String);

// ---------------------------------------------------------------------------
// AdjustValue — named adjustment parameter
// ---------------------------------------------------------------------------

/// A single adjustment value (adjust handle) used to parameterise preset
/// shape geometry. In DrawingML, each adjust is identified by a name like
/// `"adj"`, `"adj2"`, `"adj3"`, etc., and its value is typically a
/// percentage of the shape dimension (0.0–1.0) or an absolute coordinate
/// in EMU.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AdjustValue {
    /// The adjustment name (e.g. "adj", "adj2", "adj3").
    pub name: &'static str,
    /// The adjustment value, typically 0.0–1.0 as a fraction of the
    /// shape's bounding box dimension.
    pub value: f64,
}

impl AdjustValue {
    /// Create a new adjustment value.
    pub fn new(name: &'static str, value: f64) -> Self {
        Self { name, value }
    }

    /// The default adjustment prefix (e.g. "adj" for first adjust).
    pub fn prefix() -> &'static str {
        "adj"
    }
}

// ---------------------------------------------------------------------------
// GeometryGuide — formula for computing shape geometry values
// ---------------------------------------------------------------------------

/// A geometry guide formula as defined in DrawingML (`a:gd` / `a:formula`).
///
/// Guides compute derived values from shape bounds and adjustment values.
/// The formula language supports operations like:
/// - `prod` (product), `sum` (sum), `diff` (difference),
/// - `sqrt` (square root), `mod` (modulus),
/// - `atan2` (arctangent), `sin`, `cos`, `tan`,
/// - `val` (literal value), `adj` (adjustment value), `cdr` (guide reference).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GeometryGuide {
    /// A named guide with formula: `gd { name, fmla }`.
    Named {
        name: String,
        formula: GuideFormula,
    },
}

/// A guide formula expression.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GuideFormula {
    /// Literal value in EMU.
    Val(f64),
    /// Reference to an adjustment value by name.
    Adj(String),
    /// Reference to another guide by name.
    Cdr(String),
    /// Product: `prod a b`
    Prod(Box<GuideFormula>, Box<GuideFormula>),
    /// Sum: `sum a b`
    Sum(Box<GuideFormula>, Box<GuideFormula>),
    /// Difference: `diff a b`
    Diff(Box<GuideFormula>, Box<GuideFormula>),
    /// Min: `min a b`
    Min(Box<GuideFormula>, Box<GuideFormula>),
    /// Max: `max a b`
    Max(Box<GuideFormula>, Box<GuideFormula>),
    /// Division: `div a b`
    Div(Box<GuideFormula>, Box<GuideFormula>),
    /// Modulus: `mod a b`
    Mod(Box<GuideFormula>, Box<GuideFormula>),
    /// Square root: `sqrt a`
    Sqrt(Box<GuideFormula>),
    /// Absolute value: `abs a`
    Abs(Box<GuideFormula>),
    /// If-then-else: `if a b c`
    IfThenElse(Box<GuideFormula>, Box<GuideFormula>, Box<GuideFormula>),
    /// Sine: `sin a` (angle in degrees)
    Sin(Box<GuideFormula>),
    /// Cosine: `cos a` (angle in degrees)
    Cos(Box<GuideFormula>),
    /// Tangent: `tan a` (angle in degrees)
    Tan(Box<GuideFormula>),
    /// Arctangent 2: `atan2 a b`
    Atan2(Box<GuideFormula>, Box<GuideFormula>),
    /// Half-dimension width: `hd`
    Hd,
    /// Half-dimension height: `hd`
    H,
    /// Max dimension: `max`
    MaxDim,
    /// Half max dimension: `h^`
    HalfMax,
    /// Shape width: `w`
    W,
    /// Shape height: `h`
    Ht,
    /// Shape left edge: `l`
    L,
    /// Shape top edge: `t`
    T,
    /// Shape right edge: `r`
    R,
    /// Shape bottom edge: `b`
    B,
    /// Center x: `cx`
    Cx,
    /// Center y: `cy`
    Cy,
    /// Pin radius: `pin`
    Pin,
}

// ---------------------------------------------------------------------------
// PathCommand — commands for describing shape outlines
// ---------------------------------------------------------------------------

/// A single path command within a sub-path of a preset shape.
///
/// These mirror the DrawingML path command set:
/// - `moveTo` / `lnTo` (lineTo)
/// - `arcTo` (elliptical arc)
/// - `cubicBezTo` (cubic Bézier)
/// - `quadBezTo` (quadratic Bézier)
/// - `close` (close path)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PathCommand {
    /// Move to an absolute position.
    MoveTo { x: f64, y: f64 },
    /// Line to an absolute position.
    LineTo { x: f64, y: f64 },
    /// Cubic Bézier curve to (`x`, `y`) with two control points.
    CubicBezTo {
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        x: f64,
        y: f64,
    },
    /// Quadratic Bézier curve to (`x`, `y`) with one control point.
    QuadBezTo {
        x1: f64,
        y1: f64,
        x: f64,
        y: f64,
    },
    /// Elliptical arc to (`x`, `y`).
    ArcTo {
        rx: f64,
        ry: f64,
        stAng: f64,
        swAng: f64,
        x: f64,
        y: f64,
    },
    /// Close the current sub-path.
    Close,
}

/// A sub-path (possibly closed) that is part of a shape's outline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Path {
    /// Whether this sub-path should be filled (true) or used only for
    /// stroke/clip (false).
    pub fill: bool,
    /// Whether this sub-path uses a stroke.
    pub stroke: bool,
    /// Whether the path is extruded (for 3D effects).
    pub extrusion_ok: bool,
    /// The sequence of commands in this sub-path.
    pub commands: Vec<PathCommand>,
}

impl Path {
    /// Create a new sub-path with the given commands.
    pub fn new(commands: Vec<PathCommand>) -> Self {
        Self {
            fill: true,
            stroke: true,
            extrusion_ok: true,
            commands,
        }
    }

    /// Create a new sub-path with the given commands and fill flag.
    pub fn with_fill(commands: Vec<PathCommand>, fill: bool) -> Self {
        Self {
            fill,
            stroke: true,
            extrusion_ok: true,
            commands,
        }
    }
}

// ---------------------------------------------------------------------------
// PresetGeometry — complete geometry for a preset shape
// ---------------------------------------------------------------------------

/// Complete geometry description for a preset shape, including its type,
/// adjustment values, guides, and paths.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PresetGeometry {
    /// The preset shape type.
    pub shape_type: PresetShapeType,
    /// Named adjustment values.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub adjust_values: Vec<AdjustValue>,
    /// Geometry guides (formulas).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub guides: Vec<GeometryGuide>,
    /// Paths defining the shape outline.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub paths: Vec<Path>,
}

impl PresetGeometry {
    /// Create a new `PresetGeometry` for the given shape type.
    pub fn new(shape_type: PresetShapeType) -> Self {
        Self {
            shape_type,
            adjust_values: Vec::new(),
            guides: Vec::new(),
            paths: generate_paths(shape_type, &[]),
        }
    }

    /// Add an adjustment value and regenerate the paths.
    pub fn with_adjust_value(mut self, name: &'static str, value: f64) -> Self {
        self.adjust_values.push(AdjustValue::new(name, value));
        self.paths = generate_paths(self.shape_type, &self.adjust_values);
        self
    }

    /// Set all adjust values at once and regenerate paths.
    pub fn with_adjust_values(mut self, values: Vec<AdjustValue>) -> Self {
        self.adjust_values = values;
        self.paths = generate_paths(self.shape_type, &self.adjust_values);
        self
    }

    /// Get the paths for this geometry, regenerating if needed.
    pub fn paths(&self) -> &[Path] {
        &self.paths
    }

    /// Look up an adjustment value by name.
    pub fn get_adjust(&self, name: &str) -> Option<f64> {
        self.adjust_values
            .iter()
            .find(|a| a.name == name)
            .map(|a| a.value)
    }

    /// Get the number of sub-paths.
    pub fn path_count(&self) -> usize {
        self.paths.len()
    }

    /// Get the total number of commands across all sub-paths.
    pub fn command_count(&self) -> usize {
        self.paths.iter().map(|p| p.commands.len()).sum()
    }
}

// ---------------------------------------------------------------------------
// Path generation for each preset
// ---------------------------------------------------------------------------

/// Generate path data for a preset shape given its adjust values.
///
/// Returns a set of sub-paths that define the shape outline in a normalized
/// 0..1 coordinate space (relative to the shape's bounding box).
fn generate_paths(shape_type: PresetShapeType, adjusts: &[AdjustValue]) -> Vec<Path> {
    // Default adjust helpers (safe defaults)
    let get_adj = |name: &str, default: f64| -> f64 {
        adjusts.iter().find(|a| a.name == name).map(|a| a.value).unwrap_or(default)
    };

    match shape_type {
        // ===================================================================
        // BASIC SHAPES
        // ===================================================================
        PresetShapeType::Rect => {
            vec![Path::new(vec![
                PathCommand::MoveTo { x: 0.0, y: 0.0 },
                PathCommand::LineTo { x: 1.0, y: 0.0 },
                PathCommand::LineTo { x: 1.0, y: 1.0 },
                PathCommand::LineTo { x: 0.0, y: 1.0 },
                PathCommand::Close,
            ])]
        }

        PresetShapeType::RoundRect => {
            let r = get_adj("adj", 0.08333); // default corner radius 8.33%
            vec![Path::new(vec![
                PathCommand::MoveTo { x: r, y: 0.0 },
                PathCommand::LineTo { x: 1.0 - r, y: 0.0 },
                PathCommand::ArcTo { rx: r, ry: r, stAng: 270.0, swAng: 90.0, x: 1.0, y: r },
                PathCommand::LineTo { x: 1.0, y: 1.0 - r },
                PathCommand::ArcTo { rx: r, ry: r, stAng: 0.0, swAng: 90.0, x: 1.0 - r, y: 1.0 },
                PathCommand::LineTo { x: r, y: 1.0 },
                PathCommand::ArcTo { rx: r, ry: r, stAng: 90.0, swAng: 90.0, x: 0.0, y: 1.0 - r },
                PathCommand::LineTo { x: 0.0, y: r },
                PathCommand::ArcTo { rx: r, ry: r, stAng: 180.0, swAng: 90.0, x: r, y: 0.0 },
                PathCommand::Close,
            ])]
        }

        PresetShapeType::Ellipse => {
            // Approximated with 4 cubic beziers
            let c = 0.5522847498; // bezier circle constant
            vec![Path::new(vec![
                PathCommand::MoveTo { x: 0.5, y: 0.0 },
                PathCommand::CubicBezTo { x1: 0.5 + 0.5 * c, y1: 0.0, x2: 1.0, y2: 0.5 - 0.5 * c, x: 1.0, y: 0.5 },
                PathCommand::CubicBezTo { x1: 1.0, y1: 0.5 + 0.5