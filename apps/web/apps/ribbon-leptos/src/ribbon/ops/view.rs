//! View ops (`ribbon::ops`): zoomIn, zoomOut, zoomTo100, fitToWidth, fitToPage and
//! toggleDarkDocument — plus honest `Err`s for what the editor does not render yet (multiple
//! pages, ruler, gridlines, navigation pane, interface themes, macros).
//!
//! Zoom is HOST-SIDE: the engine has no zoom op and the canvas bitmap never changes. The module
//! keeps one factor (1.0 = 100%) in a signal created by [`Panel`] (a signal can only be made
//! inside the reactive tree; `exec` reaches it through a thread-local) and writes it to the
//! document root as the CSS custom property `--wo-zoom`. `styles/ops-view.css` binds
//! `.page { zoom: var(--wo-zoom, 1) }`: the canvas, the caret and the selection rects all live
//! inside `.page`, so they scale together, and the host's click mapping (canvas px = client px ×
//! bitmap / bounding rect) stays right at every factor.
//!
//! The dark document is a `dark-document` class on `<body>` plus a CSS filter on the canvas: the
//! user sees inverted paper, the engine's pixels are untouched (`woProbe('dark')` is identical).
//!
//! Command NAMES are owned, matched on `cmd.command` — never on `cmd.id`: the View/Home/Plugins/
//! Draw twins (`draw-zoom-in`, `draw-fit-to-page`, …) carry the SAME command as their originals.

use std::cell::Cell;

use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::HtmlElement;

/// The command names this module answers (the `Some` cases of [`exec`]); everything else is
/// `None` — the engine and the other modules own their own names, disjoint by contract.
const OWNED: &[&str] = &[
    "zoomIn",
    "zoomOut",
    "zoomTo100",
    "fitToPage",
    "fitToWidth",
    "multiplePages",
    "toggleMultiplePages",
    "toggleDarkDocument",
    "toggleRuler",
    "toggleGridlines",
    "toggleNavigation",
    "interface-theme",
    "macros",
    "recordMacro",
    "pauseMacroRecording",
];

/// The zoom range, as factors: 25% ..= 500%.
pub const MIN_ZOOM: f64 = 0.25;
pub const MAX_ZOOM: f64 = 5.0;
/// zoomIn / zoomOut move by ten percentage points.
pub const STEP: f64 = 0.10;
/// Room the fit modes leave around the page (all sides together), in CSS px.
pub const FIT_MARGIN: f64 = 48.0;
/// The custom property `styles/ops-view.css` binds `.page { zoom: var(--wo-zoom, 1) }` to.
const ZOOM_PROPERTY: &str = "--wo-zoom";
/// Body class of the dark document (styles in `styles/ops-view.css`).
const DARK_CLASS: &str = "dark-document";

const FIT_WIDTH_TEXT: &str = "fit to width";
const FIT_PAGE_TEXT: &str = "fit to page";

/// The honest `Err` texts (lib.rs prefixes `"<command> failed — "`: they must not start with
/// the command name themselves).
const ERR_MULTIPLE_PAGES: &str = "pages are shown in one column — no multi-page grid yet";
const ERR_RULER: &str = "the ruler is not rendered yet";
const ERR_GRIDLINES: &str = "gridlines are not rendered yet";
const ERR_NAVIGATION: &str = "the navigation pane is not rendered yet";
const ERR_THEMES: &str = "interface themes are not available yet";
const ERR_MACROS: &str = "macros are not available in the editor";
const ERR_NO_PANEL: &str = "the view panel is not mounted";

thread_local! {
    /// The live zoom factor, created by [`Panel`] at mount (`RwSignal` is `Copy`, so a plain
    /// `Cell<Option<_>>` needs no `RefCell`). Read and written by `exec` through [`zoom_signal`].
    static ZOOM: Cell<Option<RwSignal<f64>>> = const { Cell::new(None) };
}

