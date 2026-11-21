//! Tuneshift desktop shell (Tauri 2). Audio always plays in the main window's webview; the mini
//! player and the game overlay are controllers synced through events. Windows-only APIs (SMTC,
//! WebView2 permissions) are behind `#[cfg(windows)]` so the crate checks on any OS.

mod b64;
mod commands;
mod discord;
mod scan;
mod smtc;
mod tray;
#[cfg(windows)]
mod webview_perm;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WindowEvent};

/// Preferences mirrored from the web app's settings (see `commands::set_prefs`).
pub struct Prefs {
    pub close_to_tray: AtomicBool,
}

pub(crate) fn show_main<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch (file association, deep link) focuses this instance.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            show_main(app);
            let _ = app.emit_to("main", "ts://second-instance", args);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["overlay"])
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Prefs {
            close_to_tray: AtomicBool::new(true),
        })
        .manage(discord::DiscordState::default())
        .setup(|app| {
            tray::create(app.handle())?;
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Registers tuneshift:// for dev runs; the installer registers it for release builds.
                let _ = app.deep_link().register_all();
            }
            if let Some(main) = app.get_webview_window("main") {
                #[cfg(windows)]
                webview_perm::auto_allow_media(&main);
                if std::env::args().any(|a| a == "--minimized") {
                    let _ = main.hide();
                }
            }
            if let Some(overlay) = app.get_webview_window("overlay") {
                // The overlay must never take clicks or focus away from a game.
                let _ = overlay.set_ignore_cursor_events(true);
                commands::place_overlay(&overlay, "top-center");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let to_tray = window.state::<Prefs>().close_to_tray.load(Ordering::Relaxed);
                if to_tray {
                    // Hide, never destroy: playback lives in this webview.
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_prefs,
            commands::launch_args,
            commands::set_window_visible,
            commands::toggle_window,
            commands::mini_snap,
            commands::overlay_config,
            commands::quit,
            tray::update_tray,
            scan::scan_folder,
            scan::allow_asset_dir,
            scan::allow_asset_file,
            smtc::smtc_current,
            smtc::smtc_control,
            discord::discord_update,
            discord::discord_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tuneshift");
}
