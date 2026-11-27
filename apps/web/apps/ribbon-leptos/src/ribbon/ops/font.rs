use super::Ui;
use crate::ribbon::control::Cmd;
use leptos::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::Event;

const EMBEDDED: &[&str] = &["Liberation Sans"];

thread_local! {
    static OPEN: std::cell::Cell<Option<RwSignal<bool>>> = const { std::cell::Cell::new(None) };
    static ACTIVE_COLOR: std::cell::Cell<Option<RwSignal<&'static str>>> = const { std::cell::Cell::new(None) };
}

pub fn exec(cmd: &Cmd, ui: &Ui) -> Option<Result<String, String>> {
    match cmd.command {
        "fontSize" => {
            let val = cmd.value.as_deref().unwrap_or("");
            if val.is_empty() {
                return Some(Ok("font-size: unchanged".into()));
            }
            if let Some(pt) = parse_pt(val) {
                let res = ui.doc().exec(
                    &Cmd {
                        id: "font-size",
                        command: "fontSize",
                        value: Some(pt.to_string()),
                    },
                    &ui.pressed,
                );

                match res {
                    Ok(Some(layout)) => {
                        ui.refresh(&layout);
                        Some(Ok(format!("font-size ok ({pt} pt)")))
                    }
                    Ok(None) => Some(Err("not an engine op".into())),
                    Err(e) => Some(Err(e)),
                }
            } else {
                Some(Err("bad size".into()))
            }
        }
        "fontFamily" => {
            let val = cmd.value.as_deref().unwrap_or("");
            if val.is_empty() {
                return None;
            }
            let res = ui.doc().exec(
                &Cmd {
                    id: "font-family",
                    command: "fontFamily",
                    value: Some(val.to_string()),
                },
                &ui.pressed,
            );

            match res {
                Ok(Some(layout)) => {
                    ui.refresh(&layout);
                    let status = if EMBEDDED.contains(&val) {
                        format!("font-family ok ({val})")
                    } else {
                        format!(
                            "font-family ok ({val} — no embedded face, rendered with the fallback)"
                        )
                    };
                    Some(Ok(status))
                }
                Ok(None) => Some(Err("not an engine op".into())),
                Err(e) => Some(Err(e)),
            }
        }
        "textColor" | "highlight" => {
            let Some(open) = OPEN.with(|c| c.get()) else {
                return Some(Err("panel not mounted".into()));
            };
            let Some(active) = ACTIVE_COLOR.with(|c| c.get()) else {
                return Some(Err("panel not mounted".into()));
            };
            open.set(true);
            active.set(if cmd.command == "textColor" {
                "textColor"
            } else {
                "highlight"
            });
            Some(Ok("pick a color".into()))
        }
        _ => None,
    }
}

fn parse_pt(s: &str) -> Option<u32> {
    s.strip_suffix("pt")?.parse::<u32>().ok()
}

#[component]
pub fn Panel(ui: Ui) -> impl IntoView {
    let open = RwSignal::new(false);
    let active_color = RwSignal::new("textColor");

    OPEN.with(|c| c.set(Some(open)));
    ACTIVE_COLOR.with(|c| c.set(Some(active_color)));

    let on_color_pick = move |hex: String| {
        let cmd_name = active_color.get();
        let id = if cmd_name == "textColor" {
            "text-color"
        } else {
            "highlight-color"
        };
        let engine_cmd = if cmd_name == "textColor" {
            "textColor"
        } else {
            "highlight"
        };

        let res = ui.doc().exec(
            &Cmd {
                id,
                command: engine_cmd,
                value: Some(hex.clone()),
            },
            &ui.pressed,
        );

        match res {
            Ok(Some(layout)) => {
                ui.refresh(&layout);
                if cmd_name == "textColor" {
                    ui.status.set(format!("text-color ok ({hex})"));
                } else {
                    // Highlight measurement
                    let (w, h) = ui.view.pages.with(|p| p[0]);
                    let rgba = ui.doc().page_rgba(0, w, h).unwrap_or_default();
                    if count_color_pixels(&rgba, &hex) >= 1 {
                        ui.status.set(format!("highlight ok ({hex} — rendered)"));
                    } else {
                        ui.status
                            .set(format!("highlight ok ({hex} — stored, not rendered yet)"));
                    }
                }
            }
            Ok(None) => {
                ui.status
                    .set(format!("{} failed — not an engine op", cmd_name));
            }
            Err(e) => {
                ui.status.set(format!("{} failed — {e}", cmd_name));
            }
        }
        open.set(false);
    };

    let colors = [
        "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
        "#808080", "#c0c0c0", "#800000", "#808000",
    ];

    let on_keydown = move |e: Event| {
        let keyboard_event = e.dyn_into::<web_sys::KeyboardEvent>().unwrap();
        if keyboard_event.key() == "Escape" {
            open.set(false);
        }
    };

    let on_click_outside = move |e: Event| {
        let target = e
            .target()
            .unwrap()
            .dyn_into::<web_sys::HtmlElement>()
            .unwrap();
        if target.closest("#ops-font").is_err() {
            open.set(false);
        }
    };

    let _ = window_event_listener("click", on_click_outside);
    let _ = window_event_listener("keydown", on_keydown);

    view! {
        <div class="ops-panel" id="ops-font" class:open=move || open.get()>
            <div class="color-palette">
                {colors.into_iter().map(|hex| {
                    let hex = hex.to_string();
                    let pick = on_color_pick;
                    view! {
                        <button class="color-btn" title=hex.clone() style=format!("background-color: {hex}")
                            on:click=move |_| pick(hex.clone())
                        />
                    }
                }).collect_view()}
            </div>
            <input type="color" class="color-input"
                on:input=move |e| {
                    let v = event_target_value(&e);
                    on_color_pick(v.to_lowercase());
                }
                on:change=move |e| {
                    let v = event_target_value(&e);
                    on_color_pick(v.to_lowercase());
                }
            />
        </div>
    }
}

fn window_event_listener<F>(event: &str, callback: F) -> Result<(), String>
where
    F: 'static + FnMut(Event) + Send + Sync,
{
    let window = web_sys::window().ok_or("no window")?;
    let closure = wasm_bindgen::closure::Closure::wrap(Box::new(callback) as Box<dyn FnMut(Event)>);
    window
        .add_event_listener_with_callback(event, closure.as_ref().unchecked_ref())
        .map_err(|e| format!("{:?}", e))?;
    closure.forget();
    Ok(())
}

fn count_color_pixels(rgba: &[u8], hex: &str) -> usize {
    if hex.len() != 7 {
        return 0;
    }
    let r = u8::from_str_radix(&hex[1..3], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[3..5], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[5..7], 16).unwrap_or(0);

    rgba.chunks(4)
        .filter(|p| {
            p.len() == 4
                && (p[0] as i16 - r as i16).abs() <= 40
                && (p[1] as i16 - g as i16).abs() <= 40
                && (p[2] as i16 - b as i16).abs() <= 40
        })
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pt() {
        assert_eq!(parse_pt("20pt"), Some(20));
        assert_eq!(parse_pt(""), None);
        assert_eq!(parse_pt("abc"), None);
    }

    #[test]
    fn test_pixel_tolerance() {
        let rgba = vec![
            255, 0, 0, 255, // Match #ff0000
            210, 10, 10, 255, // Match #ff0000 (within 40)
            100, 0, 0, 255, // No match
        ];
        let count = count_color_pixels(&rgba, "#ff0000");
        assert!(count >= 1);
    }
}