pub fn exec(cmd: &Cmd, _ui: &Ui) -> Option<Result<String, String>> {
    if !owns(cmd.command) {
        return None;
    }
    Some(match cmd.command {
        "zoomIn" => step(STEP),
        "zoomOut" => step(-STEP),
        "zoomTo100" => apply_zoom(1.0, None),
        "fitToWidth" => fit(Fit::Width),
        "fitToPage" => fit(Fit::Page),
        "toggleDarkDocument" => toggle_dark_document(cmd.value.as_deref()),
        "multiplePages" | "toggleMultiplePages" => Err(ERR_MULTIPLE_PAGES.into()),
        "toggleRuler" => Err(ERR_RULER.into()),
        "toggleGridlines" => Err(ERR_GRIDLINES.into()),
        "toggleNavigation" => Err(ERR_NAVIGATION.into()),
        "interface-theme" => Err(ERR_THEMES.into()),
        "macros" | "recordMacro" | "pauseMacroRecording" => Err(ERR_MACROS.into()),
        // A name in OWNED without an arm above would silently fall through — never let that
        // pass as a fake success or as `None` (which would steal the command from no one).
        _ => Err(format!(
            "internal: `{}` is owned but not dispatched",
            cmd.command
        )),
    })
}

/// Is this command name ours? (`Cmd.id` is irrelevant — see the module docs.)
fn owns(command: &str) -> bool {
    OWNED.contains(&command)
}

// ── the commands ──────────────────────────────────────────────────────────────────────────────

/// The panel's zoom signal, or `Err` when the panel is not mounted (nothing to keep the factor).
fn zoom_signal() -> Result<RwSignal<f64>, String> {
    zoom_signal_opt().ok_or_else(|| ERR_NO_PANEL.to_string())
}

fn zoom_signal_opt() -> Option<RwSignal<f64>> {
    ZOOM.with(Cell::get)
}

/// zoomIn / zoomOut: ten points up/down the 10% grid, clamped to the range.
fn step(delta: f64) -> Result<String, String> {
    let s = zoom_signal()?;
    // Untracked read on purpose: `exec` runs inside lib.rs's dispatch effect.
    let current = s.try_get().unwrap_or(1.0);
    apply_zoom(step_zoom(current, delta), None)
}

fn fit(mode: Fit) -> Result<String, String> {
    let s = zoom_signal()?;
    let current = s.try_get().unwrap_or(1.0);
    let a = measure()?;
    let z = match mode {
        Fit::Width => fit_to_width(a.container_w, a.page_w, current),
        Fit::Page => fit_to_page(a.container_w, a.page_w, a.container_h, a.page_h, current),
    };
    apply_zoom(z, Some(mode.text()))
}

/// Land a factor: the CSS property (the thing that scales the page), the signal (the readout),
/// then the keyboard back in the editor — ribbon buttons steal focus on click.
fn apply_zoom(next: f64, how: Option<&str>) -> Result<String, String> {
    let s = zoom_signal()?;
    let z = clamp_zoom(next);
    write_dom_zoom(z)?;
    s.set(z);
    crate::editor::focus_input();
    Ok(zoom_status(z, how))
}

/// Dark document on/off. The checkbox sends the new state ("true"/"false"); without a value the
/// class is toggled. Success is only reported once the body really carries (or dropped) the class.
fn toggle_dark_document(value: Option<&str>) -> Result<String, String> {
    let list = document_body()?.class_list();
    let on = value.map_or_else(|| !list.contains(DARK_CLASS), |v| v == "true");
    let changed = if on {
        list.add_1(DARK_CLASS)
    } else {
        list.remove_1(DARK_CLASS)
    };
    changed.map_err(|e| format!("the browser refused the body class: {e:?}"))?;
    if list.contains(DARK_CLASS) != on {
        return Err("the body class did not change".into());
    }
    crate::editor::focus_input();
    Ok(if on {
        "dark document on".into()
    } else {
        "dark document off".into()
    })
}

// ── pure geometry (host-tested) ───────────────────────────────────────────────────────────────

/// Keep a factor on the 1% grid and inside 25% ..= 500%. Also kills floating-point drift
/// (`1.1 - 0.1` is `1.0000000000000002`).
pub fn clamp_zoom(z: f64) -> f64 {
    let pct = (z * 100.0).round();
    if !pct.is_finite() {
        return 1.0;
    }
    pct.clamp(MIN_ZOOM * 100.0, MAX_ZOOM * 100.0) / 100.0
}

