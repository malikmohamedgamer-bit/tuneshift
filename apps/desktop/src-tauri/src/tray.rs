//! System tray: transport, current song, preset submenu, mini player / overlay / Boost toggles.

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Wry,
};

use crate::show_main;

/// Built-in presets offered in the tray (id, label) — ids match the web app's preset ids.
pub const TRAY_PRESETS: [(&str, &str); 8] = [
    ("normal", "Normal"),
    ("bass-boosted", "Bass Boosted"),
    ("sped-up", "Sped Up"),
    ("sped-up-bass", "Sped Up + Bass"),
    ("nightcore", "Nightcore"),
    ("slowed-reverb", "Slowed + Reverb"),
    ("8d", "8D Audio"),
    ("club", "Club"),
];

pub struct TrayState {
    now: MenuItem<Wry>,
    play: MenuItem<Wry>,
    mini: CheckMenuItem<Wry>,
    overlay: CheckMenuItem<Wry>,
    boost: CheckMenuItem<Wry>,
}

#[derive(Serialize, Clone)]
struct TrayCommand<'a> {
    action: &'a str,
}

/// Menu ids the web app understands (see platform/tauri.ts).
pub fn action_for(id: &str) -> Option<&str> {
    match id {
        "play" | "next" | "prev" | "toggle-mini" | "toggle-overlay" | "toggle-boost" => Some(id),
        _ if id.starts_with("preset:") => Some(id),
        _ => None,
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let now = MenuItem::with_id(app, "now", "Nothing playing", false, None::<&str>)?;
    let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", "Previous", true, None::<&str>)?;
    let preset_items = TRAY_PRESETS
        .iter()
        .map(|(id, label)| MenuItem::with_id(app, format!("preset:{id}"), *label, true, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let preset_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = preset_items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<Wry>)
        .collect();
    let presets = Submenu::with_id_and_items(app, "presets", "Sound preset", true, &preset_refs)?;
    let show = MenuItem::with_id(app, "show", "Show Tuneshift", true, None::<&str>)?;
    let mini = CheckMenuItem::with_id(app, "toggle-mini", "Mini player", true, false, None::<&str>)?;
    let overlay = CheckMenuItem::with_id(app, "toggle-overlay", "Game overlay", true, true, None::<&str>)?;
    let boost = CheckMenuItem::with_id(app, "toggle-boost", "Boost mode", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Tuneshift", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &now, &sep1, &play, &next, &prev, &presets, &sep2, &show, &mini, &overlay, &boost, &sep3, &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Tuneshift")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "show" => show_main(app),
            id => {
                if let Some(action) = action_for(id) {
                    let _ = app.emit_to("main", "ts://command", TrayCommand { action });
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(TrayState {
        now,
        play,
        mini,
        overlay,
        boost,
    });
    Ok(())
}

/// Keep the tray in sync with the player (called by the web app on changes).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_tray(
    app: AppHandle,
    state: State<'_, TrayState>,
    title: Option<String>,
    artist: Option<String>,
    playing: bool,
    mini_visible: bool,
    overlay_on: bool,
    boost: bool,
) -> Result<(), String> {
    let label = match (title, artist) {
        (Some(t), Some(a)) if !a.is_empty() => format!("{t} — {a}"),
        (Some(t), _) => t,
        _ => "Nothing playing".to_string(),
    };
    let short: String = label.chars().take(60).collect();
    state.now.set_text(&short).map_err(|e| e.to_string())?;
    state
        .play
        .set_text(if playing { "Pause" } else { "Play" })
        .map_err(|e| e.to_string())?;
    let _ = state.mini.set_checked(mini_visible);
    let _ = state.overlay.set_checked(overlay_on);
    let _ = state.boost.set_checked(boost);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("Tuneshift — {short}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{action_for, TRAY_PRESETS};

    #[test]
    fn forwards_only_known_actions() {
        assert_eq!(action_for("play"), Some("play"));
        assert_eq!(action_for("preset:nightcore"), Some("preset:nightcore"));
        assert_eq!(action_for("toggle-boost"), Some("toggle-boost"));
        assert_eq!(action_for("quit"), None);
        assert_eq!(action_for("rm -rf"), None);
    }

    #[test]
    fn tray_presets_are_the_first_eight() {
        assert_eq!(TRAY_PRESETS.len(), 8);
        assert_eq!(TRAY_PRESETS[0].0, "normal");
        assert_eq!(TRAY_PRESETS[7].1, "Club");
    }
}