/// One zoomIn (`direction > 0`) / zoomOut (`direction < 0`) step from `current`.
pub fn step_zoom(current: f64, direction: f64) -> f64 {
    clamp_zoom(current + direction.signum() * STEP)
}

/// The factor that fits a page of `page_w` RENDERED px (already times `current_zoom`) into a
/// container of `container_w` px, leaving [`FIT_MARGIN`]; for `page` mode the height limits too.
/// Snapped DOWN to 1% so the page never overflows the container, then clamped.
fn fit_factor(
    container_w: f64,
    page_w: f64,
    container_h: Option<f64>,
    page_h: f64,
    current_zoom: f64,
) -> f64 {
    let scale = |avail: f64, rendered: f64| avail / (rendered / current_zoom);
    let mut z = scale(container_w - FIT_MARGIN, page_w);
    if let Some(h) = container_h {
        z = z.min(scale(h - FIT_MARGIN, page_h));
    }
    if current_zoom <= 0.0 || page_w <= 0.0 || !z.is_finite() {
        return 1.0; // no page / no container measured: leave the view alone
    }
    (z * 100.0)
        .floor()
        .clamp(MIN_ZOOM * 100.0, MAX_ZOOM * 100.0)
        / 100.0
}

/// fitToWidth as a pure function of the measured sizes.
pub fn fit_to_width(container_w: f64, page_w: f64, current_zoom: f64) -> f64 {
    fit_factor(container_w, page_w, None, 0.0, current_zoom)
}

/// fitToPage: the smaller of the width and the height fit.
pub fn fit_to_page(
    container_w: f64,
    page_w: f64,
    container_h: f64,
    page_h: f64,
    current_zoom: f64,
) -> f64 {
    fit_factor(container_w, page_w, Some(container_h), page_h, current_zoom)
}

/// The `#status` text of a zoom: `zoom 120%`, `zoom 195% (fit to width)`.
pub fn zoom_status(z: f64, how: Option<&str>) -> String {
    match how {
        Some(h) => format!("zoom {}% ({h})", percent(z)),
        None => format!("zoom {}%", percent(z)),
    }
}

/// Whole percent, for texts.
pub fn percent(z: f64) -> i32 {
    (z * 100.0).round() as i32
}

/// The custom property's value (`"1.2"`, `"0.25"`, `"5"`) — plain decimal, no exponent.
pub fn css_zoom(z: f64) -> String {
    format!("{}", (z * 100.0).round() / 100.0)
}

enum Fit {
    Width,
    Page,
}

impl Fit {
    fn text(self) -> &'static str {
        match self {
            Fit::Width => FIT_WIDTH_TEXT,
            Fit::Page => FIT_PAGE_TEXT,
        }
    }
}

// ── the host (wasm only) ──────────────────────────────────────────────────────────────────────

/// What the fit modes measure: the `.pages` container (its client box) and the first `.page`
/// (its RENDERED box — the CSS zoom is already in it, hence the division by the current zoom).
struct Area {
    container_w: f64,
    container_h: f64,
    page_w: f64,
    page_h: f64,
}

fn measure() -> Result<Area, String> {
    let doc = web_sys::window()
        .and_then(|w| w.document())
        .ok_or("no document")?;
    let query = |sel: &str| -> Result<HtmlElement, String> {
        doc.query_selector(sel)
            .map_err(|e| format!("query {sel}: {e:?}"))?
            .ok_or_else(|| format!("no {sel} element"))?
            .dyn_into::<HtmlElement>()
            .map_err(|_| format!("{sel} is not an element"))
    };
    let pages = query(".pages")?;
    let page = query(".page")?;
    let r = page.get_bounding_client_rect();
    Ok(Area {
        container_w: pages.client_width() as f64,
        container_h: pages.client_height() as f64,
        page_w: r.width(),
        page_h: r.height(),
    })
}

fn document_root() -> Result<HtmlElement, String> {
    web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.document_element())
        .ok_or("no document root")?
        .dyn_into::<HtmlElement>()
        .map_err(|_| "the document root is not an element".into())
}

fn document_body() -> Result<HtmlElement, String> {
    web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.body())
        .ok_or_else(|| "no document body".to_string())
}

/// The one line that scales the page (`.page { zoom: var(--wo-zoom, 1) }`).
fn write_dom_zoom(z: f64) -> Result<(), String> {
    document_root()?
        .style()
        .set_property(ZOOM_PROPERTY, &css_zoom(z))
        .map_err(|e| format!("the browser refused the zoom property: {e:?}"))
}

/// The factor currently applied to the document root (1.0 when none was set).
fn dom_zoom() -> f64 {
    document_root()
        .ok()
        .and_then(|r| r.style().get_property_value(ZOOM_PROPERTY).ok())
        .and_then(|v| v.trim().parse::<f64>().ok())
        .map(clamp_zoom)
        .unwrap_or(1.0)
}

// ── the panel ─────────────────────────────────────────────────────────────────────────────────

/// Hosts the zoom state and shows the factor (Word's status-bar zoom). Fixed in a corner of the
/// document area, `pointer-events: none` — it takes no layout room and no clicks.
#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    // A signal can only be created inside the reactive tree: this is the one place.
    let zoom = RwSignal::new(dom_zoom());
    ZOOM.with(|c| c.set(Some(zoom)));
    let _ = &ui; // host-side only: no engine call, the document never changes
    view! {
        <div class="ops-panel" id="ops-view" title="Zoom (View tab)" aria-label=move || zoom_status(zoom.get(), None)>
            <span class="zoom-readout">{move || format!("{}%", percent(zoom.get()))}</span>
        </div>
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tenth(z: f64) -> f64 {
        (z * 100.0).round()
    }

    fn on_ten_percent_grid(z: f64) -> bool {
        tenth(z) % 10.0 == 0.0
    }

    #[test]
    fn zoom_in_steps_ten_points_along_the_grid() {
        let a = step_zoom(1.0, 1.0);
        let b = step_zoom(a, 1.0);
        assert_eq!(zoom_status(a, None), "zoom 110%");
        assert_eq!(zoom_status(b, None), "zoom 120%");
        assert!(on_ten_percent_grid(a) && on_ten_percent_grid(b));
        // a fit factor (off the 10% grid) still steps by exactly ten points
        assert_eq!(zoom_status(step_zoom(1.95, 1.0), None), "zoom 205%");
    }

    #[test]
    fn zoom_out_from_200_is_100_after_ten_steps_with_no_drift() {
        let mut z = 2.0;
        for _ in 0..10 {
            z = step_zoom(z, -1.0);
            assert!(on_ten_percent_grid(z), "{z}");
        }
        assert_eq!(tenth(z), 100.0);
    }

    #[test]
    fn zoom_out_clamps_at_25_percent() {
        let mut z = 1.0;
        for _ in 0..10 {
            z = step_zoom(z, -1.0);
        }
        assert_eq!(zoom_status(z, None), "zoom 25%");
        assert_eq!(zoom_status(step_zoom(z, -1.0), None), "zoom 25%");
        // 30% - 10 points lands below the floor: clamped, not 20%
        assert_eq!(zoom_status(step_zoom(0.30, -1.0), None), "zoom 25%");
        // back in: ten points up from the clamped floor
        assert_eq!(zoom_status(step_zoom(z, 1.0), None), "zoom 35%");
    }

    #[test]
    fn zoom_in_clamps_at_500_percent() {
        assert_eq!(zoom_status(step_zoom(5.0, 1.0), None), "zoom 500%");
        assert_eq!(zoom_status(step_zoom(4.95, 1.0), None), "zoom 500%");
        let mut z = 1.0;
        for _ in 0..60 {
            z = step_zoom(z, 1.0);
        }
        assert_eq!(zoom_status(z, None), "zoom 500%");
    }

    #[test]
    fn stepping_round_trips_through_the_grid() {
        let mut z = 1.0;
        // seven steps reach 30% (the floor is the next one), seven come back to exactly 100%
        for _ in 0..7 {
            z = step_zoom(z, -1.0);
        }
        assert_eq!(tenth(z), 30.0);
        for _ in 0..7 {
            z = step_zoom(z, 1.0);
        }
        assert_eq!(tenth(z), 100.0);
        assert_eq!(clamp_zoom(1.0000000000000002), 1.0);
        assert_eq!(clamp_zoom(0.30000000000000004), 0.3);
    }

    #[test]
    fn fit_to_width_fills_the_container_minus_the_margin() {
        // A4 at 100%: 793 px wide in a 1600 px container → 1552 / 793 = 1.957 → snapped down
        assert_eq!(fit_to_width(1600.0, 793.0, 1.0), 1.95);
        assert_eq!(
            zoom_status(fit_to_width(1600.0, 793.0, 1.0), Some(FIT_WIDTH_TEXT)),
            "zoom 195% (fit to width)"
        );
        // the same page measured while zoomed to 25% (198.25 rendered px) gives the same answer
        assert_eq!(fit_to_width(1600.0, 198.25, 0.25), 1.95);
        assert_eq!(fit_to_width(1600.0, 1586.0, 2.0), 1.95);
    }

    #[test]
    fn fit_to_page_takes_the_smaller_of_width_and_height() {
        // 1600×800 container: the height (752 / 1123 = 0.669) limits
        assert_eq!(fit_to_page(1600.0, 793.0, 800.0, 1123.0, 1.0), 0.66);
        // a tall container: the width limits, same as fit-to-width
        assert_eq!(fit_to_page(1600.0, 793.0, 3000.0, 1123.0, 1.0), 1.95);
        // zoom-independent (rendered sizes at 50%)
        assert_eq!(fit_to_page(1600.0, 396.5, 800.0, 561.5, 0.5), 0.66);
    }

    #[test]
    fn fit_never_overflows_and_stays_in_range() {
        for (cw, ch) in [
            (1600.0, 800.0),
            (1024.0, 700.0),
            (600.0, 500.0),
            (793.0, 1123.0),
        ] {
            let zw = fit_to_width(cw, 793.0, 1.0);
            let zp = fit_to_page(cw, 793.0, ch, 1123.0, 1.0);
            assert!(zw * 793.0 <= cw - FIT_MARGIN + 1e-9, "{cw}: {zw}");
            assert!(zp * 1123.0 <= ch - FIT_MARGIN + 1e-9, "{ch}: {zp}");
            assert!(zp <= zw);
        }
        // a container narrower than the margin or a huge one: clamped
        assert_eq!(fit_to_width(100.0, 793.0, 1.0), MIN_ZOOM);
        assert_eq!(fit_to_width(100_000.0, 793.0, 1.0), MAX_ZOOM);
        assert_eq!(
            fit_to_page(100_000.0, 793.0, 100_000.0, 1123.0, 1.0),
            MAX_ZOOM
        );
    }

    #[test]
    fn fit_survives_degenerate_measurements() {
        // no page measured (0 px) or a zero zoom: the view is left alone (100%)
        assert_eq!(fit_to_width(1600.0, 0.0, 1.0), 1.0);
        assert_eq!(fit_to_page(1600.0, 793.0, 800.0, 1123.0, 0.0), 1.0);
    }

    #[test]
    fn status_and_css_texts() {
        assert_eq!(zoom_status(1.2, None), "zoom 120%");
        assert_eq!(zoom_status(0.25, None), "zoom 25%");
        assert_eq!(
            zoom_status(0.66, Some(FIT_PAGE_TEXT)),
            "zoom 66% (fit to page)"
        );
        assert_eq!(percent(5.0), 500);
        assert_eq!(css_zoom(1.2), "1.2");
        assert_eq!(css_zoom(0.25), "0.25");
        assert_eq!(css_zoom(1.95), "1.95");
        assert_eq!(css_zoom(5.0), "5");
    }

    #[test]
    fn owned_commands_are_dispatched() {
        for c in OWNED {
            assert!(owns(c), "{c} must be owned");
        }
        // the module does not touch the engine's names
        for c in ["bold", "fontSize", "undo", "cut", "selectAll"] {
            assert!(!owns(c), "{c} belongs to another module");
        }
    }
}
